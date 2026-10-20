import { Injectable } from '@nestjs/common'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import type { LessonPlanContent } from '@nova/shared'
import { DatabaseService } from '../database/database.service'
import { DrizzleCrudRepository } from '../database/crud/drizzle-crud.repository'
import type { DbExecutor } from '../database/executor'
import { lessonPlanRetrievalCandidates, lessonPlanValidations, lessonPlanVersionSources, lessonPlanVersions, lessonPlans, libraryResourceChunks, libraryResourceRevisions, libraryResources, planReviews } from '../database/schema'

@Injectable()
export class LessonPlanningRepository {
  private readonly plans: DrizzleCrudRepository<typeof lessonPlans>

  constructor(private readonly database: DatabaseService) {
    this.plans = new DrizzleCrudRepository(database.db, lessonPlans)
  }

  async createPlan(teacherId: string, executor: DbExecutor = this.database.db) {
    const plan = await this.plans.create({ teacherId }, executor)
    if (!plan) throw new Error('Lesson plan insert did not return a row')
    return plan
  }

  createVersion(input: {
    lessonPlanId: string
    targetRevisionId: string | null
    version: number
    content: LessonPlanContent
    createdBy: string
  }, executor: DbExecutor = this.database.db) {
    return executor.insert(lessonPlanVersions).values(input).returning()
  }

  addRetrievalCandidates(lessonPlanId: string, resourceChunkIds: string[], executor: DbExecutor = this.database.db) {
    if (resourceChunkIds.length === 0) return Promise.resolve([])
    return executor.insert(lessonPlanRetrievalCandidates).values(resourceChunkIds.map((resourceChunkId) => ({ lessonPlanId, resourceChunkId })))
  }

  addVersionSources(lessonPlanVersionId: string, resourceChunkIds: string[], executor: DbExecutor = this.database.db) {
    if (resourceChunkIds.length === 0) return Promise.resolve([])
    return executor.insert(lessonPlanVersionSources).values(resourceChunkIds.map((resourceChunkId) => ({ lessonPlanVersionId, resourceChunkId })))
  }

  planForUpdate(id: string, executor: DbExecutor = this.database.db) {
    return executor.select().from(lessonPlans).where(eq(lessonPlans.id, id)).for('update').limit(1)
  }

  updatePlanStatus(id: string, status: typeof lessonPlans.$inferInsert.status, updatedAt: Date, executor: DbExecutor = this.database.db) {
    return executor.update(lessonPlans).set({ status, updatedAt }).where(eq(lessonPlans.id, id)).returning()
  }

  createReview(input: typeof planReviews.$inferInsert, executor: DbExecutor = this.database.db) {
    return executor.insert(planReviews).values(input).returning()
  }

  createValidation(input: typeof lessonPlanValidations.$inferInsert, executor: DbExecutor = this.database.db) {
    return executor.insert(lessonPlanValidations).values(input).returning()
  }

  latestValidation(planId: string) {
    return this.database.db.select().from(lessonPlanValidations).where(eq(lessonPlanValidations.lessonPlanId, planId)).orderBy(desc(lessonPlanValidations.createdAt)).limit(1)
  }

  versionById(planId: string, versionId: string) {
    return this.database.db.select().from(lessonPlanVersions).where(and(eq(lessonPlanVersions.lessonPlanId, planId), eq(lessonPlanVersions.id, versionId))).limit(1)
  }

  versions(planId: string) {
    return this.database.db.select({ version: lessonPlanVersions.version, content: lessonPlanVersions.content, createdBy: lessonPlanVersions.createdBy, createdAt: lessonPlanVersions.createdAt })
      .from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, planId)).orderBy(desc(lessonPlanVersions.version))
  }

  retrievalCandidates(lessonPlanId: string, executor: DbExecutor = this.database.db) {
    return executor.select({ documentId: libraryResources.id, chunkId: libraryResourceChunks.id })
      .from(lessonPlanRetrievalCandidates)
      .innerJoin(libraryResourceChunks, eq(lessonPlanRetrievalCandidates.resourceChunkId, libraryResourceChunks.id))
      .innerJoin(libraryResourceRevisions, eq(libraryResourceChunks.resourceRevisionId, libraryResourceRevisions.id))
      .innerJoin(libraryResources, eq(libraryResourceRevisions.resourceId, libraryResources.id))
      .where(eq(lessonPlanRetrievalCandidates.lessonPlanId, lessonPlanId))
  }

  initialVersion(planId: string, executor: DbExecutor = this.database.db) {
    return executor.select().from(lessonPlanVersions)
      .where(eq(lessonPlanVersions.lessonPlanId, planId)).orderBy(lessonPlanVersions.version).limit(1)
  }

  plansForTeacher(teacherId: string) {
    return this.database.db.select().from(lessonPlans)
      .where(or(eq(lessonPlans.teacherId, teacherId), eq(lessonPlans.status, 'published')))
      .orderBy(desc(lessonPlans.updatedAt))
  }

  plansForLead() {
    return this.database.db.select().from(lessonPlans)
      .where(or(eq(lessonPlans.status, 'submitted'), eq(lessonPlans.status, 'published')))
      .orderBy(desc(lessonPlans.updatedAt))
  }
  latestVersions(planIds: string[]) {
    if (planIds.length === 0) return Promise.resolve([])
    return this.database.db.selectDistinctOn([lessonPlanVersions.lessonPlanId], {
      lessonPlanId: lessonPlanVersions.lessonPlanId,
      id: lessonPlanVersions.id,
      version: lessonPlanVersions.version,
      targetRevisionId: lessonPlanVersions.targetRevisionId,
      content: lessonPlanVersions.content,
    }).from(lessonPlanVersions)
      .where(inArray(lessonPlanVersions.lessonPlanId, planIds))
      .orderBy(lessonPlanVersions.lessonPlanId, desc(lessonPlanVersions.version))
  }
  plan(id: string) { return this.plans.findById(id) }
  latestVersion(planId: string, executor: DbExecutor = this.database.db) { return executor.select().from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, planId)).orderBy(desc(lessonPlanVersions.version)).limit(1) }
  reviews(planId: string) {
    return this.database.db.select({
      id: planReviews.id,
      lessonPlanId: planReviews.lessonPlanId,
      lessonPlanVersionId: planReviews.lessonPlanVersionId,
      lessonPlanVersionNumber: lessonPlanVersions.version,
      curriculumLeadId: planReviews.curriculumLeadId,
      decision: planReviews.decision,
      comment: planReviews.comment,
      createdAt: planReviews.createdAt,
    }).from(planReviews)
      .innerJoin(lessonPlanVersions, eq(planReviews.lessonPlanVersionId, lessonPlanVersions.id))
      .where(eq(planReviews.lessonPlanId, planId)).orderBy(desc(planReviews.createdAt))
  }
}
