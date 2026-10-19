import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env.local')
if (!existsSync(envPath)) throw new Error('Missing .env.local. Run pnpm local:prepare first.')

const baseUrl = (process.env.LITELLM_BASE_URL ?? 'http://localhost:4000/v1').replace(/\/+$/, '')
const proxyUrl = baseUrl.replace(/\/v1$/, '')
const adminKey = process.env.LITELLM_MASTER_KEY
if (!adminKey) throw new Error('LITELLM_MASTER_KEY is missing. Run pnpm local:prepare first.')

const readyBy = Date.now() + 60_000
let readiness = 'unreachable'
while (Date.now() < readyBy) {
  try {
    const response = await fetch(`${proxyUrl}/health/readiness`, { signal: AbortSignal.timeout(2000) })
    if (response.ok) break
    readiness = `HTTP ${response.status}`
  } catch {
    readiness = 'unreachable'
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
if (Date.now() >= readyBy) throw new Error(`LiteLLM did not become ready within 60 seconds (${readiness}). Check the proxy logs and try again.`)

const source = readFileSync(envPath, 'utf8')
const existingKey = process.env.LITELLM_API_KEY?.trim()
if (existingKey) {
  const response = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${existingKey}` } })
  if (!response.ok) throw new Error(`LITELLM_API_KEY validation failed with HTTP ${response.status}. Clear it from .env.local and retry.`)
  process.stdout.write('Existing LiteLLM playground key is valid.\n')
  process.exit(0)
}

const response = await fetch(`${proxyUrl}/key/generate`, {
  method: 'POST',
  headers: { authorization: `Bearer ${adminKey}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    models: [process.env.LITELLM_MODEL ?? 'lesson-planner', process.env.LITELLM_GLM_MODEL ?? 'lesson-planner-glm'],
    key_alias: 'nova-playground',
    max_budget: 0.5,
    budget_duration: '30d',
    duration: '30d',
  }),
})
if (!response.ok) throw new Error(`LiteLLM key provisioning failed with HTTP ${response.status}. Check the proxy health and configuration.`)

const body = await response.json()
if (typeof body !== 'object' || body === null || !('key' in body) || typeof body.key !== 'string' || !body.key.startsWith('sk-')) {
  throw new Error('LiteLLM returned no valid virtual key.')
}

const lines = source.split(/\r?\n/)
const keyLine = `LITELLM_API_KEY=${body.key}`
const index = lines.findIndex((line) => line.startsWith('LITELLM_API_KEY='))
if (index >= 0) lines[index] = keyLine
else lines.push(keyLine)
writeFileSync(envPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 })
chmodSync(envPath, 0o600)
process.stdout.write('Created a 30-day LiteLLM virtual key with a $0.50 spend budget and saved it in .env.local.\n')
