import 'varlock/auto-load'
import { Pool } from 'pg'

const confirmationFlag = '--confirm-curriculum-content-reset'
const resetTables = [
  'plan_reviews',
  'lesson_plan_validations',
  'lesson_plan_version_sources',
  'lesson_plan_retrieval_candidates',
  'lesson_plan_versions',
  'lesson_plans',
  'curriculum_source_links',
  'curriculum_target_revisions',
  'curriculum_nodes',
  'curriculum_design_versions',
  'library_resource_chunks',
  'library_resource_revisions',
  'library_resources',
  'curriculum_offerings',
  'curriculum_levels',
  'curriculum_subjects',
  'curriculum_programmes',
  'curriculum_frameworks',
]

async function resetCurriculumContent(): Promise<void> {
  if (!process.argv.includes(confirmationFlag)) {
    throw new Error(`Pass ${confirmationFlag} to clear local curriculum and lesson-plan content`)
  }
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new Error('Curriculum content can only be reset in development or test')
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const databaseHost = new URL(databaseUrl).hostname
  const localHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(databaseHost)
  const composeHost =
    databaseHost === 'postgres' && process.env.SEED_ALLOW_COMPOSE_DATABASE === 'true'
  if (!localHost && !composeHost) {
    throw new Error('Curriculum content can only be reset in a database on this machine')
  }

  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`TRUNCATE TABLE ${resetTables.join(', ')} RESTRICT`)
    const result = await client.query(`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from auth_sessions) as sessions,
        (select count(*)::int from lesson_plans) as lesson_plans,
        (select count(*)::int from curriculum_design_versions) as designs,
        (select count(*)::int from curriculum_target_revisions) as targets,
        (select count(*)::int from library_resources) as resources
    `)
    await client.query('COMMIT')
    console.log('Curriculum content reset complete:', result.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

void resetCurriculumContent().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
