import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async'
import type { relations } from './relations'

export type DbExecutor = PgAsyncDatabase<NodePgQueryResultHKT, typeof relations>
