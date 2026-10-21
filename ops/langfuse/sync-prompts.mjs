import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url))
const { lessonPlanGenerationPrompt } = require('../../apps/api/dist/src/lesson-planning/llm-workflows/generation-prompt.js')
const { lessonPlanRubricPrompt } = require('../../apps/api/dist/src/lesson-planning/llm-workflows/rubric-prompt.js')
const { LangfuseClient } = requireApi('@langfuse/client')

const publicKey = process.env.LANGFUSE_PUBLIC_KEY
const secretKey = process.env.LANGFUSE_SECRET_KEY
if (!publicKey || !secretKey) {
  process.stderr.write('Langfuse prompt sync needs LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.\n')
  process.exit(1)
}

const client = new LangfuseClient({
  publicKey,
  secretKey,
  baseUrl: process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST,
})
const label = process.env.LANGFUSE_PROMPT_LABEL ?? 'production'
const publishSource = process.argv.includes('--update')

for (const definition of [lessonPlanGenerationPrompt, lessonPlanRubricPrompt]) {
  let current
  try {
    current = await client.prompt.get(definition.name, { type: 'text', label, cacheTtlSeconds: 0 })
  } catch {
    current = undefined
  }
  if (current?.prompt === definition.prompt && current.config.model === definition.config.model) {
    process.stdout.write(`${definition.name}: already current (${label}, v${current.version})\n`)
    continue
  }
  if (current && !publishSource) {
    process.stdout.write(`${definition.name}: keeping Langfuse-managed ${label} v${current.version}; use the publish command to replace it\n`)
    continue
  }
  const prompt = await client.prompt.create({ name: definition.name, type: 'text', prompt: definition.prompt, config: definition.config, labels: [label] })
  process.stdout.write(`${definition.name}: published ${label} v${prompt.version}\n`)
}

await client.shutdown()
