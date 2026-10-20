import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { UnprocessableEntityException } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'
import { CurriculumOutcomeDtoSchema, CurriculumSourceDtoSchema, hasValidReturnComment, LessonPlanContentSchema, transitionLessonPlan, type ApiPrincipal, type LessonPlanAction, type LessonPlanContent, type LessonPlanStatus } from '@nova/shared'
import { DatabaseService } from '../database/database.service'
import { lessonPlanVersions, lessonPlans, planReviews } from '../database/schema'
import { LessonPlanGenerator } from './lesson-plan-generator'
import { CurriculumRepository } from './curriculum.repository'
import { EmbeddingAdapter } from './embedding.service'
import { EmbeddingError } from './embedding.adapter'
import type { ZodIssue } from 'zod'

@Injectable()
export class CurriculumService {
  constructor(private readonly database: DatabaseService, private readonly repository: CurriculumRepository, private readonly generator: LessonPlanGenerator, private readonly embeddings: EmbeddingAdapter) {}

  async outcomes() {
    const rows = await this.repository.outcomes()
    return rows.map((row) => CurriculumOutcomeDtoSchema.parse(row))
  }

  async sources() {
    return (await this.repository.sources()).map((source) => CurriculumSourceDtoSchema.parse(source))
  }

  async list(principal: ApiPrincipal) {
    const isLead = principal.roles.includes('curriculum_lead')
    const plans = isLead ? await this.repository.plansForLead() : await this.repository.plansForTeacher(principal.subject)
    return Promise.all(plans.map((plan) => this.dto(plan.id)))
  }

  async get(id: string, principal: ApiPrincipal) {
    const plan = await this.plan(id)
    assertCanReadPlan(plan.teacherId, plan.status, principal)
    return this.dto(id)
  }

  async reviews(id: string) {
    await this.plan(id)
    return this.repository.reviews(id)
  }

  async versions(id: string) {
    return this.database.db.select({ version: lessonPlanVersions.version, content: lessonPlanVersions.content, createdBy: lessonPlanVersions.createdBy, createdAt: lessonPlanVersions.createdAt })
      .from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, id)).orderBy(desc(lessonPlanVersions.version))
  }

  async generate(principal: ApiPrincipal, targetId: string, durationMinutes: number) {
    const [row] = await this.repository.outcomeForTarget(targetId)
    if (!row) throw new NotFoundException('Curriculum outcome not found')
    const outcome = CurriculumOutcomeDtoSchema.parse(row)
    const queryEmbedding = await this.embedQuery(outcome.content)
    const siblings = await this.repository.relatedSources(outcome.subject, outcome.grade, queryEmbedding, 5)
    const targetSource = { ...outcome }
    const sources = [targetSource, ...siblings.filter((source) => source.targetId !== outcome.targetId)
      .map((source) => CurriculumOutcomeDtoSchema.parse(source)).slice(0, 4)]
    const content = await this.generator.generate(outcome, sources, durationMinutes)
    const [plan] = await this.database.db.transaction(async (tx) => {
      const [created] = await tx.insert(lessonPlans).values({ teacherId: principal.subject }).returning()
      await tx.insert(lessonPlanVersions).values({ lessonPlanId: created.id, version: 1, content, createdBy: principal.subject })
      return [created]
    })
    return this.dto(plan.id)
  }

  async edit(id: string, principal: ApiPrincipal, content: unknown) {
    await this.database.db.transaction(async (tx) => {
      const [plan] = await tx.select().from(lessonPlans).where(eq(lessonPlans.id, id)).for('update').limit(1)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      this.assertTeacherOwns(plan.teacherId, principal)
      const nextStatus = transitionPlanStatus(plan.status, 'edit')
      const valid = LessonPlanContentSchema.safeParse(content)
      if (!valid.success) {
        const errors = formatLessonPlanSchemaIssues(valid.error.issues)
        throw new UnprocessableEntityException({ code: 'LESSON_PLAN_QA_FAILED', message: `Fix these lesson plan fields before saving: ${errors.map(({ field, message }) => `${field}: ${message}`).join('; ')}.`, errors })
      }
      await this.assertPlanQa(id, valid.data)
      const [latest] = await tx.select().from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, id)).orderBy(desc(lessonPlanVersions.version)).limit(1)
      await tx.insert(lessonPlanVersions).values({ lessonPlanId: id, version: (latest?.version ?? 0) + 1, content: valid.data, createdBy: principal.subject })
      await tx.update(lessonPlans).set({ status: nextStatus, updatedAt: new Date() }).where(eq(lessonPlans.id, id))
    })
    return this.dto(id)
  }

  async submit(id: string, principal: ApiPrincipal) {
    await this.database.db.transaction(async (tx) => {
      const [plan] = await tx.select().from(lessonPlans).where(eq(lessonPlans.id, id)).for('update').limit(1)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      this.assertTeacherOwns(plan.teacherId, principal)
      const nextStatus = transitionPlanStatus(plan.status, 'submit')
      const [latest] = await tx.select().from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, id)).orderBy(desc(lessonPlanVersions.version)).limit(1)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      await this.assertPlanQa(id, latest.content)
      await tx.update(lessonPlans).set({ status: nextStatus, updatedAt: new Date() }).where(eq(lessonPlans.id, id))
    })
    return this.dto(id)
  }

  async review(id: string, principal: ApiPrincipal, decision: 'returned' | 'published', comment?: string) {
    assertCurriculumLead(principal)
    const [review] = await this.database.db.transaction(async (tx) => {
      const [plan] = await tx.select().from(lessonPlans).where(eq(lessonPlans.id, id)).for('update').limit(1)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      const nextStatus = transitionPlanStatus(plan.status, decision)
      const normalizedComment = validateReviewComment(decision, comment)
      if (decision === 'published') {
        const [latest] = await tx.select().from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, id)).orderBy(desc(lessonPlanVersions.version)).limit(1)
        if (!latest) throw new NotFoundException('Lesson plan content not found')
        await this.assertPlanQa(id, latest.content)
      }
      await tx.update(lessonPlans).set({ status: nextStatus, updatedAt: new Date() }).where(eq(lessonPlans.id, id))
      const [created] = await tx.insert(planReviews).values({ lessonPlanId: id, curriculumLeadId: principal.subject, decision, comment: normalizedComment }).returning()
      return [created]
    })
    return { review, plan: await this.dto(id) }
  }

  private async dto(id: string) {
    const plan = await this.plan(id)
    const [latest] = await this.database.db.select().from(lessonPlanVersions).where(eq(lessonPlanVersions.lessonPlanId, id)).orderBy(desc(lessonPlanVersions.version)).limit(1)
    if (!latest) throw new NotFoundException('Lesson plan content not found')
    return { id: plan.id, teacherId: plan.teacherId, status: plan.status, content: latest.content, version: latest.version,
      createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString() }
  }
  private async plan(id: string) {
    const [plan] = await this.repository.plan(id)
    if (!plan) throw new NotFoundException('Lesson plan not found')
    return plan
  }
  private assertTeacherOwns(owner: string, principal: ApiPrincipal) {
    assertTeacherOwns(owner, principal)
  }

  private async embedQuery(content: string) {
    try {
      return await this.embeddings.embedQuery(content)
    } catch (error) {
      if (error instanceof EmbeddingError) throw new ServiceUnavailableException({ code: error.code, message: error.message })
      throw error
    }
  }

  private async assertPlanQa(id: string, content: LessonPlanContent) {
    const sourcesExist = await this.citationsExist(content)
    const sourcesAllowed = await this.citationsAllowed(id, content)
    validatePlanQa(content, sourcesExist, sourcesAllowed)
  }

  async citationsExist(content: LessonPlanContent) {
    const sources = await this.repository.sources()
    const available = new Set(sources.map((source) => `${source.documentId}:${source.chunkId}`))
    return content.sources.every((source) => available.has(`${source.documentId}:${source.chunkId}`))
  }

  async citationsAllowed(id: string, content: LessonPlanContent) {
    const [initial] = await this.database.db.select().from(lessonPlanVersions)
      .where(eq(lessonPlanVersions.lessonPlanId, id)).orderBy(lessonPlanVersions.version).limit(1)
    return citationsWithinCandidateSet(content.sources, initial?.content.sources ?? [])
  }
}

