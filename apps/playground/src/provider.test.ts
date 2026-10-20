import assert from 'node:assert/strict'
import { test } from 'node:test'
import { modelLabel } from './domain.js'
import type { Candidate } from './domain.js'
import { generate, ProviderError } from './provider.js'

const candidate: Candidate = {
  id: 'baseten-deepseek',
  provider: 'baseten',
  connectionId: 'direct',
  model: 'deepseek/test',
  displayName: 'Baseten DeepSeek',
}
const proxyCandidate: Candidate = {
  id: 'litellm-deepseek',
  provider: 'litellm',
  connectionId: 'proxy',
  model: 'lesson-planner',
  displayName: 'DeepSeek via proxy',
}

async function withProviderStub(fetchStub: typeof fetch, operation: () => Promise<void>): Promise<void> {
  const previousFetch = globalThis.fetch
  const previous = Object.fromEntries([
    'OPENAI_COMPATIBLE_API_KEY', 'OPENAI_COMPATIBLE_BASE_URL',
    'OPENAI_COMPATIBLE_PROXY_API_KEY', 'OPENAI_COMPATIBLE_PROXY_BASE_URL',
    'BASETEN_API_KEY', 'LITELLM_API_KEY', 'LITELLM_BASE_URL',
  ].map((name) => [name, process.env[name]]))
  globalThis.fetch = fetchStub
  process.env.OPENAI_COMPATIBLE_API_KEY = 'test-key'
  process.env.OPENAI_COMPATIBLE_BASE_URL = 'https://provider.test/v1'
  try {
    await operation()
  } finally {
    globalThis.fetch = previousFetch
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
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

test('uses the generic proxy credential and endpoint for LiteLLM', async () => {
  await withProviderStub(async (input, init) => {
    assert.equal(input, 'https://proxy.test/v1/chat/completions')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer proxy-key')
    return Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] })
  }, async () => {
    process.env.OPENAI_COMPATIBLE_PROXY_API_KEY = 'proxy-key'
    process.env.OPENAI_COMPATIBLE_PROXY_BASE_URL = 'https://proxy.test/v1'
    await generate(proxyCandidate, 'prompt')
  })
})

test('labels a configured LiteLLM alias with the selected model name', () => {
  assert.equal(modelLabel({ ...candidate, provider: 'litellm', connectionId: 'proxy', model: 'lesson-planner', displayName: 'DeepSeek V4.1 Flash via LiteLLM' }, 'lesson-planner'), 'DeepSeek V4.1 Flash')
})
