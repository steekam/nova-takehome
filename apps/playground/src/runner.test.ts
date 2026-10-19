import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { getFixture } from './corpus.js'
import { retrieve } from './embedding.js'
import type { Candidate } from './domain.js'
import { verify } from './verify.js'
import { generate } from './provider.js'
import { runGeneration } from './runner.js'

const mockCandidate: Candidate = { id: 'mock-deepseek', provider: 'mock', model: 'mock-deepseek', displayName: 'Mock DeepSeek' }

async function withRunnerHarness(operation: (input: {
  setProviderResponses: (responses: Array<Response | Error>) => void
  validResponse: Response
  content: string
} ) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nova-runner-test-'))
  const names = [
    'OPENAI_COMPATIBLE_API_KEY', 'BASETEN_API_KEY', 'OPENAI_COMPATIBLE_BASE_URL',
    'EMBEDDING_PROVIDER', 'EMBEDDING_CACHE_DIR', 'EMBEDDING_CACHE_ENABLED',
    'PLAYGROUND_REPORTS_DIR', 'LANGFUSE_USE_MANAGED_PROMPTS', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY',
  ] as const
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  const previousFetch = globalThis.fetch
  let responses: Array<Response | Error> = []
  process.env.OPENAI_COMPATIBLE_API_KEY = 'test-key'
  process.env.BASETEN_API_KEY = 'test-key'
  process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://provider.test/v1'
  process.env.EMBEDDING_PROVIDER = 'mock'
  process.env.EMBEDDING_CACHE_DIR = path.join(directory, 'embeddings')
  process.env.EMBEDDING_CACHE_ENABLED = 'true'
  process.env.PLAYGROUND_REPORTS_DIR = path.join(directory, 'runs')
  process.env.LANGFUSE_USE_MANAGED_PROMPTS = 'false'
  delete process.env.LANGFUSE_PUBLIC_KEY
  delete process.env.LANGFUSE_SECRET_KEY
  globalThis.fetch = async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    if (!next) throw new Error('Unexpected provider request.')
    return next
  }

  try {
    const fixture = getFixture('particles')
    const retrieval = await retrieve('mock', fixture.id)
    const mockOutput = await generate(mockCandidate, 'Create a grounded lesson.', retrieval.selected.map(({ id }) => id))
    const providerResponse = (content: string) => new Response(JSON.stringify({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
    await operation({ setProviderResponses: (items) => { responses = [...items] }, validResponse: providerResponse(mockOutput.content), content: mockOutput.content })
  } finally {
    globalThis.fetch = previousFetch
    for (const name of names) {
      const value = previous[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
}

test('runner retries a transient provider failure once and records both attempts', async () => {
  await withRunnerHarness(async ({ setProviderResponses, validResponse }) => {
    setProviderResponses([new TypeError('temporary network failure'), validResponse])
    const report = await runGeneration({ live: true, fixtureId: 'particles' })
    const result = report.candidates[0]
    assert.equal(result.status, 'success')
    assert.equal(result.attempts.length, 2)
    assert.equal(result.attempts[0].errorCode, 'PROVIDER_UNAVAILABLE')
    assert.equal(result.attempts[1].errorCode, undefined)
  })
})

test('runner stops on provider authentication failure without retrying', async () => {
  await withRunnerHarness(async ({ setProviderResponses }) => {
    setProviderResponses([new Response('denied', { status: 401 })])
    const report = await runGeneration({ live: true, fixtureId: 'particles' })
    const result = report.candidates[0]
    assert.equal(result.status, 'blocked')
    assert.equal(result.errorCode, 'PROVIDER_AUTH_ERROR')
    assert.equal(result.attempts.length, 1)
  })
})

test('runner repairs deterministic verification failures once', async () => {
  await withRunnerHarness(async ({ setProviderResponses, validResponse, content }) => {
    const fixture = getFixture('particles')
    const parsed = verify(JSON.parse(content), fixture.chunks).content
    assert.ok(parsed)
    const corrupted = structuredClone(parsed)
    corrupted.lessonObjectives[0].sourceChunkIds = ['chunk-target-particles']
    setProviderResponses([
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(corrupted) }, finish_reason: 'stop' }] }), { status: 200 }),
      validResponse,
    ])
    const report = await runGeneration({ live: true, fixtureId: 'particles' })
    const result = report.candidates[0]
    assert.equal(result.status, 'success')
    assert.equal(result.attempts.length, 2)
    assert.equal(result.attempts[0].errorCode, 'VERIFICATION_FAILED')
    assert.equal(result.attempts[1].errorCode, undefined)
    assert.match(result.attempts[1].prompt, /teaching note that supports its teaching emphasis/)
  })
})

test('generation accepts a selected lesson duration and records it through verification', async () => {
  await withRunnerHarness(async () => {
    const report = await runGeneration({
      live: false,
      fixtureId: 'changes',
      durationMinutes: 30,
    })
    const result = report.candidates[0]
    assert.equal(report.scenario.requestedDurationMinutes, 30)
    assert.equal(result.content?.durationMinutes, 30)
    assert.equal(result.content?.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0), 30)
    assert.equal(result.verification?.passed, true)
    assert.match(result.attempts[0].prompt, /starter 5m, main 20m, closing 5m/)
  })
})
