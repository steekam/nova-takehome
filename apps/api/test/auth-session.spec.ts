import { randomBytes, scrypt } from 'node:crypto'
import { AuthService } from '../src/auth/auth.service'
import { hashPassword, needsPasswordRehash, verifyPassword } from '../src/auth/password'
import { sessionId, type SessionRecord, type SessionStore } from '../src/auth/session-store'
import { DatabaseService } from '../src/database/database.service'

describe('opaque auth sessions', () => {
  let now: number
  let store: TestSessionStore
  let service: AuthService
  let testUser: { id: string; email: string; passwordHash: string; role: string; isActive: boolean }

  beforeEach(async () => {
    now = 1_800_000_000_000
    store = new TestSessionStore()
    testUser = {
      id: '4f6bfc7e-5cbc-48aa-9de5-6bfc77886ae1',
      email: 'teacher@example.test',
      passwordHash: await hashPassword('correct horse battery staple'),
      role: 'teacher',
      isActive: true,
    }
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [testUser] }) }) }),
      update: () => ({
        set: (values: { passwordHash: string }) => ({
          where: async () => {
            testUser.passwordHash = values.passwordHash
          },
        }),
      }),
    }
    service = new AuthService({ db } as unknown as DatabaseService, store, () => now)
  })

  it('stores only token hashes and revokes the replaced session at login', async () => {
    const first = await service.login('teacher@example.test', 'correct horse battery staple')
    expect(first).toBeDefined()
    expect(store.records.has(first!.sessionToken)).toBe(false)
    expect(store.records.has(sessionId(first!.sessionToken))).toBe(true)
    const second = await service.login(
      'teacher@example.test',
      'correct horse battery staple',
      first!.sessionToken,
    )
    expect(second).toBeDefined()
    expect(await service.authenticate(first!.sessionToken)).toBeUndefined()
    expect(await service.authenticate(second!.sessionToken)).toEqual(second!.user)
  })

  it('upgrades a legacy scrypt hash after a successful login', async () => {
    const legacy = await createLegacyPasswordHash('correct horse battery staple')
    testUser.passwordHash = legacy
    const login = await service.login('teacher@example.test', 'correct horse battery staple')
    expect(login).toBeDefined()
    expect(testUser.passwordHash).toMatch(/^\$scrypt\$ln=17,r=8,p=1\$/)
    expect(await verifyPassword('correct horse battery staple', testUser.passwordHash)).toBe(true)
  })

  it('normalizes new passwords and bounds oversized verification inputs', async () => {
    const encoded = await hashPassword('cafe\u0301')
    expect(await verifyPassword('café', encoded)).toBe(true)
    expect(needsPasswordRehash(encoded)).toBe(false)
    expect(await verifyPassword('x'.repeat(4097), encoded)).toBe(false)
    await expect(hashPassword('')).rejects.toThrow()
  })

  it('rejects tampered, expired, idle, and replayed rotated tokens', async () => {
    const issued = await service.login('teacher@example.test', 'correct horse battery staple')
    const token = issued!.sessionToken
    expect(await service.authenticate(`${token.slice(0, -1)}x`)).toBeUndefined()

    const rotated = await service.rotateSession(token)
    expect(rotated).toBeDefined()
    expect(await service.authenticate(token)).toBeUndefined()
    expect(await service.authenticate(rotated!.sessionToken)).toBeDefined()

    now += 60 * 60 * 1000
    expect(await service.authenticate(rotated!.sessionToken)).toBeUndefined()
    const fresh = await service.login('teacher@example.test', 'correct horse battery staple')
    now += 12 * 60 * 60 * 1000
    expect(await service.authenticate(fresh!.sessionToken)).toBeUndefined()
  })

  it('allows only one concurrent rotation and re-reads current account policy', async () => {
    const issued = await service.login('teacher@example.test', 'correct horse battery staple')
    const rotations = await Promise.all([
      service.rotateSession(issued!.sessionToken),
      service.rotateSession(issued!.sessionToken),
    ])
    expect(rotations.filter(Boolean)).toHaveLength(1)
    const activeToken = rotations.find(Boolean)!.sessionToken

    testUser.role = 'curriculum_lead'
    expect((await service.authenticate(activeToken))?.roles).toEqual(['curriculum_lead'])
    testUser.isActive = false
    expect(await service.authenticate(activeToken)).toBeUndefined()
  })

  it('fails closed when an idle-touch write finds the session no longer live', async () => {
    const issued = await service.login('teacher@example.test', 'correct horse battery staple')
    now += 60_000
    store.touch = async () => false
    expect(await service.authenticate(issued!.sessionToken)).toBeUndefined()
  })

  it('rejects bad credentials without creating a session', async () => {
    expect(await service.login('teacher@example.test', 'incorrect password')).toBeUndefined()
    expect(await service.login('missing@example.test', 'incorrect password')).toBeUndefined()
    expect(store.records.size).toBe(0)
  })

  it('revokes one session on logout and every session on logout-all', async () => {
    const first = await service.login('teacher@example.test', 'correct horse battery staple')
    const second = await service.login('teacher@example.test', 'correct horse battery staple')
    await service.logout(first!.sessionToken)
    expect(await service.authenticate(first!.sessionToken)).toBeUndefined()
    expect(await service.authenticate(second!.sessionToken)).toBeDefined()
    await service.logoutAll(second!.user.subject)
    expect(await service.authenticate(second!.sessionToken)).toBeUndefined()
  })

  it('revoking an old rotated cookie revokes only that session family', async () => {
    const rotatedFamily = await service.login(
      'teacher@example.test',
      'correct horse battery staple',
    )
    const otherDevice = await service.login('teacher@example.test', 'correct horse battery staple')
    const rotated = await service.rotateSession(rotatedFamily!.sessionToken)

    await service.logout(rotatedFamily!.sessionToken)
    expect(await service.authenticate(rotatedFamily!.sessionToken)).toBeUndefined()
    expect(await service.authenticate(rotated!.sessionToken)).toBeUndefined()
    expect(await service.authenticate(otherDevice!.sessionToken)).toBeDefined()
  })
})

