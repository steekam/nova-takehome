import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publishGenerationPrompts } from './langfuse-prompts.js'
import { getFixture } from './corpus.js'
import { makePromptTemplate, PROMPT_VERSION, renderPromptTemplate } from './prompt.js'

test('managed prompt templates render the selected duration for either CBC target', () => {
  for (const fixtureId of ['particles', 'changes'] as const) {
    const fixture = getFixture(fixtureId)
    const prompt = renderPromptTemplate(makePromptTemplate(fixtureId), fixture.chunks, [], 30)
    assert.match(prompt, /starter 5m, main 20m, closing 5m/)
    assert.match(prompt, /"durationMinutes":30/)
    assert.ok(!prompt.includes('{{duration_guidance}}'))
  }
})

test('publishes one managed generation prompt for each CBC fixture', async () => {
  const previousFetch = globalThis.fetch
  const previousPublicKey = process.env.LANGFUSE_PUBLIC_KEY
  const previousSecretKey = process.env.LANGFUSE_SECRET_KEY
  const requests: Array<{ name: string; prompt: string }> = []
  process.env.LANGFUSE_PUBLIC_KEY = 'public-test'
  process.env.LANGFUSE_SECRET_KEY = 'secret-test'
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { name: string; prompt: string }
    requests.push(body)
    return Response.json({ version: requests.length })
  }

  try {
    const published = await publishGenerationPrompts()

    assert.deepEqual(published, [
      { name: 'nova-lesson-generation', version: 1 },
      { name: 'nova-lesson-generation-changes', version: 2 },
    ])
    assert.deepEqual(requests.map(({ name }) => name), published.map(({ name }) => name))
    assert.notEqual(requests[0].prompt, requests[1].prompt)
    assert.ok(requests.every(({ prompt }) => prompt.includes('{{duration_guidance}}')))
    assert.equal(PROMPT_VERSION, 'generate-lesson-v22')
  } finally {
    globalThis.fetch = previousFetch
    if (previousPublicKey === undefined) delete process.env.LANGFUSE_PUBLIC_KEY
    else process.env.LANGFUSE_PUBLIC_KEY = previousPublicKey
    if (previousSecretKey === undefined) delete process.env.LANGFUSE_SECRET_KEY
    else process.env.LANGFUSE_SECRET_KEY = previousSecretKey
  }
})
