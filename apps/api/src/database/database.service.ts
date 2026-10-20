import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import * as schema from './schema'

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly db: NodePgDatabase<typeof schema>
  private readonly pool: Pool

  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 10) })
    this.db = drizzle(this.pool, { schema })
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }

  async isReady(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`)
      return true
    } catch {
      return false
    }
  }
}
