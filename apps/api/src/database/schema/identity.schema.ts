import { userRoles } from '@nova/shared'
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const userRole = pgEnum('user_role', userRoles)

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
