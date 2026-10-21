import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { relations } from './relations'

export type DatabaseReadiness =
  | { status: 'ready' }
  | { status: 'database-unavailable' }
  | { status: 'migrations-required' }

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly db: NodePgDatabase<typeof relations>
  private readonly pool: Pool

  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 10) })
    this.db = drizzle({ client: this.pool, relations })
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }

  async isReady(): Promise<boolean> {
    return (await this.readiness()).status === 'ready'
  }

  async readiness(): Promise<DatabaseReadiness> {
    try {
      const result = await this.pool.query<{ schema_ready: boolean }>(
        "select to_regclass('public.lesson_plan_retrieval_candidates') is not null as schema_ready",
      )
      return result.rows[0]?.schema_ready ? { status: 'ready' } : { status: 'migrations-required' }
    } catch {
      return { status: 'database-unavailable' }
    }
  }
}
