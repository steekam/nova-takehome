import 'varlock/auto-load'
import { createHash } from 'node:crypto'
import { Pool } from 'pg'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { hashPassword } from '../auth/password'
import {
  curriculumDesignVersions,
  curriculumFrameworks,
  curriculumLevels,
  curriculumNodes,
  curriculumOfferings,
  curriculumProgrammes,
  curriculumSourceLinks,
  curriculumSubjects,
  curriculumTargetRevisions,
  libraryResourceChunks,
  libraryResourceRevisions,
  libraryResources,
  users,
} from './schema'
import { validateEnvironment } from '../configuration'
import { createEmbeddingEncoder } from '../embeddings/embedding.adapter'

const seedAccounts = [
  { email: 'teacher@example.test', role: 'teacher' as const },
  { email: 'curriculum-lead@example.test', role: 'curriculum_lead' as const },
]

const supportedPaths = [
  {
    programme: 'Junior School',
    programmeCode: 'JUNIOR',
    level: 'Grade 7',
    levelCode: 'G7',
    subject: 'Integrated Science',
    subjectCode: 'INT_SCI',
    edition: 'Demo catalogue 2026',
    title: 'Compare the observable properties of solids and liquids.',
  },
  {
    programme: 'Junior School',
    programmeCode: 'JUNIOR',
    level: 'Grade 8',
    levelCode: 'G8',
    subject: 'Integrated Science',
    subjectCode: 'INT_SCI',
    edition: 'July 2024',
    title: 'Describe the characteristics of particles in the three states of matter.',
  },
  {
    programme: 'Junior School',
    programmeCode: 'JUNIOR',
    level: 'Grade 8',
    levelCode: 'G8',
    subject: 'Mathematics',
    subjectCode: 'MATH',
    edition: 'Demo catalogue 2026',
    title: 'Identify and extend a number pattern.',
  },
  {
    programme: 'Junior School',
    programmeCode: 'JUNIOR',
    level: 'Grade 9',
    levelCode: 'G9',
    subject: 'Integrated Science',
    subjectCode: 'INT_SCI',
    edition: 'Demo catalogue 2026',
    title: 'Explain how common materials transfer heat.',
  },
  {
    programme: 'Upper Primary',
    programmeCode: 'UPPER_PRIMARY',
    level: 'Grade 5',
    levelCode: 'G5',
    subject: 'Science and Technology',
    subjectCode: 'SCI_TECH',
    edition: 'Demo catalogue 2026',
    title: 'Describe how plants are suited to their habitats.',
  },
] as const

