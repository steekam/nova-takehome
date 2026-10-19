import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chunks, getFixture } from './corpus.js'
import type { FixtureId } from './corpus.js'
import type { CorpusChunk } from './domain.js'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import { cachedPromise } from './promise-cache.js'
import { recordEmbeddingFailure, recordEmbeddingWork, withSpan } from './telemetry.js'
import { PlaygroundError } from './failure-report.js'

type CachedVector = { vector: number[] }
type FeatureExtractor = FeatureExtractionPipeline

const featureExtractors = new Map<string, Promise<FeatureExtractor>>()

export const EMBEDDING_REPRESENTATIONS = ['content-only', 'title-kind-content', 'title-kind-clean-content'] as const
export type EmbeddingRepresentation = (typeof EMBEDDING_REPRESENTATIONS)[number]
const DEFAULT_MODEL_REVISION = 'main'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}

function isTransient(error: unknown): boolean {
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : ''
  return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH'].includes(code)
    || /network|fetch failed|timed? ?out|connection reset/i.test(errorMessage(error))
}

function embeddingPipelineVersion(representation: EmbeddingRepresentation): string {
  return `query-prefix-v1:mean-pooling:normalized-v1:${representation}-v1`
}

export function embeddingDocumentText(chunk: CorpusChunk, representation: EmbeddingRepresentation): string {
  if (representation === 'content-only') return chunk.text
  const content = representation === 'title-kind-clean-content'
    ? chunk.text.replace(/^DEMO ONLY, SYNTHETIC [A-Z -]+: /, '')
    : chunk.text
  return `Title: ${chunk.title}\nResource type: ${chunk.kind}\n${content}`
}
export const SELECTED_RANKED_CHUNK_LIMIT = 6
export const EVALUATED_RANKED_CHUNK_LIMITS = [6, 8] as const

export type RetrievalResult = {
  selected: CorpusChunk[]
  ranked: Array<{ chunkId: string; score: number }>
  model: string
  modelRevision: string
  cacheHits: number
  cacheMisses: number
}

export type RankingResult = Pick<RetrievalResult, 'ranked' | 'model' | 'modelRevision' | 'cacheHits' | 'cacheMisses'> & {
  modelLoadMs: number
  modelPipelineCacheHit: boolean
}

export async function retryEmbeddingOperation<T>(
  operation: () => Promise<T>,
  onRetry?: (attempt: number, error: PlaygroundError) => void,
): Promise<{ result: T; attempts: number }> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return { result: await operation(), attempts: attempt }
    } catch (error) {
      if (!(error instanceof PlaygroundError) || !error.retryable || attempt === 2) throw error
      onRetry?.(attempt, error)
    }
  }
  throw new Error('Unreachable embedding retry state.')
}

export function embeddingCacheKey(provider: string, model: string, revision: string, pipelineVersion: string, role: string, text: string, dimensions: number): string {
  return createHash('sha256')
    .update(`${provider}\n${model}\n${revision}\n${pipelineVersion}\n${dimensions}\n${role}\n${text}`)
    .digest('hex')
}

function mockVector(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0)
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let hash = 2166136261
    for (const character of token) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
    const index = (hash >>> 0) % vector.length
    vector[index] += (hash & 1) === 0 ? 1 : -1
  }
  const length = Math.hypot(...vector) || 1
  return vector.map((value) => value / length)
}

