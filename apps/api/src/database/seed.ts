import 'varlock/auto-load'
import { createHash } from 'node:crypto'
import { Pool } from 'pg'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { LessonPlanContent } from '@nova/shared'
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
  lessonPlanVersionSources,
  lessonPlanVersions,
  lessonPlans,
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

const elementsAndCompoundsOutcomes = [
  {
    code: '(a)',
    locator: '1.1(a)',
    title: 'Relate atoms, elements, molecules and compounds',
    statement: 'Explain the relationship between an atom, an element, a molecule and a compound.',
  },
  {
    code: '(b)',
    locator: '1.1(b)',
    title: 'Assign symbols to selected elements',
    statement: 'Assign symbols to selected elements.',
  },
  {
    code: '(c)',
    locator: '1.1(c)',
    title: 'Represent compound formation with word equations',
    statement:
      'Write word equations to represent reactions of selected elements to form compounds.',
  },
  {
    code: '(d)',
    locator: '1.1(d)',
    title: 'Outline applications of common elements',
    statement: 'Outline the applications of common elements in the society.',
  },
  {
    code: '(e)',
    locator: '1.1(e)',
    title: 'Read packaging labels for common substances',
    statement: 'Appreciate the information on packaging labels of commonly consumed substances.',
  },
] as const

const elementsAndCompoundsSupportContent = `Grade 8 Integrated Science, Sub-strand 1.1: Elements and Compounds (18 lessons).
Coverage: atoms, elements, molecules and compounds; symbols for common elements including oxygen, carbon, hydrogen, nitrogen, iron, aluminium, copper, silver, gold, chlorine, sodium, mercury and lead; word equations for selected compounds including sodium chloride, water, carbon dioxide, copper oxide and aluminium oxide; applications of common elements in jewellery, construction, electricity, food nutrients, minerals and medals; and information on packaging labels of commonly consumed substances.
Suggested experiences: discuss the concepts; examine labelled containers and record elements or compounds; represent elements with symbols; write word equations; identify elements in two-element compounds; explore everyday uses; and use print or digital media or simulations.
Key inquiry question: Why is it important to use symbols for representing elements in day-to-day life?`

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
    title: 'Demo curriculum-lead guidance',
    locator: 'Lead note 1',
    role: 'guidance' as const,
    content:
      'DEMO ONLY, SYNTHETIC LEAD NOTE: Use paper cards, drawings, or counters; do not require heating, burning, or open flames. Offer spoken descriptions and static response cards so every task works without visual access or body movement.',
  },
  {
    type: 'teaching_note' as const,
    title: 'Demo particle diagram activity note',
    locator: 'Teaching note 2',
    role: 'teaching_support' as const,
    content:
      'DEMO ONLY, SYNTHETIC TEACHING NOTE: Draw three boxes with same-size circles. Pack circles in a regular arrangement for a solid, close together with gaps for a liquid, and far apart for a gas. Ask learners to describe spacing before discussing movement. Keep circle size constant across all three boxes.',
  },
  {
    type: 'assessment_item' as const,
    title: 'Demo particle model exit question',
    locator: 'Exit question 1',
    role: 'assessment_support' as const,
    content:
      'DEMO ONLY, SYNTHETIC ASSESSMENT ITEM: Show three particle diagrams with equal-size circles: closely packed and regular; close but irregular; widely spaced. Ask learners to match each diagram to a state and explain one difference in particle movement. A complete response uses both spacing and movement and does not say that particles grow in a gas.',
  },
  {
    type: 'exemplar' as const,
    title: 'Demo exemplar: particle model explanation',
    locator: 'Illustrative lesson excerpt',
    role: 'exemplar' as const,
    content:
      'DEMO ONLY, SYNTHETIC EXEMPLAR: In a hypothetical reviewed lesson, learners compared same-size particle cards arranged for solids, liquids, and gases. The teacher asked them to explain spacing and movement before naming each state. Learners then corrected the claim that gas particles become larger. This invented excerpt demonstrates a lesson pattern; it is not a real or approved Nova Pioneer plan.',
  },
]

