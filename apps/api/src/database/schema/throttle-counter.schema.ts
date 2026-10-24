import { index, integer, pgTable, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'

export const throttleCounters = pgTable(
  'throttle_counters',
  {
    key: text('key').notNull(),
    name: text('name').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    hits: integer('hits').notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.name] }),
    index('throttle_counters_window_started_idx').on(table.windowStartedAt),
  ],
)
