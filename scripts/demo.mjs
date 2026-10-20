import { chmodSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const envPath = resolve(root, '.env.local')
const urls = [
  { name: 'Nova lesson studio', url: 'http://localhost:5173/login' },
  { name: 'API readiness', url: 'http://localhost:3001/api/health/ready' },
  { name: 'Grafana', url: 'http://localhost:3000', healthUrl: 'http://localhost:3000/api/health' },
  { name: 'Langfuse', url: 'http://localhost:3002' },
  { name: 'LiteLLM', url: 'http://localhost:4000/ui', healthUrl: 'http://localhost:4000/health/readiness' },
  { name: 'Prometheus', url: 'http://localhost:9091', healthUrl: 'http://localhost:9091/-/ready' },
  { name: 'Tempo', url: 'http://localhost:3200', healthUrl: 'http://localhost:3200/ready' },
  { name: 'Loki', url: 'http://localhost:3100/ready' },
]

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env })
  if (result.error) {
    process.stderr.write(`${command} could not start: ${result.error.message}\n`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function checkDocker() {
  const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    process.stderr.write('Docker is not available. Start Docker Desktop or OrbStack, then retry.\n')
    process.exit(1)
  }
}

function readLocalConfig() {
  if (!existsSync(envPath)) return new Map()
  const values = new Map()
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator < 1 || line.trimStart().startsWith('#')) continue
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    values.set(line.slice(0, separator).trim(), value)
  }
  return values
}

function printSummary() {
  const config = readLocalConfig()
  const configured = (key) => process.env[key]?.trim() || config.get(key)
  const modeSource = process.env.LLM_PROVIDER?.trim() ? 'command environment' : '.env.local'
  const requestedLive = configured('LLM_PROVIDER') === 'openai-compatible'
  const missing = [
    ...(!configured('LLM_BASE_URL') ? ['LLM_BASE_URL'] : []),
    ...(!configured('LLM_GENERATOR_MODEL') && !configured('LLM_MODEL') ? ['LLM_GENERATOR_MODEL'] : []),
    ...(!configured('LLM_API_KEY') ? ['LLM_API_KEY'] : []),
  ]
  const provider = requestedLive && missing.length === 0 ? 'live' : 'mock'
  process.stdout.write('\nNova demo is ready\n')
  process.stdout.write('------------------\n')
  for (const { name, url } of urls) process.stdout.write(`${name.padEnd(20)} ${url}\n`)
  process.stdout.write(`LLM config default   ${provider} (${modeSource}; app header shows current runtime mode)\n`)
  process.stdout.write(`Langfuse prompts     ${configured('LANGFUSE_USE_MANAGED_PROMPTS') === 'false' ? 'code fallback' : `${configured('LANGFUSE_PROMPT_LABEL') || 'production'} label`}\n`)
  if (requestedLive && missing.length > 0) process.stdout.write(`Live mode unavailable ${missing.join(', ')} missing in .env.local; add values and restart to enable it.\n`)
  process.stdout.write('\nSign in with the Teacher or Curriculum lead demo button. Manual login password: NovaLocal123!\n')
  process.stdout.write('Langfuse login: admin@example.test; generated password is in .env.local.\n')
  process.stdout.write('Edit workflow prompts in Langfuse > Prompts; publish changes to the selected label.\n')
  process.stdout.write('To stop the stack: pnpm exec varlock run -- docker compose --profile litellm down\n')
}

async function checkServices(wait) {
  let pending = [...urls]
  const attempts = wait ? 90 : 1
  for (let attempt = 0; attempt < attempts && pending.length > 0; attempt += 1) {
    const results = await Promise.all(pending.map(async ({ name, url, healthUrl = url }) => {
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2500) })
        return response.ok ? undefined : name
      } catch {
        return name
      }
    }))
    pending = pending.filter(({ name }) => results.includes(name))
    if (pending.length > 0 && attempt + 1 < attempts) await new Promise((done) => setTimeout(done, 2000))
  }
  if (pending.length > 0) {
    process.stderr.write(`\nHealth check failed: ${pending.map(({ name }) => name).join(', ')} are not healthy.\n`)
    for (const service of pending) {
      try {
        const response = await fetch(service.healthUrl ?? service.url, { signal: AbortSignal.timeout(2500) })
        const details = (await response.text()).trim()
        if (details) process.stderr.write(`${service.name} returned HTTP ${response.status}: ${details}\n`)
      } catch (error) {
        if (error instanceof Error) process.stderr.write(`${service.name}: ${error.message}\n`)
      }
    }
    process.stderr.write('Inspect service state with: pnpm exec varlock run -- docker compose --profile litellm ps\n')
    process.stderr.write('Inspect logs with: pnpm exec varlock run -- docker compose --profile litellm logs --tail=100\n')
    process.exit(1)
  }
}

async function main() {
  const command = process.argv[2] ?? 'check'
  if (!['up', 'check'].includes(command)) {
    process.stderr.write('Usage: pnpm demo:up | pnpm demo:check\n')
    process.exit(2)
  }

  if (command === 'up') {
    run('docker', ['compose', 'version'])
    checkDocker()
    if (!existsSync(envPath)) {
      copyFileSync(resolve(root, '.env.example'), envPath)
      chmodSync(envPath, 0o600)
      process.stdout.write('Created .env.local from .env.example.\n')
    }
    run('pnpm', ['local:prepare'])

    run('pnpm', ['exec', 'varlock', 'load'])
    run('pnpm', ['exec', 'varlock', 'run', '--', 'docker', 'compose', '--profile', 'litellm', 'up', '--build', '--detach'])
  }

  process.stdout.write('Checking demo services...\n')
  await checkServices(command === 'up')
  if (command === 'up' && readLocalConfig().get('LANGFUSE_USE_MANAGED_PROMPTS') !== 'false') {
    run('pnpm', ['langfuse:prompts:sync'])
  }
  printSummary()
}

await main()