class TestSessionStore implements SessionStore {
  readonly records = new Map<string, SessionRecord>()

  async create(record: SessionRecord): Promise<void> {
    this.records.set(record.id, { ...record })
  }
  async find(id: string): Promise<SessionRecord | undefined> {
    const record = this.records.get(id)
    return record?.isCurrent ? { ...record } : undefined
  }
  async touch(id: string, at: Date, idleTtlMs: number): Promise<boolean> {
    const record = this.records.get(id)
    if (
      !record?.isCurrent ||
      at.getTime() >= record.lastActiveAt.getTime() + idleTtlMs ||
      at >= record.expiresAt
    )
      return false
    this.records.set(id, { ...record, lastActiveAt: at })
    return true
  }
  async revokeByToken(id: string): Promise<void> {
    const record = this.records.get(id)
    if (record)
      for (const [key, value] of this.records)
        if (value.familyId === record.familyId) this.records.delete(key)
  }
  async replace(oldId: string, record: SessionRecord, idleTtlMs: number): Promise<boolean> {
    const current = this.records.get(oldId)
    if (
      !current?.isCurrent ||
      record.lastActiveAt >= current.expiresAt ||
      record.lastActiveAt.getTime() >= current.lastActiveAt.getTime() + idleTtlMs
    )
      return false
    this.records.set(oldId, { ...current, isCurrent: false })
    this.records.set(record.id, { ...record })
    return true
  }
  async deleteForUser(userId: string): Promise<void> {
    for (const [key, value] of this.records) if (value.userId === userId) this.records.delete(key)
  }
  async purgeExpired(): Promise<number> {
    return 0
  }
}

async function createLegacyPasswordHash(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    }),
  )
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}
