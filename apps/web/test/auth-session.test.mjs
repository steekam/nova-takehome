import assert from 'node:assert/strict'
import test from 'node:test'
import {
  destinationAfterLogin,
  expireSession,
  loadCurrentUser,
  loginAndCache,
  logoutAndClear,
} from '../src/lib/auth-session.ts'

const principal = { subject: 'u1', roles: ['teacher'], permissions: ['lesson_plan:view'] }

test('login clears stale auth data before caching the returned principal', async () => {
  const calls = []
  const user = await loginAndCache(
    async () => principal,
    () => calls.push('clear'),
    (value) => calls.push(['set', value]),
  )
  assert.equal(user, principal)
  assert.deepEqual(calls, ['clear', ['set', principal]])
})

test('current-user hydration treats 401 as an anonymous session and rethrows other errors', async () => {
  assert.equal(await loadCurrentUser(async () => principal), principal)
  assert.equal(
    await loadCurrentUser(async () => {
      throw { status: 401 }
    }),
    null,
  )
  await assert.rejects(
    loadCurrentUser(async () => {
      throw { status: 503 }
    }),
    { status: 503 },
  )
})

test('logout clears cached user data only after the server revokes the session', async () => {
  const calls = []
  await logoutAndClear(
    async () => calls.push('revoke'),
    () => calls.push('clear'),
  )
  assert.deepEqual(calls, ['revoke', 'clear'])
  calls.length = 0
  await assert.rejects(
    logoutAndClear(
      async () => {
        throw new Error('offline')
      },
      () => calls.push('clear'),
    ),
  )
  assert.deepEqual(calls, [])
})

test('expired sessions clear cached data and preserve the current URL for reauthentication', () => {
  const calls = []
  expireSession(
    { pathname: '/teacher/plans/42', href: '/teacher/plans/42?tab=review' },
    () => calls.push('clear'),
    (href) => calls.push(['login', href]),
  )
  assert.deepEqual(calls, ['clear', ['login', '/teacher/plans/42?tab=review']])
  calls.length = 0
  expireSession(
    { pathname: '/login', href: '/login' },
    () => calls.push('clear'),
    () => calls.push('login'),
  )
  assert.deepEqual(calls, [])
})

test('post-login redirects stay same-origin and otherwise use the review permission home', () => {
  assert.equal(destinationAfterLogin('/library?tab=mine#top', principal), '/library?tab=mine#top')
  assert.equal(destinationAfterLogin('https://evil.example', principal), '/teacher')
  assert.equal(destinationAfterLogin('//evil.example', principal), '/teacher')
  assert.equal(destinationAfterLogin('/\\evil.example', principal), '/teacher')
  assert.equal(
    destinationAfterLogin(undefined, {
      ...principal,
      roles: ['curriculum_lead'],
      permissions: ['lesson_plan:view', 'lesson_plan:review'],
    }),
    '/curriculum-lead',
  )
})