const retiredSeedSourceTitles = [
  'Demo curriculum-lead note',
  'Demo reviewed lesson excerpt',
  'Demo particle assessment pack — diagnostic prompt',
  'Demo curriculum-lead guidance — accessible responses',
  'Demo particle teaching note — classroom setup',
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
    const teacherId = accountRows.find((row) => row.role === 'teacher')!.id

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

    const kicdSourceUrl =
      'https://drive.google.com/file/d/1RpqZRmeMywbc1Tya0_x-tNJBs75Gy0-v/preview'
    const officialResource = await seedResource({
      title: 'KICD Integrated Science Grade 8 learning outcome excerpt 1.2(a)',
      type: 'curriculum_design',
      authority: 'official',
      editionLabel: 'July 2024',
      sourceUrl: kicdSourceUrl,
      locator:
        'Strand 1.0 · Mixtures, Elements and Compounds / Sub-strand 1.2 · Physical and chemical changes / Specific learning outcome (a)',
      content: 'Describe the characteristics of particles in the three states of matter.',
      creatorId: leadId,
      embed,
    })
    const officialInquiryResource = await seedResource({
      title: 'KICD Integrated Science Grade 8 key inquiry question 1.2',
      type: 'curriculum_design',
      authority: 'official',
      editionLabel: 'July 2024',
      sourceUrl: kicdSourceUrl,
      locator:
        'Strand 1.0 · Mixtures, Elements and Compounds / Sub-strand 1.2 · Suggested key inquiry question',
      content: 'How does the movement of particles in matter affect its properties?',
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

    const grade8ScienceDesign = designs.get('JUNIOR:G8:INT_SCI')!
    const grade8ScienceStrand = await findOrInsert(
      () =>
        db
          .select()
          .from(curriculumNodes)
          .where(
            and(
              eq(curriculumNodes.designVersionId, grade8ScienceDesign.id),
              eq(curriculumNodes.sourceLocator, '1.0'),
            ),
          )
          .limit(1),
      () =>
        db
          .insert(curriculumNodes)
          .values({
            designVersionId: grade8ScienceDesign.id,
            kind: 'strand',
            code: '1.0',
            label: 'Mixtures, Elements and Compounds',
            sourceLocator: '1.0',
            sortOrder: 1,
          })
          .returning(),
    )
    const elementsAndCompounds = await findOrInsert(
      () =>
        db
          .select()
          .from(curriculumNodes)
          .where(
            and(
              eq(curriculumNodes.designVersionId, grade8ScienceDesign.id),
              eq(curriculumNodes.sourceLocator, '1.1'),
            ),
          )
          .limit(1),
      () =>
        db
          .insert(curriculumNodes)
          .values({
            designVersionId: grade8ScienceDesign.id,
            parentNodeId: grade8ScienceStrand.id,
            kind: 'sub_strand',
            code: '1.1',
            label: 'Elements and Compounds',
            sourceLocator: '1.1',
            sortOrder: 1,
          })
          .returning(),
    )
    const elementsAndCompoundsSupport = await seedResource({
      title: 'KICD Integrated Science Grade 8 sub-strand 1.1 curriculum guidance',
      type: 'curriculum_design',
      authority: 'official',
      editionLabel: 'July 2024',
      sourceUrl: kicdSourceUrl,
      locator:
        'Strand 1.0 · Mixtures, Elements and Compounds / Sub-strand 1.1 · Elements and Compounds',
      content: elementsAndCompoundsSupportContent,
      creatorId: leadId,
      embed,
    })

    for (const [index, outcome] of elementsAndCompoundsOutcomes.entries()) {
      const target = await findOrInsert(
        () =>
          db
            .select()
            .from(curriculumTargetRevisions)
            .where(
              and(
                eq(curriculumTargetRevisions.designVersionId, grade8ScienceDesign.id),
                eq(curriculumTargetRevisions.sourceLocator, outcome.locator),
              ),
            )
            .limit(1),
        () =>
          db
            .insert(curriculumTargetRevisions)
            .values({
              designVersionId: grade8ScienceDesign.id,
              nodeId: elementsAndCompounds.id,
              kind: 'specific_learning_outcome',
              code: outcome.code,
              sourceLocator: outcome.locator,
              title: outcome.title,
              statement: outcome.statement,
              sortOrder: index + 1,
            })
            .returning(),
      )
      const definition = await seedResource({
        title: `KICD Integrated Science Grade 8 learning outcome excerpt ${outcome.locator}`,
        type: 'curriculum_design',
        authority: 'official',
        editionLabel: 'July 2024',
        sourceUrl: kicdSourceUrl,
        locator: `Strand 1.0 · Mixtures, Elements and Compounds / Sub-strand 1.1 · Specific learning outcome ${outcome.code}`,
        content: outcome.statement,
        creatorId: leadId,
        embed,
      })
      await linkPublishedSource(target.id, definition.revision.id, 'defines_target', leadId)
      await linkPublishedSource(
        target.id,
        elementsAndCompoundsSupport.revision.id,
        'teaching_support',
        leadId,
      )
    }

    const officialTargetId = targetIdByPath.get('JUNIOR:G8:INT_SCI')!
    await linkPublishedSource(
      officialTargetId,
      officialResource.revision.id,
      'defines_target',
      leadId,
    )
    await linkPublishedSource(
      officialTargetId,
      officialInquiryResource.revision.id,
      'teaching_support',
      leadId,
    )
    const supportResources = new Map<string, Awaited<ReturnType<typeof seedResource>>>()
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
      supportResources.set(source.title, created)
      await linkPublishedSource(officialTargetId, created.revision.id, source.role, leadId)
    }
    await retireSeedSources(officialTargetId)

    const teachingNote = supportResources.get('Demo particle teaching note')!
    const seedPlanId = '00000000-0000-4000-8000-000000000101'
    const seedVersionId = '00000000-0000-4000-8000-000000000102'
    const content: LessonPlanContent = {
      title: 'Demo draft: particle models in solids, liquids and gases',
      subject: 'Integrated Science',
      grade: '8',
      learningOutcome: 'Describe the characteristics of particles in the three states of matter.',
      durationMinutes: 45,
      objectives: [
        'Describe particle spacing and arrangement in solids, liquids, and gases.',
        'Compare how particles move in each state.',
        'Explain that particles do not change size when a substance changes state.',
      ],
      materials: ['Same-size particle cards', 'Learner recording sheet'],
      starter:
        'Show three particle diagrams. Ask learners to match each diagram to a solid, liquid, or gas and explain their choice.',
      activities: [
        {
          title: 'Build particle models',
          description:
            'In pairs, arrange same-size cards to model a solid, a liquid, and a gas. Label the spacing and movement in each model.',
          durationMinutes: 15,
        },
        {
          title: 'Compare the models',
          description:
            'Groups compare their models and correct any claim that particles grow or shrink when the state changes.',
          durationMinutes: 15,
        },
        {
          title: 'Explain one state change',
          description:
            'Learners draw or describe how particle arrangement and movement change when a solid becomes a liquid.',
          durationMinutes: 10,
        },
      ],
      checkForUnderstanding:
        'Ask learners to explain why a gas fills its container without its particles becoming larger. Look for spacing and movement in the explanation.',
      sources: [
        { documentId: officialResource.resource.id, chunkId: officialResource.chunk.id },
        {
          documentId: officialInquiryResource.resource.id,
          chunkId: officialInquiryResource.chunk.id,
        },
        { documentId: teachingNote.resource.id, chunkId: teachingNote.chunk.id },
      ],
    }
    await db.insert(lessonPlans).values({ id: seedPlanId, teacherId }).onConflictDoNothing()
    await db
      .insert(lessonPlanVersions)
      .values({
        id: seedVersionId,
        lessonPlanId: seedPlanId,
        targetRevisionId: officialTargetId,
        version: 1,
        content,
        createdBy: teacherId,
      })
      .onConflictDoNothing()
    await db
      .insert(lessonPlanVersionSources)
      .values(
        content.sources.map((source) => ({
          lessonPlanVersionId: seedVersionId,
          resourceChunkId: source.chunkId,
        })),
      )
      .onConflictDoNothing()

    console.log(
      `Seeded ${seedAccounts.length} local accounts, ${supportedPaths.length} CBC catalogue paths, ${elementsAndCompoundsOutcomes.length + 1} generation-ready Grade 8 Integrated Science outcomes, ${supportingSources.length + elementsAndCompoundsOutcomes.length + 3} source passages, and one target-linked lesson-plan draft.`,
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
    const [chunk] = await db
      .select()
      .from(libraryResourceChunks)
      .where(
        and(
          eq(libraryResourceChunks.resourceRevisionId, revision.id),
          eq(libraryResourceChunks.ordinal, 0),
        ),
      )
      .limit(1)
    if (!chunk) throw new Error(`Resource chunk seed failed for ${input.title}`)
    return { resource, revision, chunk }
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

  async function retireSeedSources(targetRevisionId: string) {
    const obsoleteLinks = await db
      .select({ id: curriculumSourceLinks.id })
      .from(curriculumSourceLinks)
      .innerJoin(
        libraryResourceRevisions,
        eq(curriculumSourceLinks.resourceRevisionId, libraryResourceRevisions.id),
      )
      .innerJoin(libraryResources, eq(libraryResourceRevisions.resourceId, libraryResources.id))
      .where(
        and(
          eq(curriculumSourceLinks.targetRevisionId, targetRevisionId),
          eq(curriculumSourceLinks.status, 'published'),
          eq(libraryResources.authority, 'synthetic'),
          inArray(libraryResources.title, retiredSeedSourceTitles),
        ),
      )

    if (obsoleteLinks.length === 0) return
    await db
      .update(curriculumSourceLinks)
      .set({ status: 'retired' })
      .where(
        inArray(
          curriculumSourceLinks.id,
          obsoleteLinks.map(({ id }) => id),
        ),
      )
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
