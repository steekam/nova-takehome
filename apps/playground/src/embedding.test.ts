import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { FIXTURE_IDS, getFixture } from './corpus.js'
import { assertMinimumEvidenceCoverage, embeddingCacheKey, rankChunks, retrieve, retryEmbeddingOperation, selectRankedChunks } from './embedding.js'
import { PlaygroundError } from './failure-report.js'

test('embedding cache identity changes when provider or model revision changes', () => {
  const baseline = embeddingCacheKey('local', 'Xenova/bge-small-en-v1.5', 'ea104da', 'mean-pooling-v1', 'document', 'particles move', 384)
  assert.notEqual(embeddingCacheKey('local', 'Xenova/bge-small-en-v1.5', 'b72b547', 'mean-pooling-v1', 'document', 'particles move', 384), baseline)
  assert.notEqual(embeddingCacheKey('mock', 'Xenova/bge-small-en-v1.5', 'ea104da', 'mean-pooling-v1', 'document', 'particles move', 384), baseline)
})

test('mock embeddings are cached by pipeline and content', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'nova-embedding-cache-'))
  const previousCacheDir = process.env.EMBEDDING_CACHE_DIR
  const previousCacheEnabled = process.env.EMBEDDING_CACHE_ENABLED
  process.env.EMBEDDING_CACHE_DIR = cacheDir
  process.env.EMBEDDING_CACHE_ENABLED = 'true'

  try {
    const chunks = getFixture('particles').chunks.slice(0, 3)
    const first = await rankChunks('compare particle spacing', 'mock', 'content-only', chunks)
    const second = await rankChunks('compare particle spacing', 'mock', 'content-only', chunks)
    const changed = await rankChunks('compare particle spacing', 'mock', 'title-kind-content', chunks)

    assert.equal(first.cacheHits, 0)
    assert.equal(first.cacheMisses, chunks.length + 1)
    assert.equal(second.cacheHits, chunks.length + 1)
    assert.equal(second.cacheMisses, 0)
    assert.equal(changed.cacheMisses, chunks.length + 1)
    for (const fixtureId of FIXTURE_IDS) {
      const fixture = getFixture(fixtureId)
      const retrieval = await retrieve('mock', fixtureId)
      const selectedIds = new Set(retrieval.selected.map(({ id }) => id))
      assert.ok(retrieval.selected.length <= 6)
      assert.ok(fixture.chunks.filter(({ kind }) => kind === 'lead_guidance').every(({ id }) => selectedIds.has(id)))
      assert.ok(retrieval.selected.some(({ kind }) => kind === 'curriculum_target'))
      assert.ok(retrieval.selected.some(({ id }) => id === fixture.citationEvidence.lessonFocusChunkId))
      assert.ok(retrieval.selected.some(({ id }) => id === fixture.citationEvidence.mainActivityChunkId))
      assert.ok(retrieval.selected.some(({ id }) => id === fixture.citationEvidence.assessmentChunkId))
      assert.doesNotThrow(() => assertMinimumEvidenceCoverage(retrieval.selected, fixtureId))
      assert.throws(
        () => assertMinimumEvidenceCoverage(retrieval.selected.filter(({ id }) => id !== fixture.citationEvidence.lessonFocusChunkId), fixtureId),
        (error: unknown) => error instanceof PlaygroundError && error.code === 'RETRIEVAL_EVIDENCE_INSUFFICIENT',
      )
    }
    const fixture = getFixture('particles')
    assert.throws(
      () => selectRankedChunks(fixture.chunks.map(({ id }) => ({ chunkId: id, score: 0 })), 4, fixture.id),
      /exceeding the selection cap of 4/,
    )
  } finally {
    if (previousCacheDir === undefined) delete process.env.EMBEDDING_CACHE_DIR
    else process.env.EMBEDDING_CACHE_DIR = previousCacheDir
    if (previousCacheEnabled === undefined) delete process.env.EMBEDDING_CACHE_ENABLED
    else process.env.EMBEDDING_CACHE_ENABLED = previousCacheEnabled
    await rm(cacheDir, { recursive: true, force: true })
  }
})

test('invalid embedding dimensions return a classified retrieval error', async () => {
  const previousDimensions = process.env.EMBEDDING_DIMENSIONS
  process.env.EMBEDDING_DIMENSIONS = '0'
  try {
    await assert.rejects(rankChunks('particle spacing', 'mock'), (error: unknown) =>
      error instanceof PlaygroundError && error.code === 'EMBEDDING_CONFIG_INVALID' && error.stage === 'retrieval_embedding')
  } finally {
    if (previousDimensions === undefined) delete process.env.EMBEDDING_DIMENSIONS
    else process.env.EMBEDDING_DIMENSIONS = previousDimensions
  }
})

test('embedding retries one transient failure and stops after the second attempt', async () => {
  let attempts = 0
  const retried = await retryEmbeddingOperation(async () => {
    attempts += 1
    if (attempts === 1) throw new PlaygroundError('EMBEDDING_MODEL_LOAD_FAILED', 'retrieval_embedding', 'Network timeout.', true)
    return 'loaded'
  })
  assert.equal(retried.result, 'loaded')
  assert.equal(retried.attempts, 2)

  attempts = 0
  await assert.rejects(retryEmbeddingOperation(async () => {
    attempts += 1
    throw new PlaygroundError('EMBEDDING_MODEL_LOAD_FAILED', 'retrieval_embedding', 'Network timeout.', true)
  }))
  assert.equal(attempts, 2)
})

test('embedding does not retry non-retryable cache failures', async () => {
  let attempts = 0
  await assert.rejects(retryEmbeddingOperation(async () => {
    attempts += 1
    throw new PlaygroundError('EMBEDDING_CACHE_WRITE_FAILED', 'retrieval_embedding', 'Permission denied.')
  }))
  assert.equal(attempts, 1)
})

test('an unwritable vector cache returns a classified persistence error', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nova-embedding-cache-'))
  const cacheFile = path.join(directory, 'file')
  await writeFile(cacheFile, 'not a directory')
  const previousCacheDir = process.env.EMBEDDING_CACHE_DIR
  const previousCacheEnabled = process.env.EMBEDDING_CACHE_ENABLED
  process.env.EMBEDDING_CACHE_DIR = cacheFile
  process.env.EMBEDDING_CACHE_ENABLED = 'true'
  try {
    await assert.rejects(rankChunks('particle spacing', 'mock'), (error: unknown) =>
      error instanceof PlaygroundError && error.code === 'EMBEDDING_CACHE_WRITE_FAILED')
  } finally {
    if (previousCacheDir === undefined) delete process.env.EMBEDDING_CACHE_DIR
    else process.env.EMBEDDING_CACHE_DIR = previousCacheDir
    if (previousCacheEnabled === undefined) delete process.env.EMBEDDING_CACHE_ENABLED
    else process.env.EMBEDDING_CACHE_ENABLED = previousCacheEnabled
    await rm(directory, { recursive: true, force: true })
  }
})