const supportingSources = [
  {
    type: 'scheme_of_work' as const,
    title: 'Demo scheme of work',
    locator: 'Week 1',
    role: 'teaching_support' as const,
    content:
      'DEMO ONLY, SYNTHETIC SCHOOL SEQUENCE: Learners have already named solids, liquids, and gases. This lesson introduces particle models before later lessons on changes of state.',
  },
  {
    type: 'teaching_note' as const,
    title: 'Demo particle teaching note',
    locator: 'Teaching note 1',
    role: 'teaching_support' as const,
    content:
      'DEMO ONLY, SYNTHETIC TEACHING NOTE: In this particle model, particles stay the same size in solids, liquids, and gases; state changes affect spacing and movement, not particle size. In a solid, particles are close together and vibrate around fixed positions. In a liquid, particles remain close but can move past one another. In a gas, particles are far apart and move freely. Possible misconception to address: a learner may think each gas particle grows when a gas fills a container. Correct this by explaining that a gas changing container shape does not mean each particle grows.',
  },
  {
    type: 'assessment_item' as const,
    title: 'Demo assessment guidance',
    locator: 'Assessment 1',
    role: 'assessment_support' as const,
    content:
      'DEMO ONLY, SYNTHETIC ASSESSMENT GUIDANCE: Ask learners to identify a state from a particle diagram and justify the answer using both spacing and movement. Credit an explanation that distinguishes particle motion from particle size.',
  },
  {
    type: 'lead_guidance' as const,
    title: 'Demo curriculum-lead note',
    locator: 'Lead note 1',
    role: 'guidance' as const,
    content:
      'DEMO ONLY, SYNTHETIC LEAD NOTE: Prefer paper cards, drawings, counters, or learner movement to model particles. Do not require heating, burning, or open flames. Give learners a non-movement option for activities involving body movement.',
  },
  {
    type: 'exemplar' as const,
    title: 'Demo reviewed lesson excerpt',
    locator: 'Excerpt 1',
    role: 'exemplar' as const,
    content:
      'DEMO ONLY, SYNTHETIC EXEMPLAR: A short lesson can begin with contrasting diagrams, use pairs to build and compare models, then end with an individual explanation. The exemplar informs teaching structure; the learning target still comes from the target source.',
  },
  {
    type: 'assessment_item' as const,
    title: 'Demo particle assessment pack — diagnostic prompt',
    locator: 'Assessment 2',
    role: 'assessment_support' as const,
    content:
      'DEMO ONLY, SYNTHETIC DIAGNOSTIC: Show two particle diagrams and ask learners what is similar and what differs. Listen for claims about spacing, movement, and particle size before teaching.',
  },
  {
    type: 'lead_guidance' as const,
    title: 'Demo curriculum-lead guidance — accessible responses',
    locator: 'Lead note 2',
    role: 'guidance' as const,
    content:
      'DEMO ONLY, SYNTHETIC ACCESSIBILITY GUIDANCE: For diagram comparisons, provide two equivalent spoken descriptions and static response cards. This option must work without visual access or body movement, including the closing check. Tactile counters are another option, with movement represented as vibration, sliding, or free movement.',
  },
  {
    type: 'teaching_note' as const,
    title: 'Demo particle teaching note — classroom setup',
    locator: 'Setup note 1',
    role: 'teaching_support' as const,
    content:
      'DEMO ONLY, SYNTHETIC CLASSROOM SETUP NOTE: Prepare same-size particle cards, counters, spoken-description cards, and one response sheet per learner before the lesson. Display all three diagrams together for comparison. Use paper or counters; no heating demonstration or electrical equipment is needed.',
  },
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

  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool })
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
    const accountRows = []
    for (const account of seedAccounts) {
      const [row] = await db
        .insert(users)
        .values({ ...account, passwordHash })
        .onConflictDoUpdate({
          target: users.email,
          set: { role: account.role, passwordHash },
        })
        .returning()
      accountRows.push(row)
    }
    const leadId = accountRows.find((row) => row.role === 'curriculum_lead')!.id

    const framework = await findOrInsert(
      () =>
        db
          .select()
          .from(curriculumFrameworks)
          .where(eq(curriculumFrameworks.code, 'KE-CBC'))
          .limit(1),
      () =>
        db
          .insert(curriculumFrameworks)
          .values({
            code: 'KE-CBC',
            name: 'Kenya Competency Based Curriculum',
            authority: 'Kenya Institute of Curriculum Development',
          })
          .returning(),
    )
    const programmes = new Map<string, typeof curriculumProgrammes.$inferSelect>()
    const levels = new Map<string, typeof curriculumLevels.$inferSelect>()
    const subjects = new Map<string, typeof curriculumSubjects.$inferSelect>()
    const offerings = new Map<string, typeof curriculumOfferings.$inferSelect>()
    const designs = new Map<string, typeof curriculumDesignVersions.$inferSelect>()

    for (const path of supportedPaths) {
      const programme = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumProgrammes)
            .where(
              and(
                eq(curriculumProgrammes.frameworkId, framework.id),
                eq(curriculumProgrammes.code, path.programmeCode),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumProgrammes)
            .values({ frameworkId: framework.id, code: path.programmeCode, name: path.programme })
            .returning(),
      )
      programmes.set(path.programmeCode, programme)
      const level = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumLevels)
            .where(
              and(
                eq(curriculumLevels.programmeId, programme.id),
                eq(curriculumLevels.code, path.levelCode),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumLevels)
            .values({
              programmeId: programme.id,
              kind: 'grade',
              code: path.levelCode,
              label: path.level,
            })
            .returning(),
      )
      levels.set(path.levelCode, level)
      const subject = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumSubjects)
            .where(
              and(
                eq(curriculumSubjects.frameworkId, framework.id),
                eq(curriculumSubjects.code, path.subjectCode),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumSubjects)
            .values({ frameworkId: framework.id, code: path.subjectCode, name: path.subject })
            .returning(),
      )
      subjects.set(path.subjectCode, subject)
      const offering = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumOfferings)
            .where(
              and(
                eq(curriculumOfferings.programmeId, programme.id),
                eq(curriculumOfferings.levelId, level.id),
                eq(curriculumOfferings.subjectId, subject.id),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumOfferings)
            .values({
              programmeId: programme.id,
              levelId: level.id,
              subjectId: subject.id,
              externalCode: `${path.programmeCode}-${path.levelCode}-${path.subjectCode}`,
            })
            .returning(),
      )
      offerings.set(`${path.programmeCode}:${path.levelCode}:${path.subjectCode}`, offering)
    }

    const officialResource = await seedResource({
      title: 'KICD Integrated Science Grade 8 learning outcome excerpt 1.2(a)',
      type: 'curriculum_design',
      authority: 'official',
      editionLabel: 'July 2024',
      sourceUrl: 'https://drive.google.com/file/d/1RpqZRmeMywbc1Tya0_x-tNJBs75Gy0-v/preview',
      locator:
        'Strand 1.0 · Mixtures, Elements and Compounds / Sub-strand 1.2 · Physical and chemical changes / Specific learning outcome (a)',
      content: 'Describe the characteristics of particles in the three states of matter.',
      creatorId: leadId,
      embed,
    })

    const targetIdByPath = new Map<string, string>()
    for (const [index, path] of supportedPaths.entries()) {
      const offering = offerings.get(`${path.programmeCode}:${path.levelCode}:${path.subjectCode}`)!
      const actualTarget = path.subjectCode === 'INT_SCI' && path.levelCode === 'G8'
      const design = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumDesignVersions)
            .where(
              and(
                eq(curriculumDesignVersions.offeringId, offering.id),
                eq(curriculumDesignVersions.editionLabel, path.edition),
                eq(curriculumDesignVersions.revisionNumber, 1),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumDesignVersions)
            .values({
              offeringId: offering.id,
              sourceResourceRevisionId: actualTarget ? officialResource.revision.id : null,
              editionLabel: path.edition,
              revisionNumber: 1,
              origin: actualTarget ? 'official_import' : 'demo_fixture',
              status: 'published',
              publishedAt: new Date(),
            })
            .returning(),
      )
      designs.set(`${path.programmeCode}:${path.levelCode}:${path.subjectCode}`, design)
      const strand = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumNodes)
            .where(
              and(
                eq(curriculumNodes.designVersionId, design.id),
                eq(curriculumNodes.sourceLocator, actualTarget ? '1.0' : 'demo.strand'),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumNodes)
            .values({
              designVersionId: design.id,
              kind: 'strand',
              code: actualTarget ? '1.0' : null,
              label: actualTarget ? 'Mixtures, Elements and Compounds' : 'Demo catalogue strand',
              sourceLocator: actualTarget ? '1.0' : 'demo.strand',
              sortOrder: 1,
            })
            .returning(),
      )
      const subStrand = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumNodes)
            .where(
              and(
                eq(curriculumNodes.designVersionId, design.id),
                eq(curriculumNodes.sourceLocator, actualTarget ? '1.2' : 'demo.sub-strand'),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumNodes)
            .values({
              designVersionId: design.id,
              parentNodeId: strand.id,
              kind: 'sub_strand',
              code: actualTarget ? '1.2' : null,
              label: actualTarget ? 'Physical and chemical changes' : 'Demo catalogue sub-strand',
              sourceLocator: actualTarget ? '1.2' : 'demo.sub-strand',
              sortOrder: 2,
            })
            .returning(),
      )
      const locator = actualTarget ? '1.2(a)' : `DEMO-${index + 1}`
      const target = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumTargetRevisions)
            .where(
              and(
                eq(curriculumTargetRevisions.designVersionId, design.id),
                eq(curriculumTargetRevisions.sourceLocator, locator),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumTargetRevisions)
            .values({
              designVersionId: design.id,
              nodeId: subStrand.id,
              kind: 'specific_learning_outcome',
              code: actualTarget ? '(a)' : null,
              sourceLocator: locator,
              title: actualTarget
                ? 'Particles in the three states of matter'
                : 'Demo catalogue target',
              statement: path.title,
              sortOrder: 1,
            })
            .returning(),
      )
      targetIdByPath.set(`${path.programmeCode}:${path.levelCode}:${path.subjectCode}`, target.id)
    }

    const officialTargetId = targetIdByPath.get('JUNIOR:G8:INT_SCI')!
    await linkPublishedSource(
      officialTargetId,
      officialResource.revision.id,
      'defines_target',
      leadId,
    )
    for (const source of supportingSources) {
      const created = await seedResource({
        title: source.title,
        type: source.type,
        authority: 'synthetic',
        editionLabel: 'Demo seed v1',
        locator: source.locator,
        content: source.content,
        creatorId: leadId,
        embed,
      })
      await linkPublishedSource(officialTargetId, created.revision.id, source.role, leadId)
    }

    console.log(
      `Seeded ${seedAccounts.length} local accounts and ${supportedPaths.length} CBC catalogue paths. One target has published sources; the remaining targets are browse-only demo entries.`,
    )
  } finally {
    await pool.end()
  }

  async function seedResource(input: {
    title: string
    type:
      | 'curriculum_design'
      | 'scheme_of_work'
      | 'assessment_item'
      | 'teaching_note'
      | 'lead_guidance'
      | 'exemplar'
    authority: 'official' | 'school' | 'internal' | 'synthetic'
    editionLabel: string
    sourceUrl?: string
    locator: string
    content: string
    creatorId: string
    embed: (role: 'query' | 'document', text: string) => Promise<number[]>
  }) {
    const resource = await findOrInsert(
      () =>
        db
          .select()
          .from(libraryResources)
          .where(
            and(
              eq(libraryResources.title, input.title),
              eq(libraryResources.authority, input.authority),
            ),
          )
          .limit(1),
      () =>
        db
          .insert(libraryResources)
          .values({ title: input.title, resourceType: input.type, authority: input.authority })
          .returning(),
    )
    const revision = await findOrInsert(
      () =>
        db
          .select()
          .from(libraryResourceRevisions)
          .where(
            and(
              eq(libraryResourceRevisions.resourceId, resource.id),
              eq(libraryResourceRevisions.revisionNumber, 1),
            ),
          )
          .limit(1),
      () =>
        db
          .insert(libraryResourceRevisions)
          .values({
            resourceId: resource.id,
            revisionNumber: 1,
            editionLabel: input.editionLabel,
            sourceUrl: input.sourceUrl,
            contentHash: createHash('sha256').update(input.content).digest('hex'),
            content: input.content,
            status: 'published',
            createdBy: input.creatorId,
            publishedAt: new Date(),
          })
          .returning(),
    )
    const [existingChunk] = await db
      .select()
      .from(libraryResourceChunks)
      .where(
        and(
          eq(libraryResourceChunks.resourceRevisionId, revision.id),
          eq(libraryResourceChunks.ordinal, 0),
        ),
      )
      .limit(1)
    if (!existingChunk) {
      await db.insert(libraryResourceChunks).values({
        resourceRevisionId: revision.id,
        ordinal: 0,
        locator: input.locator,
        content: input.content,
        embedding: await input.embed('document', input.content),
      })
    }
    return { resource, revision }
  }

  async function linkPublishedSource(
    targetRevisionId: string,
    resourceRevisionId: string,
    role: 'defines_target' | 'teaching_support' | 'assessment_support' | 'guidance' | 'exemplar',
    actorId: string,
  ) {
    const [existing] = await db
      .select()
      .from(curriculumSourceLinks)
      .where(
        and(
          eq(curriculumSourceLinks.targetRevisionId, targetRevisionId),
          eq(curriculumSourceLinks.resourceRevisionId, resourceRevisionId),
          eq(curriculumSourceLinks.role, role),
        ),
      )
      .limit(1)
    if (!existing)
      await db.insert(curriculumSourceLinks).values({
        targetRevisionId,
        resourceRevisionId,
        role,
        status: 'published',
        addedBy: actorId,
        publishedBy: actorId,
        publishedAt: new Date(),
      })
  }
}

async function findOrInsert<T>(find: () => Promise<T[]>, insert: () => Promise<T[]>) {
  const [existing] = await find()
  if (existing) return existing
  const [created] = await insert()
  return created
}

void seed().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
