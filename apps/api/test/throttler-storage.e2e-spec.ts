import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { DatabaseService } from '../src/database/database.service'
import { throttleCounters } from '../src/database/schema'
import { PostgresThrottlerStorage } from '../src/common/security/postgres-throttler-storage'

const databaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('shared Postgres throttle storage', () => {
  let database: DatabaseService
  let previousDatabaseUrl: string | undefined

  beforeAll(() => {
    previousDatabaseUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = databaseUrl
    database = new DatabaseService()
  })

  afterAll(async () => {
    if (database) await database.onApplicationShutdown()
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
  })

  it('shares an atomic limit across storage instances and resets an expired window', async () => {
    const first = new PostgresThrottlerStorage(database)
    const second = new PostgresThrottlerStorage(database)
    const key = randomUUID()
    const name = 'shared-storage-test'
    const requests = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        (index % 2 === 0 ? first : second).increment(key, 60_000, 5, 60_000, name),
      ),
    )

    expect(requests.filter((request) => !request.isBlocked)).toHaveLength(5)
    expect(requests.filter((request) => request.isBlocked)).toHaveLength(5)

    const [record] = await database.db
      .select()
      .from(throttleCounters)
      .where(and(eq(throttleCounters.key, key), eq(throttleCounters.name, name)))
    expect(record.hits).toBe(10)

    await database.db
      .update(throttleCounters)
      .set({ windowStartedAt: new Date(Date.now() - 120_000), blockedUntil: null })
      .where(and(eq(throttleCounters.key, key), eq(throttleCounters.name, name)))
    const reset = await second.increment(key, 60_000, 5, 60_000, name)
    expect(reset).toMatchObject({ totalHits: 1, isBlocked: false })

    await database.db
      .delete(throttleCounters)
      .where(and(eq(throttleCounters.key, key), eq(throttleCounters.name, name)))
  }, 30_000)
})
