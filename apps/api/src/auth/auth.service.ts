import { randomBytes } from 'node:crypto'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { permissionsForRoles, type ApiPrincipal, type UserRole } from '@nova/shared'
import { DatabaseService } from '../database/database.service'
import { users } from '../database/schema'
import { hashPassword, needsPasswordRehash, verifyPassword } from './password'
import {
  isSessionToken,
  newSessionFamilyId,
  newSessionToken,
  sessionId,
  SESSION_STORE,
  type SessionRecord,
  type SessionStore,
} from './session-store'

const ABSOLUTE_TTL = 12 * 60 * 60 * 1000
const IDLE_TTL = 60 * 60 * 1000
const TOUCH_INTERVAL = 60 * 1000
export const AUTH_CLOCK = Symbol('AUTH_CLOCK')

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private dummyHash?: Promise<string>

  constructor(
    private readonly database: DatabaseService,
    @Inject(SESSION_STORE) private readonly sessionStore: SessionStore,
    @Optional() @Inject(AUTH_CLOCK) private readonly clock?: () => number,
  ) {}

  async login(
    email: string,
    password: string,
    replacing?: string,
  ): Promise<{ sessionToken: string; user: ApiPrincipal; maxAgeSeconds: number } | undefined> {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)
    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : await this.verifyUnknownAccount(password)
    if (!user || !valid || !user.isActive) {
      this.logger.warn('auth.login.failed')
      return undefined
    }

    if (needsPasswordRehash(user.passwordHash)) {
      const upgraded = await hashPassword(password)
      await this.database.db
        .update(users)
        .set({ passwordHash: upgraded })
        .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)))
    }
    if (replacing && isSessionToken(replacing))
      await this.sessionStore.revokeByToken(sessionId(replacing))
    const token = newSessionToken()
    const now = this.now()
    await this.sessionStore.create({
      id: sessionId(token),
      familyId: newSessionFamilyId(),
      isCurrent: true,
      userId: user.id,
      createdAt: new Date(now),
      expiresAt: new Date(now + ABSOLUTE_TTL),
      lastActiveAt: new Date(now),
    })
    this.logger.log(`auth.login.succeeded userId=${user.id}`)
    return {
      sessionToken: token,
      user: this.toPrincipal(user.id, user.role),
      maxAgeSeconds: ABSOLUTE_TTL / 1000,
    }
  }

  async authenticate(token: string): Promise<ApiPrincipal | undefined> {
    if (!isSessionToken(token)) return undefined
    const record = await this.sessionStore.find(sessionId(token))
    if (!record) return undefined
    const now = this.now()
    if (now >= record.expiresAt.getTime() || now >= record.lastActiveAt.getTime() + IDLE_TTL) {
      await this.sessionStore.revokeByToken(record.id)
      return undefined
    }
    if (now - record.lastActiveAt.getTime() >= TOUCH_INTERVAL) {
      if (!(await this.sessionStore.touch(record.id, new Date(now), IDLE_TTL))) return undefined
    }
    const [user] = await this.database.db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, record.userId))
      .limit(1)
    return user?.isActive ? this.toPrincipal(user.id, user.role) : undefined
  }

  async logout(token?: string): Promise<void> {
    if (token && isSessionToken(token)) await this.sessionStore.revokeByToken(sessionId(token))
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionStore.deleteForUser(userId)
  }

  async rotateSession(
    token: string,
  ): Promise<{ sessionToken: string; user: ApiPrincipal; maxAgeSeconds: number } | undefined> {
    const user = await this.authenticate(token)
    if (!user) return undefined
    const oldId = sessionId(token)
    const previous = await this.sessionStore.find(oldId)
    if (!previous) return undefined
    const rotatedToken = newSessionToken()
    const now = this.now()
    const replacement: SessionRecord = {
      ...previous,
      id: sessionId(rotatedToken),
      isCurrent: true,
      lastActiveAt: new Date(now),
    }
    if (!(await this.sessionStore.replace(oldId, replacement, IDLE_TTL))) return undefined
    return {
      sessionToken: rotatedToken,
      user,
      maxAgeSeconds: Math.max(0, Math.floor((previous.expiresAt.getTime() - now) / 1000)),
    }
  }

  private toPrincipal(subject: string, role: UserRole): ApiPrincipal {
    return { subject, roles: [role], permissions: permissionsForRoles([role]) }
  }

  private async verifyUnknownAccount(password: string): Promise<boolean> {
    if (!this.dummyHash) {
      this.dummyHash = hashPassword(randomBytes(32).toString('hex')).catch((error: unknown) => {
        this.dummyHash = undefined
        throw error
      })
      await this.dummyHash
      return false
    }
    return verifyPassword(password, await this.dummyHash)
  }

  private now(): number {
    return this.clock?.() ?? Date.now()
  }
}
