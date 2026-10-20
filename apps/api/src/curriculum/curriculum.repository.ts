import { Injectable } from '@nestjs/common'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import type { DbExecutor } from '../database/executor'
import { curriculumChunks, curriculumDocuments, lessonPlanVersions, lessonPlans, planReviews } from '../database/schema'

@Injectable()
export class CurriculumRepository {
  constructor(private readonly database: DatabaseService) {}

  sources(executor: DbExecutor = this.database.db) {
    return executor.select({ documentId: curriculumDocuments.id, chunkId: curriculumChunks.id,
      documentType: curriculumDocuments.documentType, title: curriculumDocuments.title, subject: curriculumDocuments.subject,
      grade: curriculumDocuments.grade, content: curriculumChunks.content })
      .from(curriculumChunks).innerJoin(curriculumDocuments, eq(curriculumChunks.documentId, curriculumDocuments.id))
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
  plan(id: string) { return this.database.db.select().from(lessonPlans).where(eq(lessonPlans.id, id)).limit(1) }
  latestVersion(planId: string) { return this.database.db.select().from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, planId)).orderBy(desc(lessonPlanVersions.version)).limit(1) }
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
