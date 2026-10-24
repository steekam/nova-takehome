import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) {
  console.error('TEST_DATABASE_URL is required; integration tests never skip.')
  process.exit(1)
}

let parsed
try {
  parsed = new URL(databaseUrl)
} catch {
  console.error('TEST_DATABASE_URL must be a PostgreSQL URL.')
  process.exit(1)
}
const databaseName = decodeURIComponent(parsed.pathname.slice(1))
const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'])
if (
  !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
  !databaseName.endsWith('_test') ||
  !localHosts.has(parsed.hostname)
) {
  console.error('TEST_DATABASE_URL must target a local PostgreSQL database ending in _test.')
  process.exit(1)
}

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  NODE_ENV: 'test',
  EMBEDDING_PROVIDER: 'mock',
  SEED_ALLOW_COMPOSE_DATABASE: parsed.hostname === 'postgres' ? 'true' : 'false',
}

function run(args) {
  const result = spawnSync('pnpm', args, { env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['--filter', '@nova/api', 'db:migrate'])
run(['--filter', '@nova/api', 'db:seed'])

const require = createRequire(new URL('../apps/api/package.json', import.meta.url))
const { Client } = require('pg')
const client = new Client({ connectionString: databaseUrl })
await client.connect()
try {
  await client.query('DELETE FROM throttle_counters')
} finally {
  await client.end()
}

run(['--filter', '@nova/api', 'test:e2e'])
