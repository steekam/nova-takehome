import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { and, asc, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import { sessions, users } from '../database/schema'
import { randomToken, sha256, TOKEN_PATTERN } from './upstream/crypto.util'

export interface SessionRecord {
  id: string
  familyId: string
  isCurrent: boolean
  userId: string
  createdAt: Date
  expiresAt: Date
  lastActiveAt: Date
}

export interface SessionStore {
  create(record: SessionRecord): Promise<void>
  find(id: string): Promise<SessionRecord | undefined>
  touch(id: string, at: Date, idleTtlMs: number): Promise<boolean>
  revokeByToken(id: string): Promise<void>
  replace(oldId: string, record: SessionRecord, idleTtlMs: number): Promise<boolean>
  deleteForUser(userId: string): Promise<void>
  purgeExpired(limit?: number): Promise<number>
}

export const SESSION_STORE = Symbol('SESSION_STORE')

@Injectable()
export class DrizzleSessionStore implements SessionStore {
  private lastPurgeAt = 0

  constructor(private readonly database: DatabaseService) {}

  async create(record: SessionRecord): Promise<void> {
    await this.purgeExpiredIfDue()
    await this.database.db.insert(sessions).values(record)
  }

  async find(id: string): Promise<SessionRecord | undefined> {
    const [record] = await this.database.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.isCurrent, true)))
      .limit(1)
    return record
  }

  async touch(id: string, _at: Date, idleTtlMs: number): Promise<boolean> {
    const updated = await this.database.db
      .update(sessions)
      .set({ lastActiveAt: sql`GREATEST(${sessions.lastActiveAt}, clock_timestamp())` })
      .where(
        and(
          eq(sessions.id, id),
          eq(sessions.isCurrent, true),
          gt(sessions.expiresAt, sql`clock_timestamp()`),
          lt(sessions.lastActiveAt, sql`clock_timestamp()`),
          sql`${sessions.lastActiveAt} > clock_timestamp() - (${idleTtlMs} * interval '1 millisecond')`,
        ),
      )
      .returning({ id: sessions.id })
    return updated.length > 0
  }

  async revokeByToken(id: string): Promise<void> {
    const [snapshot] = await this.database.db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1)
    if (!snapshot) return
    await this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select ${users.id} from ${users} where ${users.id} = ${snapshot.userId} for update`,
      )
      const [record] = await tx
        .select({ familyId: sessions.familyId })
        .from(sessions)
        .where(eq(sessions.id, id))
        .limit(1)
      if (record) await tx.delete(sessions).where(eq(sessions.familyId, record.familyId))
    })
  }

  async replace(oldId: string, record: SessionRecord, idleTtlMs: number): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select ${users.id} from ${users} where ${users.id} = ${record.userId} for update`,
      )
      const retired = await tx
        .update(sessions)
        .set({ isCurrent: false })
        .where(
          and(
            eq(sessions.id, oldId),
            eq(sessions.isCurrent, true),
            gt(sessions.expiresAt, sql`clock_timestamp()`),
            sql`${sessions.lastActiveAt} > clock_timestamp() - (${idleTtlMs} * interval '1 millisecond')`,
          ),
        )
        .returning({ id: sessions.id })
      if (retired.length === 0) return false
      await tx.insert(sessions).values(record)
      return true
    })
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select ${users.id} from ${users} where ${users.id} = ${userId} for update`,
      )
      await tx.delete(sessions).where(eq(sessions.userId, userId))
    })
  }

  async purgeExpired(limit = 500): Promise<number> {
    const expired = this.database.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(lt(sessions.expiresAt, sql`clock_timestamp()`))
      .orderBy(asc(sessions.expiresAt))
      .limit(limit)
    const removed = await this.database.db
      .delete(sessions)
      .where(inArray(sessions.id, expired))
      .returning({ id: sessions.id })
    this.lastPurgeAt = Date.now()
    return removed.length
  }

  private async purgeExpiredIfDue(): Promise<void> {
    if (Date.now() - this.lastPurgeAt >= 60 * 60 * 1000) await this.purgeExpired()
  }
}

export const newSessionToken = randomToken
export const newSessionFamilyId = randomUUID
export const sessionId = sha256
export const isSessionToken = (token: string): boolean => TOKEN_PATTERN.test(token)
