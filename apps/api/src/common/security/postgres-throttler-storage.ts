import { Injectable } from '@nestjs/common'
import type { ThrottlerStorage } from '@nestjs/throttler'
import { and, isNull, lt, or, sql } from 'drizzle-orm'
import { DatabaseService } from '../../database/database.service'
import { throttleCounters } from '../../database/schema'

interface ThrottlerStorageRecord {
  totalHits: number
  timeToExpire: number
  isBlocked: boolean
  timeToBlockExpire: number
}

@Injectable()
export class PostgresThrottlerStorage implements ThrottlerStorage {
  private requestsSinceCleanup = 0

  constructor(private readonly database: DatabaseService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    this.requestsSinceCleanup += 1
    if (this.requestsSinceCleanup >= 1000) {
      this.requestsSinceCleanup = 0
      await this.cleanup()
    }
    const ttlMs = Math.max(0, Math.floor(ttl))
    const blockMs = Math.max(0, Math.floor(blockDuration))
    const [record] = await this.database.db
      .insert(throttleCounters)
      .values({
        key,
        name: throttlerName,
        windowStartedAt: sql`clock_timestamp()`,
        hits: 1,
        blockedUntil: null,
      })
      .onConflictDoUpdate({
        target: [throttleCounters.key, throttleCounters.name],
        set: {
          windowStartedAt: sql`case
            when ${throttleCounters.blockedUntil} > clock_timestamp() then ${throttleCounters.windowStartedAt}
            when ${throttleCounters.windowStartedAt} + (${ttlMs} * interval '1 millisecond') <= clock_timestamp() then clock_timestamp()
            else ${throttleCounters.windowStartedAt}
          end`,
          hits: sql`case
            when ${throttleCounters.blockedUntil} > clock_timestamp() then ${throttleCounters.hits} + 1
            when ${throttleCounters.windowStartedAt} + (${ttlMs} * interval '1 millisecond') <= clock_timestamp() then 1
            else ${throttleCounters.hits} + 1
          end`,
          blockedUntil: sql`case
            when ${throttleCounters.blockedUntil} > clock_timestamp() then ${throttleCounters.blockedUntil}
            when ${throttleCounters.windowStartedAt} + (${ttlMs} * interval '1 millisecond') <= clock_timestamp() then null
            when ${throttleCounters.hits} + 1 > ${limit} then clock_timestamp() + (${blockMs} * interval '1 millisecond')
            else null
          end`,
        },
      })
      .returning({
        totalHits: throttleCounters.hits,
        timeToExpire: sql<number>`greatest(0, ceil(extract(epoch from (${throttleCounters.windowStartedAt} + (${ttlMs} * interval '1 millisecond') - clock_timestamp()))))::int`,
        isBlocked: sql<boolean>`coalesce(${throttleCounters.blockedUntil} > clock_timestamp(), false)`,
        timeToBlockExpire: sql<number>`greatest(0, ceil(extract(epoch from (${throttleCounters.blockedUntil} - clock_timestamp()))))::int`,
      })
    return {
      totalHits: record.totalHits,
      timeToExpire: record.timeToExpire,
      isBlocked: record.isBlocked,
      timeToBlockExpire: record.timeToBlockExpire,
    }
  }

  private cleanup() {
    return this.database.db
      .delete(throttleCounters)
      .where(
        and(
          lt(throttleCounters.windowStartedAt, sql`clock_timestamp() - interval '1 day'`),
          or(
            isNull(throttleCounters.blockedUntil),
            lt(throttleCounters.blockedUntil, sql`clock_timestamp()`),
          ),
        ),
      )
  }
}
