import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { ApiPrincipal, UserRole } from '@nova/shared'
import { DatabaseService } from '../database/database.service'
import { users } from '../database/schema'
import { verifyPassword } from './password'

const rolePermissions: Record<UserRole, string[]> = {
  teacher: ['lesson-plans:create', 'lesson-plans:read-own', 'lesson-plans:update-own'],
  curriculum_lead: ['lesson-plans:read-all', 'lesson-plans:review'],
}

const tokenLifetimeSeconds = 60 * 60 * 12

interface TokenClaims {
  sub: string
  exp: number
}

@Injectable()
export class AuthService {
  private readonly secret: string

  constructor(private readonly database: DatabaseService) {
    const environment = process.env.NODE_ENV
    const configuredSecret = process.env.AUTH_SECRET
    const secret =
      configuredSecret ||
      (environment === 'development' || environment === 'test'
        ? 'nova-local-auth-secret-change-before-deploy-2026'
        : undefined)
    if (!secret || secret.length < 32)
      throw new Error('AUTH_SECRET must contain at least 32 characters')
    this.secret = secret
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: ApiPrincipal } | undefined> {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)
    if (!user || !(await verifyPassword(password, user.passwordHash))) return undefined

    const principal = this.toPrincipal(user.id, user.role)
    return { accessToken: this.sign(user.id), user: principal }
  }

  async authenticate(token: string): Promise<ApiPrincipal | undefined> {
    const subject = this.verify(token)
    if (!subject) return undefined

    const [user] = await this.database.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, subject))
      .limit(1)
    return user ? this.toPrincipal(user.id, user.role) : undefined
  }

  private toPrincipal(subject: string, role: UserRole): ApiPrincipal {
    return { subject, roles: [role], permissions: rolePermissions[role] }
  }

  private sign(subject: string): string {
    const payload = Buffer.from(
      JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds }),
    ).toString('base64url')
    return `${payload}.${this.signature(payload)}`
  }

  private verify(token: string): string | undefined {
    const [payload, signature, extra] = token.split('.')
    if (!payload || !signature || extra !== undefined) return undefined

    const actual = Buffer.from(signature, 'base64url')
    const expected = Buffer.from(this.signature(payload), 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined

    let claims: unknown
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    } catch {
      return undefined
    }

    if (!isTokenClaims(claims) || claims.exp <= Math.floor(Date.now() / 1000)) return undefined
    return claims.sub
  }

  private signature(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url')
  }
}

function isTokenClaims(value: unknown): value is TokenClaims {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sub' in value &&
    typeof value.sub === 'string' &&
    'exp' in value &&
    typeof value.exp === 'number'
  )
}
