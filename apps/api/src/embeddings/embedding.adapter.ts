import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'

export type EmbeddingSettings = {
  provider: 'local' | 'mock'
  model: string
  revision: string
  dimensions: number
  cacheEnabled: boolean
  vectorCacheDir: string
  modelCacheDir: string
}

type Encoder = (role: 'query' | 'document', text: string) => Promise<number[]>
type CachedEncoder = { encoder: Promise<FeatureExtractionPipeline> }
type CachedVector = { vector: number[] }

export class EmbeddingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
  }
}

const models = new Map<string, CachedEncoder>()
const vectors = new Map<string, number[]>()
export const EMBEDDING_PIPELINE_VERSION =
  'query-prefix-v1:mean-pooling:normalized-v1:content-only-v1'

export function embeddingCacheKey(
  settings: EmbeddingSettings,
  role: 'query' | 'document',
  text: string,
) {
  return createHash('sha256')
    .update(
      `${settings.provider}\n${settings.model}\n${settings.revision}\n${EMBEDDING_PIPELINE_VERSION}\n${settings.dimensions}\n${role}\n${text}`,
    )
    .digest('hex')
}

export function createEmbeddingEncoder(settings: EmbeddingSettings): Encoder {
  if (!Number.isInteger(settings.dimensions) || settings.dimensions !== 384)
    throw new EmbeddingError('EMBEDDING_CONFIG_INVALID', 'EMBEDDING_DIMENSIONS must be 384')
  return async (role, text) => {
    const key = embeddingCacheKey(settings, role, text)
    const memoryCached = vectors.get(key)
    if (memoryCached) return memoryCached
    const cacheFile = join(settings.vectorCacheDir, `${key}.json`)
    if (settings.cacheEnabled) {
      let cachedContents: string | undefined
      try {
        cachedContents = await readFile(cacheFile, 'utf8')
      } catch (error) {
        if (!isMissingFile(error))
          throw new EmbeddingError(
            'EMBEDDING_CACHE_READ_FAILED',
            'The embedding cache could not be read. Check cache directory permissions.',
            false,
          )
      }
      if (cachedContents !== undefined) {
        try {
          const cached = JSON.parse(cachedContents) as CachedVector
          if (isValidVector(cached.vector, settings.dimensions)) {
            vectors.set(key, cached.vector)
            return cached.vector
          }
        } catch {
          // A corrupt cache entry is regenerated from the source text.
        }
      }
    }

    const input =
      role === 'query' ? `Represent this sentence for searching relevant passages: ${text}` : text
    const vector =
      settings.provider === 'mock'
        ? mockVector(input, settings.dimensions)
        : await retryEmbeddingOperation(() => localVector(settings, input))
    if (!isValidVector(vector, settings.dimensions))
      throw new EmbeddingError(
        'EMBEDDING_OUTPUT_INVALID',
        'The embedding model returned an invalid vector.',
      )
    if (settings.cacheEnabled) await writeVectorCache(cacheFile, vector)
    vectors.set(key, vector)
    return vector
  }
}

export async function retryEmbeddingOperation<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof EmbeddingError) || !error.retryable || attempt === 2) throw error
    }
  }
  throw new Error('Unreachable embedding retry state')
}

async function writeVectorCache(file: string, vector: number[]) {
  try {
    await mkdir(dirname(file), { recursive: true })
    const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryFile, JSON.stringify({ vector } satisfies CachedVector))
      await rename(temporaryFile, file)
    } catch {
      await unlink(temporaryFile).catch(() => undefined)
      throw new EmbeddingError(
        'EMBEDDING_CACHE_WRITE_FAILED',
        'The embedding cache could not be saved. Check cache directory permissions.',
      )
    }
  } catch (error) {
    if (error instanceof EmbeddingError) throw error
    throw new EmbeddingError(
      'EMBEDDING_CACHE_WRITE_FAILED',
      'The embedding cache could not be saved. Check cache directory permissions.',
    )
  }
}

async function localVector(settings: EmbeddingSettings, text: string): Promise<number[]> {
  const key = `${settings.modelCacheDir}\n${settings.model}\n${settings.revision}\nfp32\ncpu`
  let cached = models.get(key)
  if (!cached) {
    const encoder = import('@huggingface/transformers').then(({ env, pipeline }) => {
      env.cacheDir = settings.modelCacheDir
      return pipeline('feature-extraction', settings.model, {
        dtype: 'fp32',
        device: 'cpu',
        revision: settings.revision,
      })
    })
    cached = { encoder }
    models.set(key, cached)
  }
  let model: FeatureExtractionPipeline
  try {
    model = await cached.encoder
  } catch {
    if (models.get(key) === cached) models.delete(key)
    throw new EmbeddingError(
      'EMBEDDING_MODEL_LOAD_FAILED',
      'The local embedding model could not be loaded. Check model availability and retry.',
      true,
    )
  }
  try {
    const output = await model([text], { pooling: 'mean', normalize: true })
    return (output.tolist() as number[][])[0]
  } catch {
    throw new EmbeddingError(
      'EMBEDDING_INFERENCE_FAILED',
      'The local embedding model could not encode the curriculum text.',
      true,
    )
  }
}

function mockVector(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0)
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let hash = 2166136261
    for (const character of token) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
    vector[(hash >>> 0) % dimensions] += (hash & 1) === 0 ? 1 : -1
  }
  const norm = Math.hypot(...vector) || 1
  return vector.map((value) => value / norm)
}

function isValidVector(value: unknown, dimensions: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === dimensions &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function isMissingFile(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
