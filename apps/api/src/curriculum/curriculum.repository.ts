import { Injectable } from '@nestjs/common'
import { and, desc, eq, or } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import { curriculumChunks, curriculumDocuments, lessonPlanVersions, lessonPlans, planReviews } from '../database/schema'

@Injectable()
export class CurriculumRepository {
  constructor(private readonly database: DatabaseService) {}

  outcomes() {
    return this.database.db.select({ id: curriculumDocuments.id, targetId: curriculumChunks.id,
      title: curriculumDocuments.title, subject: curriculumDocuments.subject, grade: curriculumDocuments.grade, content: curriculumChunks.content })
      .from(curriculumChunks).innerJoin(curriculumDocuments, eq(curriculumChunks.documentId, curriculumDocuments.id))
      .where(eq(curriculumDocuments.documentType, 'learning_outcome'))
  }

  sources() {
    return this.database.db.select({ documentId: curriculumDocuments.id, chunkId: curriculumChunks.id,
      documentType: curriculumDocuments.documentType, title: curriculumDocuments.title, subject: curriculumDocuments.subject,
      grade: curriculumDocuments.grade, content: curriculumChunks.content })
      .from(curriculumChunks).innerJoin(curriculumDocuments, eq(curriculumChunks.documentId, curriculumDocuments.id))
  }

  outcomeForTarget(targetId: string) {
    return this.database.db.select({ id: curriculumDocuments.id, targetId: curriculumChunks.id,
      title: curriculumDocuments.title, subject: curriculumDocuments.subject, grade: curriculumDocuments.grade, content: curriculumChunks.content })
      .from(curriculumChunks).innerJoin(curriculumDocuments, eq(curriculumChunks.documentId, curriculumDocuments.id))
      .where(and(eq(curriculumChunks.id, targetId), eq(curriculumDocuments.documentType, 'learning_outcome'))).limit(1)
  }

  relatedSources(subject: string, grade: string, embedding: number[], limit: number) {
    const vectorText = `[${embedding.join(',')}]`
    const distance = sql<number>`${curriculumChunks.embedding} <=> ${vectorText}::vector`
    return this.database.db.select({ id: curriculumDocuments.id, targetId: curriculumChunks.id,
      title: curriculumDocuments.title, subject: curriculumDocuments.subject, grade: curriculumDocuments.grade,
      content: curriculumChunks.content })
      .from(curriculumChunks).innerJoin(curriculumDocuments, eq(curriculumChunks.documentId, curriculumDocuments.id))
      .where(and(eq(curriculumDocuments.subject, subject), eq(curriculumDocuments.grade, grade)))
      .orderBy(distance).limit(limit)
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
  plan(id: string) { return this.database.db.select().from(lessonPlans).where(eq(lessonPlans.id, id)).limit(1) }
  latestVersion(planId: string) { return this.database.db.select().from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, planId)).orderBy(desc(lessonPlanVersions.version)).limit(1) }
  reviews(planId: string) { return this.database.db.select().from(planReviews).where(eq(planReviews.lessonPlanId, planId)).orderBy(desc(planReviews.createdAt)) }
}
