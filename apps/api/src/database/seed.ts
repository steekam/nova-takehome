import 'varlock/auto-load'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { and, eq } from 'drizzle-orm'
import { hashPassword } from '../auth/password'
import { curriculumChunks, curriculumDocuments, users } from './schema'
import { validateEnvironment } from '../configuration'
import { createEmbeddingEncoder } from '../curriculum/embedding.adapter'

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
  const environment = validateEnvironment(process.env)
  const embed = createEmbeddingEncoder({
    provider: environment.EMBEDDING_PROVIDER,
    model: environment.EMBEDDING_MODEL,
    revision: environment.EMBEDDING_MODEL_REVISION,
    dimensions: environment.EMBEDDING_DIMENSIONS,
    cacheEnabled: environment.EMBEDDING_CACHE_ENABLED,
    vectorCacheDir: environment.EMBEDDING_CACHE_DIR,
    modelCacheDir: environment.TRANSFORMERS_CACHE_DIR,
  })

  try {
    const passwordHash = await hashPassword('NovaLocal123!')
    for (const account of seedAccounts) {
      await db.insert(users).values({ ...account, passwordHash }).onConflictDoUpdate({
        target: users.email,
        set: { role: account.role, passwordHash },
      })
    }
    const fixtures = [
      ['learning_outcome', 'Changes of state', 'Explain how heating and cooling change water between solid, liquid, and gas states.'],
      ['learning_outcome', 'Reversible and irreversible change', 'Classify everyday changes as reversible or irreversible and explain the evidence.'],
      ['learning_outcome', 'Water cycle', 'Describe evaporation, condensation, and precipitation in the water cycle.'],
      ['scheme_of_work', 'CBC sequence: matter', 'Begin with observable properties, then model particle movement during heating and cooling.'],
      ['scheme_of_work', 'CBC teaching note: local materials', 'Use safe local examples such as ice, a covered cup, and warm water.'],
      ['scheme_of_work', 'CBC inclusion guidance', 'Offer diagrams and oral explanations alongside written responses.'],
      ['assessment_item', 'Assessment: state change', 'Ask learners to explain what happens to water particles during melting.'],
      ['assessment_item', 'Assessment: water cycle', 'Learners label evaporation and condensation in a familiar local example.'],
      ['assessment_item', 'Assessment: evidence of change', 'Learners sort changes and justify each choice using observations.'],
      ['scheme_of_work', 'Curriculum lead guidance', 'Check that objectives align with the selected outcome and activities allow every learner to show evidence.'],
    ] as const
    for (const [documentType, title, content] of fixtures) {
      const [existing] = await db.select().from(curriculumDocuments).where(eq(curriculumDocuments.title, title)).limit(1)
      const [inserted] = existing ? [existing] : await db.insert(curriculumDocuments).values({ documentType, subject: 'Science', grade: 'Primary 5', title, content }).returning()
      const document = inserted
      const chunks = title === 'Changes of state'
        ? [content, 'Describe melting, freezing, evaporation, and condensation using water examples.']
        : [content]
      for (const [ordinal, chunk] of chunks.entries()) {
        const [existingChunk] = await db.select().from(curriculumChunks).where(and(eq(curriculumChunks.documentId, document.id), eq(curriculumChunks.ordinal, ordinal))).limit(1)
        if (!existingChunk) await db.insert(curriculumChunks).values({ documentId: document.id, ordinal, content: chunk, embedding: await embed('document', chunk) })
      }
    }
    const chunks = await db.select({ id: curriculumChunks.id, content: curriculumChunks.content })
      .from(curriculumChunks).innerJoin(curriculumDocuments, eq(curriculumChunks.documentId, curriculumDocuments.id))
      .where(and(eq(curriculumDocuments.subject, 'Science'), eq(curriculumDocuments.grade, 'Primary 5')))
    for (const chunk of chunks) {
      await db.update(curriculumChunks).set({ embedding: await embed('document', chunk.content) }).where(eq(curriculumChunks.id, chunk.id))
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
