import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { eq, inArray } from 'drizzle-orm'
import supertest = require('supertest')
import { configureHttp } from '../src/configure-http'
import { DatabaseService } from '../src/database/database.service'
import { sessions, throttleCounters, users } from '../src/database/schema'
import { hashPassword } from '../src/auth/password'
import { sessionId } from '../src/auth/session-store'
import { AuthService } from '../src/auth/auth.service'

const databaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip
const originalEnvironment = new Map(
  [
    'DATABASE_URL',
    'DATABASE_POOL_MAX',
    'NODE_ENV',
    'CORS_ORIGIN',
    'LLM_PROVIDER',
    'EMBEDDING_PROVIDER',
    'OTEL_ENABLED',
  ].map((key) => [key, process.env[key]]),
)

describeWithDatabase('auth HTTP lifecycle', () => {
  let app: NestFastifyApplication
  let database: DatabaseService
  const userIds = [randomUUID(), randomUUID()]
  const emails = userIds.map((id) => `auth-flow-${id}@example.test`)

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DATABASE_POOL_MAX = '4'
    process.env.NODE_ENV = 'test'
    process.env.CORS_ORIGIN = 'http://localhost:5173'
    process.env.LLM_PROVIDER = 'mock'
    process.env.EMBEDDING_PROVIDER = 'mock'
    process.env.OTEL_ENABLED = 'false'

    const { AppModule } = await import('../src/app.module')
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    )
    await configureHttp(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    database = app.get(DatabaseService)
    const passwordHash = await hashPassword('NovaLocal123!')
    await database.db.insert(users).values([
      { id: userIds[0], email: emails[0], role: 'teacher', passwordHash },
      { id: userIds[1], email: emails[1], role: 'curriculum_lead', passwordHash },
    ])
  })

  beforeEach(async () => {
    await database.db.delete(throttleCounters)
  })

  afterAll(async () => {
    try {
      if (database) await database.db.delete(users).where(inArray(users.id, userIds))
      if (app) await app.close()
    } finally {
      for (const [key, value] of originalEnvironment) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('sets an HttpOnly browser cookie, stores only its hash, and returns the current principal', async () => {
    const response = await login(emails[0])
    expect(response.statusCode).toBe(200)
    expect(response.json).toMatchObject({
      user: {
        subject: userIds[0],
        roles: ['teacher'],
        permissions: expect.arrayContaining(['lesson_plan:view']),
      },
    })
    expect(response.json).not.toHaveProperty('sessionToken')
    const cookie = cookieFrom(response.headers['set-cookie'])
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const setCookies = Array.isArray(response.headers['set-cookie'])
      ? response.headers['set-cookie']
      : [response.headers['set-cookie']]
    expect(setCookies).toEqual(
      expect.arrayContaining([expect.stringMatching(/^nova_access=;.*Path=\/api/i)]),
    )
    const sessionCookie = setCookies.find((header) => /HttpOnly/i.test(header))
    expect(sessionCookie).toMatch(/SameSite=Lax/i)
    expect(sessionCookie).toMatch(/Path=\//i)
    expect(sessionCookie).not.toMatch(/; Secure/i)

    const rows = await database.db.select().from(sessions).where(eq(sessions.userId, userIds[0]))
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(sessionId(cookie.value))
    expect(rows[0].id).not.toBe(cookie.value)
    expect(rows[0].expiresAt.getTime() - rows[0].createdAt.getTime()).toBe(12 * 60 * 60 * 1000)

    const me = await request('GET', '/api/auth/me', cookie.header)
    expect(me.statusCode).toBe(200)
    expect(me.json).toMatchObject({ subject: userIds[0], roles: ['teacher'] })
  })

  it('rejects tampered, expired, and idle sessions; logout revokes and safely replays', async () => {
    const tampered = await login(emails[0])
    const tamperedCookie = cookieFrom(tampered.headers['set-cookie'])
    const changedToken = `${tamperedCookie.value.slice(0, -1)}${tamperedCookie.value.endsWith('a') ? 'b' : 'a'}`
    expect((await request('GET', '/api/auth/me', `nova_access=${changedToken}`)).statusCode).toBe(
      401,
    )

    const expired = await login(emails[0])
    const expiredCookie = cookieFrom(expired.headers['set-cookie'])
    await database.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, sessionId(expiredCookie.value)))
    expect((await request('GET', '/api/auth/me', expiredCookie.header)).statusCode).toBe(401)

    const idle = await login(emails[0])
    const idleCookie = cookieFrom(idle.headers['set-cookie'])
    await database.db
      .update(sessions)
      .set({ lastActiveAt: new Date(Date.now() - 60 * 60 * 1000 - 1000) })
      .where(eq(sessions.id, sessionId(idleCookie.value)))
    expect((await request('GET', '/api/auth/me', idleCookie.header)).statusCode).toBe(401)

    const logoutLogin = await login(emails[0])
    const logoutCookie = cookieFrom(logoutLogin.headers['set-cookie'])
    const logout = await request('POST', '/api/auth/logout', logoutCookie.header)
    expect(logout.statusCode).toBe(204)
    expect(logout.headers['set-cookie'][0]).toMatch(/Max-Age=0/i)
    expect((await request('GET', '/api/auth/me', logoutCookie.header)).statusCode).toBe(401)
    expect((await request('POST', '/api/auth/logout', logoutCookie.header)).statusCode).toBe(204)
  })

  it('rotates atomically while preserving the original absolute expiry', async () => {
    const loggedIn = await login(emails[0])
    const oldCookie = cookieFrom(loggedIn.headers['set-cookie'])
    const nearExpiry = new Date(Date.now() + 60_000)
    await database.db
      .update(sessions)
      .set({ expiresAt: nearExpiry })
      .where(eq(sessions.id, sessionId(oldCookie.value)))
    const [oldRecord] = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId(oldCookie.value)))
    const rotated = await request('POST', '/api/auth/rotate', oldCookie.header)
    expect(rotated.statusCode).toBe(200)
    const newCookie = cookieFrom(rotated.headers['set-cookie'])
    expect(newCookie.value).not.toBe(oldCookie.value)
    const oldRows = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId(oldCookie.value)))
    expect(oldRows).toHaveLength(1)
    expect(oldRows[0].isCurrent).toBe(false)
    const [newRecord] = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId(newCookie.value)))
    expect(newRecord.expiresAt.getTime()).toBe(oldRecord.expiresAt.getTime())
    const rotatedHeader = (
      Array.isArray(rotated.headers['set-cookie'])
        ? rotated.headers['set-cookie']
        : [rotated.headers['set-cookie']]
    ).find((header) => header?.startsWith('nova_access='))
    const maxAge = Number(rotatedHeader?.match(/Max-Age=(\d+)/i)?.[1])
    expect(Number.isFinite(maxAge)).toBe(true)
    expect(maxAge).toBeLessThanOrEqual(
      Math.floor((oldRecord.expiresAt.getTime() - Date.now()) / 1000),
    )
    expect((await request('GET', '/api/auth/me', oldCookie.header)).statusCode).toBe(401)
    expect((await request('GET', '/api/auth/me', newCookie.header)).statusCode).toBe(200)
    expect((await request('POST', '/api/auth/logout', oldCookie.header)).statusCode).toBe(204)
    expect((await request('GET', '/api/auth/me', newCookie.header)).statusCode).toBe(401)
  })

  it('revokes an old rotated cookie and serializes concurrent rotate/logout without affecting another device', async () => {
    const old = cookieFrom((await login(emails[0])).headers['set-cookie'])
    const otherDevice = cookieFrom((await login(emails[0])).headers['set-cookie'])
    const [oldRecord] = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId(old.value)))
    const auth = app.get(AuthService)
    const [rotations] = await Promise.all([
      Promise.all(Array.from({ length: 8 }, () => auth.rotateSession(old.value))),
      Promise.all(Array.from({ length: 8 }, () => auth.logout(old.value))),
    ])
    const successfulRotations = rotations.filter((item) => item !== undefined)
    expect(successfulRotations.length).toBeLessThanOrEqual(1)
    const familyRows = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.familyId, oldRecord.familyId))
    expect(familyRows).toHaveLength(0)
    expect(await auth.authenticate(old.value)).toBeUndefined()
    for (const rotation of successfulRotations)
      expect(await auth.authenticate(rotation.sessionToken)).toBeUndefined()
    expect((await request('GET', '/api/auth/me', otherDevice.header)).statusCode).toBe(200)
  })

  it('sets the production host cookie with Secure and the __Host- prefix', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const response = await login(emails[0])
      expect(response.statusCode).toBe(200)
      const cookie = cookieFrom(response.headers['set-cookie'], '__Host-nova_access')
      expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
      const setCookies = Array.isArray(response.headers['set-cookie'])
        ? response.headers['set-cookie']
        : [response.headers['set-cookie']]
      const sessionCookie = setCookies.find((header) => header?.startsWith('__Host-nova_access='))
      expect(sessionCookie).toMatch(/HttpOnly/i)
      expect(sessionCookie).toMatch(/Secure/i)
      expect(sessionCookie).toMatch(/SameSite=Lax/i)
      expect(sessionCookie).toMatch(/Path=\//i)
      expect((await request('GET', '/api/auth/me', cookie.header)).statusCode).toBe(200)
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
  }, 15_000)

  it('revokes every session on logout-all', async () => {
    const first = cookieFrom((await login(emails[1])).headers['set-cookie'])
    const second = cookieFrom((await login(emails[1])).headers['set-cookie'])
    expect((await request('GET', '/api/auth/me', first.header)).statusCode).toBe(200)
    expect((await request('GET', '/api/auth/me', second.header)).statusCode).toBe(200)
    const logoutAll = await request('POST', '/api/auth/logout-all', first.header)
    expect(logoutAll.statusCode).toBe(204)
    expect((await request('GET', '/api/auth/me', first.header)).statusCode).toBe(401)
    expect((await request('GET', '/api/auth/me', second.header)).statusCode).toBe(401)
  })

  it('reflects role changes immediately and rejects a disabled account', async () => {
    const cookie = cookieFrom((await login(emails[0])).headers['set-cookie'])
    await database.db.update(users).set({ role: 'curriculum_lead' }).where(eq(users.id, userIds[0]))
    const changedRole = await request<{ subject: string; roles: string[]; permissions: string[] }>(
      'GET',
      '/api/auth/me',
      cookie.header,
    )
    expect(changedRole.statusCode).toBe(200)
    expect(changedRole.json).toMatchObject({
      roles: ['curriculum_lead'],
      permissions: expect.arrayContaining(['runtime_llm:manage']),
    })
    await database.db.update(users).set({ isActive: false }).where(eq(users.id, userIds[0]))
    expect((await request('GET', '/api/auth/me', cookie.header)).statusCode).toBe(401)
    await database.db
      .update(users)
      .set({ role: 'teacher', isActive: true })
      .where(eq(users.id, userIds[0]))
  })

  it('throttles login attempts per client address', async () => {
    for (let i = 0; i < 5; i++) {
      const failed = await rawRequest('POST', '/api/auth/login', undefined, {
        email: emails[0],
        password: 'wrong-password',
      })
      expect(failed.statusCode).toBe(401)
    }
    const limited = await rawRequest('POST', '/api/auth/login', undefined, {
      email: emails[0],
      password: 'wrong-password',
    })
    expect(limited.statusCode).toBe(429)
  }, 30_000)

  it('blocks untrusted cross-origin writes and allows the configured browser origin', async () => {
    const blocked = await rawRequest<{ code: string }>(
      'POST',
      '/api/auth/login',
      undefined,
      {
        email: emails[0],
        password: 'NovaLocal123!',
      },
      'https://attacker.example',
    )
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json.code).toBe('ORIGIN_NOT_ALLOWED')
    const allowed = await rawRequest(
      'POST',
      '/api/auth/login',
      undefined,
      {
        email: emails[0],
        password: 'NovaLocal123!',
      },
      'http://localhost:5173',
    )
    expect(allowed.statusCode).toBe(200)

    const sessionCookie = cookieFrom(allowed.headers['set-cookie'])
    const blockedLogout = await rawRequest(
      'POST',
      '/api/auth/logout',
      sessionCookie.header,
      undefined,
      'https://attacker.example',
    )
    expect(blockedLogout.statusCode).toBe(403)
    expect((await request('GET', '/api/auth/me', sessionCookie.header)).statusCode).toBe(200)
    const blockedRotate = await rawRequest(
      'POST',
      '/api/auth/rotate',
      sessionCookie.header,
      undefined,
      'https://attacker.example',
    )
    expect(blockedRotate.statusCode).toBe(403)
    const trustedRotate = await rawRequest(
      'POST',
      '/api/auth/rotate',
      sessionCookie.header,
      undefined,
      'http://localhost:5173',
    )
    expect(trustedRotate.statusCode).toBe(200)
    const rotatedCookie = cookieFrom(trustedRotate.headers['set-cookie'])
    const blockedLogoutAll = await rawRequest(
      'POST',
      '/api/auth/logout-all',
      rotatedCookie.header,
      undefined,
      'https://attacker.example',
    )
    expect(blockedLogoutAll.statusCode).toBe(403)
    const trustedLogoutAll = await rawRequest(
      'POST',
      '/api/auth/logout-all',
      rotatedCookie.header,
      undefined,
      'http://localhost:5173',
    )
    expect(trustedLogoutAll.statusCode).toBe(204)
  })

  async function login(email: string) {
    return rawRequest('POST', '/api/auth/login', undefined, { email, password: 'NovaLocal123!' })
  }

  async function request<T = unknown>(method: string, url: string, cookie?: string) {
    return rawRequest<T>(method, url, cookie)
  }

  async function rawRequest<T = unknown>(
    method: string,
    url: string,
    cookie: string | undefined,
    payload: Record<string, unknown> | undefined = undefined,
    origin?: string,
  ) {
    const headers: Record<string, string> = {}
    if (cookie) headers.cookie = cookie
    if (origin) headers.origin = origin
    const testRequest = supertest(app.getHttpServer())
    const pending =
      method === 'GET'
        ? testRequest.get(url)
        : method === 'POST'
          ? testRequest.post(url)
          : method === 'PUT'
            ? testRequest.put(url)
            : testRequest.patch(url)
    let withHeaders = pending
    for (const [name, value] of Object.entries(headers)) withHeaders = withHeaders.set(name, value)
    const response = await (payload === undefined ? withHeaders : withHeaders.send(payload))
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      json: response.body as T,
    }
  }
})

function cookieFrom(setCookie: string[] | string | undefined, name = 'nova_access') {
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie]
  const header = headers.find(
    (item) => item && item.match(new RegExp(`^${name}=([^;]+)`))?.[1] && !/Max-Age=0/i.test(item),
  )
  expect(header).toBeDefined()
  const value = header!.split(';', 1)[0]
  return { header: value, value: value.slice(`${name}=`.length) }
}