async function vectorsFor(
  rows: Array<{ role: string; text: string }>,
  provider: string,
  model: string,
  revision: string,
  cacheDir: string,
  dimensions: number,
  cacheEnabled: boolean,
  pipelineVersion: string,
): Promise<{ vectors: number[][]; hits: number; misses: number; modelLoadMs: number; modelLoadCacheHit: boolean }> {
  const files = rows.map(({ role, text }) => path.join(cacheDir, `${embeddingCacheKey(provider, model, revision, pipelineVersion, role, text, dimensions)}.json`))
  const vectors: Array<number[] | undefined> = new Array(rows.length)
  const missing: number[] = []
  let modelLoadMs = 0
  let modelLoadCacheHit = false

  if (cacheEnabled) {
    for (let index = 0; index < files.length; index += 1) {
      try {
        const cached = JSON.parse(await readFile(files[index], 'utf8')) as CachedVector
        if (!isValidVector(cached.vector, dimensions)) throw new Error('Invalid cached embedding vector')
        vectors[index] = cached.vector
      } catch {
        missing.push(index)
      }
    }
  } else {
    missing.push(...rows.map((_, index) => index))
  }

  if (missing.length > 0) {
    let generated: number[][]
    if (provider === 'mock') {
      generated = missing.map((index) => mockVector(rows[index].text, dimensions))
    } else {
      let extractor: FeatureExtractor
      try {
        const { env, pipeline } = await import('@huggingface/transformers')
        const transformersCacheDir = path.resolve(process.env.TRANSFORMERS_CACHE_DIR ?? '.cache/transformers')
        env.cacheDir = transformersCacheDir
        const key = `${transformersCacheDir}\n${model}\n${revision}\nfp32\ncpu`
        const startedAt = performance.now()
        const cached = cachedPromise(featureExtractors, key, () => pipeline('feature-extraction', model, { dtype: 'fp32', device: 'cpu', revision }))
        modelLoadCacheHit = cached.cached
        extractor = await cached.promise
        if (!cached.cached) modelLoadMs = performance.now() - startedAt
      } catch (error) {
        throw new PlaygroundError('EMBEDDING_MODEL_LOAD_FAILED', 'retrieval_embedding', `Could not load embedding model ${model}: ${errorMessage(error)}`, isTransient(error))
      }
      const inputTexts = missing.map((index) => rows[index].role === 'query'
        ? `Represent this sentence for searching relevant passages: ${rows[index].text}`
        : rows[index].text)
      try {
        const output = await extractor(inputTexts, { pooling: 'mean', normalize: true })
        generated = output.tolist() as number[][]
      } catch (error) {
        throw new PlaygroundError('EMBEDDING_INFERENCE_FAILED', 'retrieval_embedding', `Embedding inference failed: ${errorMessage(error)}`, isTransient(error))
      }
    }

    if (generated.length !== missing.length || generated.some((vector) => !isValidVector(vector, dimensions))) {
      throw new PlaygroundError('EMBEDDING_OUTPUT_INVALID', 'retrieval_embedding', `Embedding provider returned invalid vectors: expected ${missing.length} vectors of ${dimensions} finite values each`)
    }

    if (cacheEnabled) {
      try {
        await mkdir(cacheDir, { recursive: true })
      } catch (error) {
        throw new PlaygroundError('EMBEDDING_CACHE_WRITE_FAILED', 'retrieval_embedding', `Could not create embedding cache: ${errorMessage(error)}`)
      }
    }
    for (let position = 0; position < missing.length; position += 1) {
      const index = missing[position]
      vectors[index] = generated[position]
      if (cacheEnabled) {
        const temporaryFile = `${files[index]}.${process.pid}.${randomUUID()}.tmp`
        try {
          await writeFile(temporaryFile, JSON.stringify({ vector: generated[position] } satisfies CachedVector))
          await rename(temporaryFile, files[index])
        } catch (error) {
          await unlink(temporaryFile).catch(() => undefined)
          throw new PlaygroundError('EMBEDDING_CACHE_WRITE_FAILED', 'retrieval_embedding', `Could not persist embedding cache: ${errorMessage(error)}`)
        }
      }
    }
  }

  return {
    vectors: vectors.map((vector) => vector as number[]),
    hits: rows.length - missing.length,
    misses: missing.length,
    modelLoadMs,
    modelLoadCacheHit,
  }
}

