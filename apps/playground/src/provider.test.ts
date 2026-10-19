import assert from 'node:assert/strict'
import { test } from 'node:test'
import { modelLabel } from './domain.js'
import type { Candidate } from './domain.js'
import { generate, ProviderError } from './provider.js'

const candidate: Candidate = {
  id: 'baseten-deepseek',
  provider: 'baseten',
  model: 'deepseek/test',
  displayName: 'Baseten DeepSeek',
}

async function withProviderStub(fetchStub: typeof fetch, operation: () => Promise<void>): Promise<void> {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.BASETEN_API_KEY
  const previousBaseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL
  globalThis.fetch = fetchStub
  process.env.BASETEN_API_KEY = 'test-key'
  process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://provider.test/v1'
  try {
    await operation()
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.BASETEN_API_KEY
    else process.env.BASETEN_API_KEY = previousKey
    if (previousBaseUrl === undefined) delete process.env.OPENAI_COMPATIBLE_BASE_URL
    else process.env.OPENAI_COMPATIBLE_BASE_URL = previousBaseUrl
  }
}

test('provider auth failures are classified as non-retryable', async () => {
  await withProviderStub(async () => new Response('denied', { status: 401 }), async () => {
    await assert.rejects(generate(candidate, 'prompt'), (error: unknown) =>
      error instanceof ProviderError && error.code === 'PROVIDER_AUTH_ERROR' && !error.retryable,
    )
  })
})

test('provider rate limits are classified as retryable', async () => {
  await withProviderStub(async () => new Response('slow down', { status: 429 }), async () => {
    await assert.rejects(generate(candidate, 'prompt'), (error: unknown) =>
      error instanceof ProviderError && error.code === 'PROVIDER_RATE_LIMITED' && error.retryable,
    )
  })
})

test('malformed provider envelopes are classified as retryable', async () => {
  await withProviderStub(async () => Response.json({ choices: [] }), async () => {
    await assert.rejects(generate(candidate, 'prompt'), (error: unknown) =>
      error instanceof ProviderError && error.code === 'PROVIDER_INVALID_RESPONSE' && error.retryable,
    )
  })
})

test('records the model returned by an OpenAI-compatible provider', async () => {
  await withProviderStub(async () => Response.json({
    model: 'deepseek-ai/DeepSeek-V4.1-Flash',
    choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
  }), async () => {
    const result = await generate(candidate, 'prompt')
    assert.equal(result.responseModel, 'deepseek-ai/DeepSeek-V4.1-Flash')
  })
})

test('labels a configured LiteLLM alias with the selected model name', () => {
  assert.equal(modelLabel({ ...candidate, provider: 'litellm', model: 'lesson-planner', displayName: 'DeepSeek V4.1 Flash via LiteLLM' }, 'lesson-planner'), 'DeepSeek V4.1 Flash')
})
