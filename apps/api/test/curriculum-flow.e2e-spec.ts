import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { eq, inArray } from 'drizzle-orm'
import supertest = require('supertest')
import { configureHttp } from '../src/configure-http'
import { DatabaseService } from '../src/database/database.service'
import {
  curriculumSourceLinks,
  lessonPlanRetrievalCandidates,
  lessonPlanValidations,
  lessonPlanVersionSources,
  lessonPlanVersions,
  lessonPlans,
  planReviews,
  users,
} from '../src/database/schema'
import { hashPassword } from '../src/auth/password'
import { CurriculumLibraryRepository } from '../src/curriculum-library/curriculum-library.repository'
import { EmbeddingAdapter } from '../src/embeddings/embedding.service'

const databaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip
const llmEnvironmentKeys = [
  'LLM_PROVIDER',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_GENERATOR_MODEL',
  'LLM_REVIEWER_MODEL',
] as const
const originalLlmEnvironment = new Map(llmEnvironmentKeys.map((key) => [key, process.env[key]]))

describeWithDatabase('lesson plan HTTP workflow', () => {
  let app: NestFastifyApplication
  let database: DatabaseService
  const otherTeacherId = randomUUID()
  const otherTeacherEmail = `teacher-${otherTeacherId}@example.test`
  const createdPlanIds: string[] = []
  const createdSourceLinkIds: string[] = []

  beforeAll(async () => {
    for (const key of llmEnvironmentKeys) delete process.env[key]
    process.env.DATABASE_URL = databaseUrl
    process.env.DATABASE_POOL_MAX = '1'
    process.env.NODE_ENV = 'test'
    process.env.AUTH_SECRET = 'nova-isolated-e2e-auth-secret-2026'
    process.env.LLM_PROVIDER = 'mock'
    process.env.EMBEDDING_PROVIDER = 'mock'
    process.env.OTEL_ENABLED = 'false'

    const { AppModule } = await import('../src/app.module')
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    )
    await configureHttp(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    database = app.get(DatabaseService)
    await database.db.insert(users).values({
      id: otherTeacherId,
      email: otherTeacherEmail,
      role: 'teacher',
      passwordHash: await hashPassword('NovaLocal123!'),
    })
  })

  afterAll(async () => {
    try {
      if (database)
        await database.db.transaction(async (tx) => {
          if (createdPlanIds.length) {
            const versions = await tx
              .select({ id: lessonPlanVersions.id })
              .from(lessonPlanVersions)
              .where(inArray(lessonPlanVersions.lessonPlanId, createdPlanIds))
            await tx.delete(planReviews).where(inArray(planReviews.lessonPlanId, createdPlanIds))
            await tx
              .delete(lessonPlanValidations)
              .where(inArray(lessonPlanValidations.lessonPlanId, createdPlanIds))
            if (versions.length)
              await tx.delete(lessonPlanVersionSources).where(
                inArray(
                  lessonPlanVersionSources.lessonPlanVersionId,
                  versions.map((version) => version.id),
                ),
              )
            await tx
              .delete(lessonPlanRetrievalCandidates)
              .where(inArray(lessonPlanRetrievalCandidates.lessonPlanId, createdPlanIds))
            await tx
              .delete(lessonPlanVersions)
              .where(inArray(lessonPlanVersions.lessonPlanId, createdPlanIds))
            await tx.delete(lessonPlans).where(inArray(lessonPlans.id, createdPlanIds))
          }
          if (createdSourceLinkIds.length)
            await tx
              .delete(curriculumSourceLinks)
              .where(inArray(curriculumSourceLinks.id, createdSourceLinkIds))
          await tx.delete(users).where(eq(users.id, otherTeacherId))
        })
    } finally {
      if (app) await app.close()
      for (const key of llmEnvironmentKeys) {
        const value = originalLlmEnvironment.get(key)
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  it('grounds a draft, enforces access, records immutable review versions, and publishes', async () => {
    const teacherCookie = await login('teacher@example.test')
    const otherTeacherCookie = await login(otherTeacherEmail)
    const leadCookie = await login('curriculum-lead@example.test')

    const llmMode = await request<{ mode: string; liveAvailable: boolean; missing: string[] }>(
      teacherCookie,
      'GET',
      '/api/runtime/llm',
    )
    expect(llmMode.body).toMatchObject({ mode: 'mock', liveAvailable: false })
    expect(llmMode.body.missing).toEqual(
      expect.arrayContaining(['LLM_BASE_URL', 'LLM_GENERATOR_MODEL', 'LLM_API_KEY']),
    )
    const unavailableLive = await request<{ code: string }>(
      teacherCookie,
      'PUT',
      '/api/runtime/llm',
      { mode: 'live' },
    )
    expect(unavailableLive.statusCode).toBe(400)
    expect(unavailableLive.body.code).toBe('LLM_CREDENTIALS_MISSING')

    const catalogue = await request<{ offerings: Offering[] }>(
      teacherCookie,
      'GET',
      '/api/curriculum/library',
    )
    const targets = catalogue.body.offerings.flatMap((offering) =>
      offering.designs.flatMap((design) => design.targets),
    )
    const target = targets.find(
      (candidate) =>
        candidate.statement ===
        'Describe the characteristics of particles in the three states of matter.',
    )
    const browseOnlyTarget = targets.find((candidate) => !candidate.generationReady)
    expect(target).toBeDefined()
    expect(browseOnlyTarget).toBeDefined()

    const ungrounded = await request<{ code: string }>(
      teacherCookie,
      'POST',
      `/api/lesson-plans/generate`,
      {
        targetRevisionId: browseOnlyTarget!.id,
        durationMinutes: 40,
      },
    )
    expect(ungrounded.statusCode).toBe(400)
    expect(ungrounded.body.code).toBe('CURRICULUM_SOURCES_MISSING')

    const queryEmbedding = await app.get(EmbeddingAdapter).embedQuery(target!.statement)
    const libraryRepository = app.get(CurriculumLibraryRepository)
    const definitions = await libraryRepository.targetDefinitionChunks(target!.id)
    const definitionIds = new Set(definitions.map((source) => source.chunkId))
    const firstSupportingCandidate = (
      await libraryRepository.sourceChunksForTarget(target!.id, queryEmbedding, 20)
    ).find((source) => !definitionIds.has(source.chunkId))
    expect(firstSupportingCandidate).toBeDefined()
    const supportingSource = target!.sources.find(
      (source) => source.chunkId === firstSupportingCandidate!.chunkId && source.linkId,
    )
    expect(supportingSource).toBeDefined()
    const duplicateRole =
      supportingSource!.role === 'teaching_support' ? 'guidance' : 'teaching_support'
    const [lead] = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'curriculum-lead@example.test'))
      .limit(1)
    const createdLinks = await database.db
      .insert(curriculumSourceLinks)
      .values({
        targetRevisionId: target!.id,
        resourceRevisionId: supportingSource!.resourceRevisionId,
        role: duplicateRole,
        status: 'published',
        addedBy: lead.id,
        publishedBy: lead.id,
        publishedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: curriculumSourceLinks.id })
    createdSourceLinkIds.push(...createdLinks.map((link) => link.id))

    const generated = await request<{
      plan: Plan
      qa: { passed: boolean }
      rubricQa: {
        status: string
        lessonPlanVersionId: string
        dimensions: Array<{ key: string; score: number }>
      }
    }>(teacherCookie, 'POST', '/api/lesson-plans/generate', {
      targetRevisionId: target!.id,
      durationMinutes: 40,
    })
    expect(generated.statusCode).toBe(201)
    createdPlanIds.push(generated.body.plan.id)
    expect(generated.body.qa.passed).toBe(true)
    expect(generated.body.plan.status).toBe('draft')
    expect(generated.body.rubricQa).toMatchObject({
      status: 'completed',
      lessonPlanVersionId: generated.body.plan.versionId,
    })
    expect(generated.body.rubricQa.dimensions.map((dimension) => dimension.key)).toHaveLength(6)
    const retrievalCandidates = await database.db
      .select({ resourceChunkId: lessonPlanRetrievalCandidates.resourceChunkId })
      .from(lessonPlanRetrievalCandidates)
      .where(eq(lessonPlanRetrievalCandidates.lessonPlanId, generated.body.plan.id))
    expect(new Set(retrievalCandidates.map((candidate) => candidate.resourceChunkId)).size).toBe(
      retrievalCandidates.length,
    )

    const original = generated.body.plan
    expect(
      (await request(otherTeacherCookie, 'GET', `/api/lesson-plans/${original.id}`)).statusCode,
    ).toBe(403)
    expect(
      (
        await request(otherTeacherCookie, 'POST', `/api/lesson-plans/${original.id}/validate`, {
          versionId: original.versionId,
        })
      ).statusCode,
    ).toBe(403)
    const leadCannotEdit = await request(leadCookie, 'PATCH', `/api/lesson-plans/${original.id}`, {
      content: original.content,
    })
    expect(leadCannotEdit.statusCode).toBe(403)
    const targetSource = target!.sources.find(
      (source) => source.role === 'defines_target' && source.authority === 'official',
    )
    expect(targetSource).toBeDefined()
    const targetCitation = original.content.sources.find(
      (source) => source.chunkId === targetSource!.chunkId,
    )
    const supportingCitation = original.content.sources.find(
      (source) => source.chunkId !== targetSource!.chunkId,
    )
    expect(targetCitation).toBeDefined()
    expect(supportingCitation).toBeDefined()

    const targetOnly = {
      ...original.content,
      title: 'Teacher edit: particle states',
      sources: [targetCitation!],
    }
    const firstEdit = await request<{ plan: Plan }>(
      teacherCookie,
      'PATCH',
      `/api/lesson-plans/${original.id}`,
      { content: targetOnly },
    )
    expect(firstEdit.statusCode).toBe(200)
    expect(firstEdit.body.plan.version).toBe(2)

    const expandedCitations = { ...targetOnly, sources: [targetCitation!, supportingCitation!] }
    const secondEdit = await request<{ plan: Plan }>(
      teacherCookie,
      'PATCH',
      `/api/lesson-plans/${original.id}`,
      { content: expandedCitations },
    )
    expect(secondEdit.statusCode).toBe(200)
    expect(secondEdit.body.plan.version).toBe(3)

    const validated = await request<{
      validation: {
        lessonPlanVersionId: string
        status: string
        dimensions: Array<{ key: string }>
      }
    }>(teacherCookie, 'POST', `/api/lesson-plans/${original.id}/validate`, {
      versionId: secondEdit.body.plan.versionId,
    })
    expect(validated.statusCode).toBe(201)
    expect(validated.body.validation).toMatchObject({
      lessonPlanVersionId: secondEdit.body.plan.versionId,
      status: 'completed',
    })
    expect(validated.body.validation.dimensions).toHaveLength(6)
    expect(
      (
        await request<{ rubricQa: { lessonPlanVersionId: string } }>(
          teacherCookie,
          'GET',
          `/api/lesson-plans/${original.id}`,
        )
      ).body.rubricQa.lessonPlanVersionId,
    ).toBe(secondEdit.body.plan.versionId)

    const forgedCitation = {
      ...expandedCitations,
      sources: [
        ...expandedCitations.sources,
        {
          documentId: '00000000-0000-4000-8000-000000000099',
          chunkId: '00000000-0000-4000-8000-000000000098',
        },
      ],
    }
    const rejectedCitation = await request<{ code: string }>(
      teacherCookie,
      'PATCH',
      `/api/lesson-plans/${original.id}`,
      { content: forgedCitation },
    )
    expect(rejectedCitation.statusCode).toBe(422)
    expect(rejectedCitation.body.code).toBe('LESSON_PLAN_QA_FAILED')

    const hiddenDraft = await request(leadCookie, 'GET', `/api/lesson-plans/${original.id}`)
    expect(hiddenDraft.statusCode).toBe(403)

    const submitted = await request<{ plan: Plan }>(
      teacherCookie,
      'POST',
      `/api/lesson-plans/${original.id}/submit`,
    )
    expect(submitted.statusCode).toBe(201)
    expect(submitted.body.plan.status).toBe('submitted')
    expect((await request(leadCookie, 'GET', `/api/lesson-plans/${original.id}`)).statusCode).toBe(
      200,
    )
    for (const decision of ['returned', 'published']) {
      const deniedReview = await request(
        teacherCookie,
        'POST',
        `/api/lesson-plans/${original.id}/reviews`,
        {
          decision,
          comment: 'Add a check for the particle size misconception.',
        },
      )
      expect(deniedReview.statusCode).toBe(403)
    }
    const afterDeniedReviews = await request<{ plan: Plan; reviews: Review[] }>(
      teacherCookie,
      'GET',
      `/api/lesson-plans/${original.id}`,
    )
    expect(afterDeniedReviews.statusCode).toBe(200)
    expect(afterDeniedReviews.body.plan.status).toBe('submitted')
    expect(afterDeniedReviews.body.reviews).toEqual([])

    const returned = await request<{ plan: Plan; review: Review }>(
      leadCookie,
      'POST',
      `/api/lesson-plans/${original.id}/reviews`,
      {
        decision: 'returned',
        comment: 'Add a check for the particle size misconception.',
      },
    )
    expect(returned.statusCode).toBe(201)
    expect(returned.body.plan.status).toBe('returned')
    expect(returned.body.review.lessonPlanVersionNumber).toBe(3)
    expect((await request(leadCookie, 'GET', `/api/lesson-plans/${original.id}`)).statusCode).toBe(
      403,
    )

    const revisedContent = { ...expandedCitations, title: 'Revised: particle states' }
    const revised = await request<{ plan: Plan }>(
      teacherCookie,
      'PATCH',
      `/api/lesson-plans/${original.id}`,
      { content: revisedContent },
    )
    expect(revised.statusCode).toBe(200)
    expect(revised.body.plan.status).toBe('draft')
    expect(revised.body.plan.version).toBe(4)
    expect(
      (await request(teacherCookie, 'POST', `/api/lesson-plans/${original.id}/submit`)).statusCode,
    ).toBe(201)

    const published = await request<{ plan: Plan; review: Review }>(
      leadCookie,
      'POST',
      `/api/lesson-plans/${original.id}/reviews`,
      { decision: 'published' },
    )
    expect(published.statusCode).toBe(201)
    expect(published.body.plan.status).toBe('published')
    expect(published.body.review.lessonPlanVersionNumber).toBe(4)

    const details = await request<{ plan: Plan; reviews: Review[]; versions: Version[] }>(
      teacherCookie,
      'GET',
      `/api/lesson-plans/${original.id}`,
    )
    expect(details.statusCode).toBe(200)
    expect(details.body.plan.status).toBe('published')
    expect(details.body.versions.map((version) => version.version).sort()).toEqual([1, 2, 3, 4])
    expect(
      details.body.reviews.map((review) => [review.decision, review.lessonPlanVersionNumber]),
    ).toEqual([
      ['published', 4],
      ['returned', 3],
    ])
    expect(
      (
        await request(teacherCookie, 'PATCH', `/api/lesson-plans/${original.id}`, {
          content: revisedContent,
        })
      ).statusCode,
    ).toBe(409)
  })

  async function login(email: string) {
    const response = await supertest(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'NovaLocal123!' })
    expect(response.statusCode).toBe(200)
    const setCookie = response.headers['set-cookie']
    const firstCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie
    const cookie = firstCookie?.split(';', 1)[0]
    expect(cookie).toMatch(/^nova_access=/)
    return cookie!
  }

  async function request<T = unknown>(
    cookie: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    url: string,
    payload?: Record<string, unknown>,
  ) {
    const testRequest = supertest(app.getHttpServer())
    const pending =
      method === 'GET'
        ? testRequest.get(url)
        : method === 'POST'
          ? testRequest.post(url)
          : method === 'PUT'
            ? testRequest.put(url)
            : testRequest.patch(url)
    const response = await (payload === undefined
      ? pending.set('Cookie', cookie)
      : pending.set('Cookie', cookie).send(payload))
    return { statusCode: response.statusCode, body: response.body as T }
  }
})

type Plan = {
  id: string
  versionId: string
  status: string
  version: number
  content: { title: string; sources: Array<{ documentId: string; chunkId: string }> }
}

type Offering = {
  designs: Array<{
    targets: Array<{
      id: string
      statement: string
      generationReady: boolean
      sources: Array<{
        linkId: string | null
        resourceRevisionId: string
        chunkId: string
        role: string
        authority: string
      }>
    }>
  }>
}

type Review = { decision: string; lessonPlanVersionNumber: number }
type Version = { version: number }
