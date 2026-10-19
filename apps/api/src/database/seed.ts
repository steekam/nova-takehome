import 'varlock/auto-load'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { hashPassword } from '../auth/password'
import { users } from './schema'

const seedAccounts = [
  { email: 'teacher@example.test', role: 'teacher' as const },
  { email: 'curriculum-lead@example.test', role: 'curriculum_lead' as const },
]

async function seed(): Promise<void> {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new Error('Set NODE_ENV=development or test to create local seed accounts')
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
    throw new Error('Local seed accounts can only be created in a database on this machine')
  }

  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle(pool)

  try {
    const passwordHash = await hashPassword('NovaLocal123!')
    for (const account of seedAccounts) {
      await db.insert(users).values({ ...account, passwordHash }).onConflictDoUpdate({
        target: users.email,
        set: { role: account.role, passwordHash },
      })
    }
    console.log(`Seeded ${seedAccounts.length} local test accounts`)
  } finally {
    await pool.end()
  }
}

void seed().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
