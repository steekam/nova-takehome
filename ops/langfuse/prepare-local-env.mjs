import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env.local')
const source = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const lines = source.split(/\r?\n/)
const values = new Map()

for (const line of lines) {
  const separator = line.indexOf('=')
  if (separator > 0 && !line.startsWith('#')) {
    values.set(line.slice(0, separator), line.slice(separator + 1))
  }
}

const secrets = new Map([
  ['LANGFUSE_POSTGRES_PASSWORD', randomBytes(32).toString('hex')],
  ['LANGFUSE_CLICKHOUSE_PASSWORD', randomBytes(32).toString('hex')],
  ['LANGFUSE_REDIS_AUTH', randomBytes(32).toString('hex')],
  ['LANGFUSE_MINIO_ROOT_PASSWORD', randomBytes(32).toString('hex')],
  ['LANGFUSE_NEXTAUTH_SECRET', randomBytes(32).toString('base64')],
  ['LANGFUSE_SALT', randomBytes(32).toString('base64')],
  ['LANGFUSE_ENCRYPTION_KEY', randomBytes(32).toString('hex')],
  ['LANGFUSE_PUBLIC_KEY', `pk-lf-${randomBytes(16).toString('hex')}`],
  ['LANGFUSE_SECRET_KEY', `sk-lf-${randomBytes(32).toString('hex')}`],
  ['LANGFUSE_INIT_USER_PASSWORD', randomBytes(32).toString('base64')],
  ['LITELLM_MASTER_KEY', `sk-${randomBytes(32).toString('hex')}`],
  ['LITELLM_POSTGRES_PASSWORD', randomBytes(32).toString('hex')],
  ['LITELLM_SALT_KEY', `sk-${randomBytes(32).toString('hex')}`],
])

for (const [key, generated] of secrets) {
  if (!values.get(key)?.trim()) values.set(key, generated)
}

const updated = new Set()
const output = lines.map((line) => {
  const separator = line.indexOf('=')
  if (separator <= 0 || line.startsWith('#')) return line

  const key = line.slice(0, separator)
  if (!values.has(key)) return line
  updated.add(key)
  return `${key}=${values.get(key)}`
})

for (const [key, value] of values) {
  if (!updated.has(key)) output.push(`${key}=${value}`)
}

writeFileSync(envPath, `${output.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 })
chmodSync(envPath, 0o600)
process.stdout.write('Generated missing local Langfuse and LiteLLM credentials in .env.local.\n')
