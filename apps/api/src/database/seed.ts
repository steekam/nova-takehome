import 'varlock/auto-load'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { hashPassword } from '../auth/password'
import { users } from './schema'
import { seedCurriculumLibrary } from './seed-curriculum-library'

const seedAccounts = [
  { email: 'teacher@example.test', role: 'teacher' as const },
  { email: 'curriculum-lead@example.test', role: 'curriculum_lead' as const },
]

async function seed(): Promise<void> {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new Error('Set NODE_ENV=development or test to create local seed accounts')
  }

  const databaseUrl = process.env.DATABASE_URL
  const databaseHost = databaseUrl ? new URL(databaseUrl).hostname : undefined
  const localHost =
    databaseHost && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(databaseHost)
  const composeHost =
    databaseHost === 'postgres' && process.env.SEED_ALLOW_COMPOSE_DATABASE === 'true'
  if (!localHost && !composeHost) {
    throw new Error('Local seed accounts can only be created in a database on this machine')
  }
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool })
  try {
    const passwordHash = await hashPassword('NovaLocal123!')
    await db
      .insert(users)
      .values(seedAccounts.map((account) => ({ ...account, passwordHash })))
      .onConflictDoNothing({ target: users.email })
    const curriculumLead = await pool.query<{ id: string }>(
      "select id from users where email = 'curriculum-lead@example.test'",
    )
    const leadId = curriculumLead.rows[0]?.id
    if (!leadId) throw new Error('Could not find the local curriculum-lead account.')
    const seeded = await seedCurriculumLibrary(pool, leadId)
    console.log(
      `Ensured ${seedAccounts.length} local accounts and seeded ${seeded.outcomes} Integrated Science outcomes from ${seeded.documents} corpus documents.`,
    )
  } finally {
    await pool.end()
  }
}

void seed().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