export function assertTeacherOwns(owner: string, principal: ApiPrincipal) {
  if (!principal.roles.includes('teacher') || owner !== principal.subject) throw new ForbiddenException()
}

export function assertCurriculumLead(principal: ApiPrincipal) {
  if (!principal.roles.includes('curriculum_lead')) throw new ForbiddenException()
}

export function assertCanReadPlan(owner: string, status: string, principal: ApiPrincipal) {
  if (owner === principal.subject || status === 'published' ||
    (principal.roles.includes('curriculum_lead') && status === 'submitted')) return
  throw new ForbiddenException()
}

export function transitionPlanStatus(status: LessonPlanStatus, action: LessonPlanAction): LessonPlanStatus {
  const result = transitionLessonPlan(status, action)
  if (!result.ok) throw new ConflictException({ code: result.code, message: result.message })
  return result.status
}

export function validateReviewComment(decision: 'returned' | 'published', comment?: string) {
  const normalized = comment?.trim()
  if (decision === 'returned' && (!normalized || !hasValidReturnComment(normalized))) {
    throw new BadRequestException({ code: 'REVIEW_COMMENT_REQUIRED', message: 'Add an actionable return reason with at least eight non-space characters.' })
  }
  return normalized || undefined
}

export function formatLessonPlanSchemaIssues(issues: readonly ZodIssue[]) {
  return issues.map(({ path, message }) => ({ field: path.length ? path.join('.') : 'content', message }))
}

export function planDurationMatches(content: LessonPlanContent) {
  return content.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0) === content.durationMinutes
}

export function validatePlanQa(content: unknown, sourcesExist: boolean, sourcesAllowed: boolean): asserts content is LessonPlanContent {
  const valid = LessonPlanContentSchema.safeParse(content)
  const durationMatches = valid.success && planDurationMatches(valid.data)
  if (!valid.success || !durationMatches || !sourcesExist || !sourcesAllowed) {
    const issues = [
      ...(!valid.success ? ['content must match the lesson plan schema'] : []),
      ...(!durationMatches ? ['activity durations must sum to the lesson duration'] : []),
      ...(!sourcesExist ? ['every citation must reference an existing curriculum chunk'] : []),
      ...(!sourcesAllowed ? ['citations must come from the original retrieved source set'] : []),
    ]
    throw new UnprocessableEntityException({ code: 'LESSON_PLAN_QA_FAILED', message: `Fix these lesson plan checks before continuing: ${issues.join('; ')}.` })
  }
}

export function citationsWithinCandidateSet(citations: LessonPlanContent['sources'], candidates: LessonPlanContent['sources']) {
  const candidateSet = new Set(candidates.map((source) => `${source.documentId}:${source.chunkId}`))
  return citations.every((source) => candidateSet.has(`${source.documentId}:${source.chunkId}`))
}