function isValidVector(value: unknown, dimensions: number): value is number[] {
  return Array.isArray(value)
    && value.length === dimensions
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

function cosine(left: number[], right: number[]): number {
  let dot = 0
  for (let index = 0; index < left.length; index += 1) dot += left[index] * right[index]
  return dot
}

export async function rankChunks(
  query: string,
  providerOverride?: 'local' | 'mock',
  representation: EmbeddingRepresentation = 'content-only',
  sourceChunks: CorpusChunk[] = chunks,
): Promise<RankingResult> {
  const provider = providerOverride ?? process.env.EMBEDDING_PROVIDER ?? 'local'
  const model = provider === 'mock' ? 'mock-hash-v1' : process.env.EMBEDDING_MODEL ?? 'Xenova/bge-small-en-v1.5'
  const modelRevision = provider === 'mock' ? 'v1' : process.env.EMBEDDING_MODEL_REVISION ?? DEFAULT_MODEL_REVISION
  const dimensions = Number(process.env.EMBEDDING_DIMENSIONS ?? '384')
  const cacheEnabled = process.env.EMBEDDING_CACHE_ENABLED !== 'false'
  const cacheDir = path.resolve(process.env.EMBEDDING_CACHE_DIR ?? '.cache/embeddings')
  const pipelineVersion = embeddingPipelineVersion(representation)
  const rows = [
    { role: 'query', text: query },
    ...sourceChunks.map((chunk) => ({ role: 'document', text: embeddingDocumentText(chunk, representation) })),
  ]
  const startedAt = performance.now()
  const result = await withSpan('playground.embedding.encode', {
    'playground.embedding.model': model,
    'playground.embedding.model_revision': modelRevision,
    'playground.embedding.provider': provider,
    'playground.embedding.dimensions': dimensions,
    'playground.embedding.input_count': rows.length,
    'playground.embedding.cache_enabled': cacheEnabled,
    'playground.embedding.representation': representation,
  }, async (span) => {
    let result: Awaited<ReturnType<typeof vectorsFor>>
    try {
      if (!Number.isInteger(dimensions) || dimensions <= 0) {
        throw new PlaygroundError('EMBEDDING_CONFIG_INVALID', 'retrieval_embedding', 'EMBEDDING_DIMENSIONS must be a positive integer')
      }
      const retried = await retryEmbeddingOperation(
        () => vectorsFor(rows, provider, model, modelRevision, cacheDir, dimensions, cacheEnabled, pipelineVersion),
        (attempt, error) => span.addEvent('playground.embedding.retry', {
          'playground.embedding.attempt': attempt + 1,
          'playground.error.code': error.code,
        }),
      )
      result = retried.result
      span.setAttribute('playground.embedding.attempt_count', retried.attempts)
    } catch (error) {
      const classified = error instanceof PlaygroundError ? error : new PlaygroundError('EMBEDDING_ENCODE_FAILED', 'retrieval_embedding', `Embedding operation failed: ${errorMessage(error)}`)
      span.setAttributes({
        'playground.embedding.status': 'failed',
        'playground.error.code': classified.code,
        'playground.error.stage': classified.stage,
        'playground.error.retryable': classified.retryable,
      })
      recordEmbeddingFailure({
        model,
        modelRevision,
        provider,
        errorCode: classified.code,
        durationMs: performance.now() - startedAt,
      })
      throw classified
    }
    span.setAttribute('playground.embedding.status', 'success')
    span.setAttributes({
      'playground.embedding.cache_hits': result.hits,
      'playground.embedding.cache_misses': result.misses,
      'playground.embedding.elapsed_ms': Number((performance.now() - startedAt).toFixed(2)),
      'playground.embedding.model_load_ms': Number(result.modelLoadMs.toFixed(2)),
      'playground.embedding.model_cache_hit': result.modelLoadCacheHit,
    })
    recordEmbeddingWork({
      model,
      modelRevision,
      provider,
      durationMs: performance.now() - startedAt,
      modelLoadDurationMs: result.modelLoadMs,
      cacheHits: result.hits,
      cacheMisses: result.misses,
    })
    return result
  })
  const ranked = sourceChunks.map((chunk, index) => ({
    chunkId: chunk.id,
    score: cosine(result.vectors[0], result.vectors[index + 1]),
  })).sort((left, right) => right.score - left.score)

  return {
    ranked,
    model,
    modelRevision,
    cacheHits: result.hits,
    cacheMisses: result.misses,
    modelLoadMs: result.modelLoadMs,
    modelPipelineCacheHit: result.modelLoadCacheHit,
  }
}

export async function retrieve(providerOverride?: 'local' | 'mock', fixtureId: FixtureId = 'particles'): Promise<RetrievalResult> {
  const fixture = getFixture(fixtureId)
  const ranking = await rankChunks(fixture.retrievalQuery, providerOverride, 'content-only', fixture.chunks)
  const ranked = ranking.ranked
  return {
    selected: selectRankedChunks(ranked, SELECTED_RANKED_CHUNK_LIMIT, fixtureId),
    ranked,
    model: ranking.model,
    modelRevision: ranking.modelRevision,
    cacheHits: ranking.cacheHits,
    cacheMisses: ranking.cacheMisses,
  }
}

export function selectRankedChunks(
  ranked: RankingResult['ranked'],
  topK = SELECTED_RANKED_CHUNK_LIMIT,
  fixtureId: FixtureId = 'particles',
): CorpusChunk[] {
  const fixture = getFixture(fixtureId)
  const fixtureChunks = fixture.chunks
  const target = fixtureChunks.find((chunk) => chunk.kind === 'curriculum_target')!
  const leadGuidance = fixtureChunks.filter((chunk) => chunk.kind === 'lead_guidance')
  const requiredEvidence = [
    fixture.citationEvidence.lessonFocusChunkId,
    fixture.citationEvidence.assessmentChunkId,
  ].map((id) => fixtureChunks.find((chunk) => chunk.id === id)!)
  const pinned = [target, ...leadGuidance, ...requiredEvidence]
  const pinnedIds = new Set(pinned.map(({ id }) => id))
  if (pinnedIds.size > topK) throw new PlaygroundError('RETRIEVAL_CONFIG_INVALID', 'retrieval', `Required context has ${pinnedIds.size} chunks, exceeding the selection cap of ${topK}.`)
  const remainingLimit = Math.max(0, topK - pinnedIds.size)
  const relevant = ranked
    .filter(({ chunkId }) => !pinnedIds.has(chunkId))
    .slice(0, remainingLimit)
    .map(({ chunkId }) => fixtureChunks.find((chunk) => chunk.id === chunkId)!)
  return [...pinned, ...relevant]
}

export function retrievalRequest(fixtureId: FixtureId = 'particles'): string {
  const { scenario } = getFixture(fixtureId)
  return `${scenario.target} ${scenario.subject} ${scenario.grade}`
}
