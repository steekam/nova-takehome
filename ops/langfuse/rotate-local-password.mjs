import { execFileSync } from 'node:child_process'
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generatePassphrase } from './passphrase.mjs'

const root = process.cwd()
const envPath = resolve(root, '.env.local')
const email = process.env.LANGFUSE_INIT_USER_EMAIL?.trim()
const oldPassword = process.env.LANGFUSE_INIT_USER_PASSWORD
const baseUrl = (process.env.LANGFUSE_HOST ?? 'http://localhost:3002').replace(/\/$/, '')

if (!email || !oldPassword) {
  throw new Error(
    'Set LANGFUSE_INIT_USER_EMAIL and LANGFUSE_INIT_USER_PASSWORD in .env.local first.',
  )
}

const originalEnv = readFileSync(envPath, 'utf8')
const envValue = (name) => {
  const line = originalEnv.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`))
  return line?.slice(name.length + 1).trim()
}

if (envValue('LANGFUSE_INIT_USER_PASSWORD') !== oldPassword) {
  throw new Error('Varlock password does not match .env.local. Reload local environment and retry.')
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function psql(sql) {
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'compose.yaml',
      '-f',
      'compose.full.yaml',
      '--profile',
      'full',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'langfuse',
      '-d',
      'langfuse',
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
    ],
    { cwd: root, env: process.env, input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim()
}

function getCookies(response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ')
}

async function canSignIn(password) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`)
  if (!csrfResponse.ok)
    throw new Error(`Langfuse sign-in check failed (HTTP ${csrfResponse.status}).`)
  const { csrfToken } = await csrfResponse.json()
  const csrfCookies = getCookies(csrfResponse)
  const callbackResponse = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: csrfCookies,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: baseUrl,
      json: 'true',
    }),
  })
  const sessionCookies = [csrfCookies, getCookies(callbackResponse)].filter(Boolean).join('; ')
  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { cookie: sessionCookies },
  })
  if (!sessionResponse.ok) return false
  const session = await sessionResponse.json()
  return session.user?.email === email
}

function updateEnvPassword(password) {
  let replaced = false
  const next = originalEnv.split(/\r?\n/).map((line) => {
    if (!line.startsWith('LANGFUSE_INIT_USER_PASSWORD=')) return line
    if (replaced) throw new Error('Duplicate LANGFUSE_INIT_USER_PASSWORD entries in .env.local.')
    replaced = true
    return `LANGFUSE_INIT_USER_PASSWORD=${password}`
  })
  if (!replaced) next.push(`LANGFUSE_INIT_USER_PASSWORD=${password}`)
  return `${next.join('\n').replace(/\n+$/, '')}\n`
}

function writeEnv(source) {
  const temporaryPath = `${envPath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, source, { mode: 0o600 })
  chmodSync(temporaryPath, 0o600)
  renameSync(temporaryPath, envPath)
}

function makePasswordHash(password) {
  const code = [
    "let input = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => input += chunk);",
    "process.stdin.on('end', () => {",
    '  const { password } = JSON.parse(input);',
    "  const bcrypt = require('/app/node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs');",
    '  process.stdout.write(bcrypt.hashSync(password, 12));',
    '});',
  ].join('\n')
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'compose.yaml',
      '-f',
      'compose.full.yaml',
      '--profile',
      'full',
      'exec',
      '-T',
      'langfuse-web',
      'node',
      '-e',
      code,
    ],
    {
      cwd: root,
      env: process.env,
      input: JSON.stringify({ password }),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  ).trim()
}

const accountSql = `SELECT json_build_object(
  'password', password,
  'sessionsExpiredAt', sessions_expired_at,
  'updatedAt', updated_at
)::text FROM public.users WHERE email = ${sqlString(email)};`
const accountRows = psql(accountSql).split(/\r?\n/).filter(Boolean)
if (accountRows.length !== 1) {
  throw new Error(`Expected one Langfuse account for ${email}; found ${accountRows.length}.`)
}
const account = JSON.parse(accountRows[0])

if (!(await canSignIn(oldPassword))) {
  throw new Error('The current .env.local password cannot sign in. No account data was changed.')
}

const newPassword = generatePassphrase()
const newHash = makePasswordHash(newPassword)
if (!newHash.startsWith('$2a$12$'))
  throw new Error('Langfuse returned an unexpected password hash format.')

const rollbackSql = `UPDATE public.users
SET password = ${sqlString(account.password)},
    sessions_expired_at = ${account.sessionsExpiredAt === null ? 'NULL' : `${sqlString(account.sessionsExpiredAt)}::timestamptz`},
    updated_at = ${sqlString(account.updatedAt)}::timestamptz
WHERE email = ${sqlString(email)};`
const updateSql = `WITH changed AS (
  UPDATE public.users
  SET password = ${sqlString(newHash)}, sessions_expired_at = now(), updated_at = now()
  WHERE email = ${sqlString(email)}
  RETURNING 1
)
SELECT count(*) FROM changed;`

writeEnv(updateEnvPassword(newPassword))
let databaseUpdated = false
try {
  const updatedRows = psql(updateSql)
  databaseUpdated = true
  if (updatedRows !== '1')
    throw new Error('Langfuse password update did not affect exactly one account.')
  if (!(await canSignIn(newPassword))) {
    throw new Error('New sign-in verification failed. The original account password was restored.')
  }
} catch (error) {
  try {
    if (databaseUpdated) psql(rollbackSql)
    writeEnv(originalEnv)
  } catch {
    throw new Error(
      'Password rotation failed, and automatic rollback failed. Check Langfuse login and .env.local.',
    )
  }
  throw error
}

process.stdout.write(
  `Langfuse password updated for ${email}; existing user and memberships preserved.\n`,
)
process.stdout.write(`Passphrase: ${newPassword}\n`)
