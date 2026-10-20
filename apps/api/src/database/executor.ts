import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from './schema'

type TransactionCallback = Parameters<NodePgDatabase<typeof schema>['transaction']>[0]

export type DbExecutor = NodePgDatabase<typeof schema> | Parameters<TransactionCallback>[0]
