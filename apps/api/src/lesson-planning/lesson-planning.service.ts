import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { UnprocessableEntityException } from '@nestjs/common'
import { hasValidReturnComment, LessonPlanContentSchema, transitionLessonPlan, type ApiPrincipal, type LessonPlanAction, type LessonPlanContent, type LessonPlanStatus } from '@nova/shared'
import { DatabaseService } from '../database/database.service'
import type { DbExecutor } from '../database/executor'
import { LessonPlanGenerator } from './lesson-plan-generator'
import { LessonPlanningRepository } from './lesson-planning.repository'
import { EmbeddingAdapter } from '../embeddings/embedding.service'
import { EmbeddingError } from '../embeddings/embedding.adapter'
import { CurriculumLibraryService } from '../curriculum-library/curriculum-library.service'
import type { ZodIssue } from 'zod'

@Injectable()
export class LessonPlanningService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: LessonPlanningRepository,
    private readonly library: CurriculumLibraryService,
    private readonly generator: LessonPlanGenerator,
    private readonly embeddings: EmbeddingAdapter,
  ) {}

  async list(principal: ApiPrincipal) {
    const isLead = principal.roles.includes('curriculum_lead')
    const plans = isLead ? await this.repository.plansForLead() : await this.repository.plansForTeacher(principal.subject)
    const versions = await this.repository.latestVersions(plans.map((plan) => plan.id))
    const versionByPlan = new Map(versions.map((version) => [version.lessonPlanId, version]))
    return plans.map((plan) => {
      const latest = versionByPlan.get(plan.id)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      return {
        id: plan.id,
        teacherId: plan.teacherId,
        status: plan.status,
        targetRevisionId: latest.targetRevisionId,
        versionId: latest.id,
        content: latest.content,
        version: latest.version,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      }
    })
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
    return this.repository.versions(id)
  }

  async generate(principal: ApiPrincipal, targetRevisionId: string, durationMinutes: number) {
    const outcome = await this.library.outcomeForGeneration(targetRevisionId)
    const queryEmbedding = await this.embedQuery(outcome.content)
    const sources = await this.library.sourceChunksForGeneration(targetRevisionId, queryEmbedding, outcome.subject, outcome.grade)
    const content = await this.generator.generate(outcome, sources, durationMinutes)
    const plan = await this.database.db.transaction(async (tx) => {
      const created = await this.repository.createPlan(principal.subject, tx)
      const [version] = await this.repository.createVersion({
        lessonPlanId: created.id,
        targetRevisionId,
        version: 1,
        content,
        createdBy: principal.subject,
      }, tx)
      const candidateChunkIds = new Set(sources.map((source) => source.chunkId))
      await this.repository.addRetrievalCandidates(created.id, [...candidateChunkIds], tx)
      await this.repository.addVersionSources(version.id, content.sources.map((source) => source.chunkId), tx)
      return created
    })
    return this.dto(plan.id)
  }

  async edit(id: string, principal: ApiPrincipal, content: unknown) {
    await this.database.db.transaction(async (tx) => {
      const [plan] = await this.repository.planForUpdate(id, tx)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      this.assertTeacherOwns(plan.teacherId, principal)
      const nextStatus = transitionPlanStatus(plan.status, 'edit')
      const valid = LessonPlanContentSchema.safeParse(content)
      if (!valid.success) {
        const errors = formatLessonPlanSchemaIssues(valid.error.issues)
        throw new UnprocessableEntityException({ code: 'LESSON_PLAN_QA_FAILED', message: `Fix these lesson plan fields before saving: ${errors.map(({ field, message }) => `${field}: ${message}`).join('; ')}.`, errors })
      }
      const [latest] = await this.repository.latestVersion(id, tx)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      validatePlanContext(latest.targetRevisionId, latest.content, valid.data)
      await this.assertPlanQa(id, latest.targetRevisionId, valid.data, tx)
      const [version] = await this.repository.createVersion({
        lessonPlanId: id,
        targetRevisionId: latest.targetRevisionId,
        version: latest.version + 1,
        content: valid.data,
        createdBy: principal.subject,
      }, tx)
      await this.repository.addVersionSources(version.id, valid.data.sources.map((source) => source.chunkId), tx)
      await this.repository.updatePlanStatus(id, nextStatus, new Date(), tx)
    })
    return this.dto(id)
  }

  async submit(id: string, principal: ApiPrincipal) {
    await this.database.db.transaction(async (tx) => {
      const [plan] = await this.repository.planForUpdate(id, tx)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      this.assertTeacherOwns(plan.teacherId, principal)
      const nextStatus = transitionPlanStatus(plan.status, 'submit')
      const [latest] = await this.repository.latestVersion(id, tx)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      await this.assertPlanQa(id, latest.targetRevisionId, latest.content, tx)
      await this.repository.updatePlanStatus(id, nextStatus, new Date(), tx)
    })
    return this.dto(id)
  }

  async review(id: string, principal: ApiPrincipal, decision: 'returned' | 'published', comment?: string) {
    assertCurriculumLead(principal)
    const [review] = await this.database.db.transaction(async (tx) => {
      const [plan] = await this.repository.planForUpdate(id, tx)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      const nextStatus = transitionPlanStatus(plan.status, decision)
      const normalizedComment = validateReviewComment(decision, comment)
      const [latest] = await this.repository.latestVersion(id, tx)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      if (decision === 'published') await this.assertPlanQa(id, latest.targetRevisionId, latest.content, tx)
      await this.repository.updatePlanStatus(id, nextStatus, new Date(), tx)
      const [created] = await this.repository.createReview({
        lessonPlanId: id,
        lessonPlanVersionId: latest.id,
        curriculumLeadId: principal.subject,
        decision,
        comment: normalizedComment,
      }, tx)
      return [{ ...created, lessonPlanVersionNumber: latest.version }]
    })
    return { review, plan: await this.dto(id) }
  }

  private async dto(id: string) {
    const plan = await this.plan(id)
    const [latest] = await this.repository.latestVersion(id)
    if (!latest) throw new NotFoundException('Lesson plan content not found')
    return { id: plan.id, teacherId: plan.teacherId, status: plan.status, targetRevisionId: latest.targetRevisionId, versionId: latest.id, content: latest.content, version: latest.version,
      createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString() }
  }
  private async plan(id: string) {
    const plan = await this.repository.plan(id)
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

  private async assertPlanQa(id: string, targetRevisionId: string | null, content: LessonPlanContent, executor: DbExecutor = this.database.db) {
    const sourcesExist = await this.citationsExist(content, targetRevisionId, executor)
    const sourcesAllowed = await this.citationsAllowed(id, content, executor)
    validatePlanQa(content, sourcesExist, sourcesAllowed)
  }

  async citationsExist(content: LessonPlanContent, targetRevisionId: string | null, executor: DbExecutor = this.database.db) {
    if (!targetRevisionId) return false
    const sources = await this.library.sourceDetailsForTarget(targetRevisionId, executor)
    const available = new Set(sources.map((source) => `${source.documentId}:${source.chunkId}`))
    const referencesExist = content.sources.every((source) => available.has(`${source.documentId}:${source.chunkId}`))
    const citations = new Set(content.sources.map((source) => `${source.documentId}:${source.chunkId}`))
    const citesTargetSource = sources.some((source) => source.role === 'defines_target'
      && source.authority === 'official'
      && source.resourceType === 'curriculum_design'
      && citations.has(`${source.documentId}:${source.chunkId}`))
    return referencesExist && citesTargetSource
  }

  async citationsAllowed(id: string, content: LessonPlanContent, executor: DbExecutor = this.database.db) {
    const candidates = await this.repository.retrievalCandidates(id, executor)
    const uniqueReferences = new Set(content.sources.map((source) => `${source.documentId}:${source.chunkId}`)).size === content.sources.length
    if (candidates.length) return uniqueReferences && citationsWithinCandidateSet(content.sources, candidates)
    const [initial] = await this.repository.initialVersion(id, executor)
    return uniqueReferences && citationsWithinCandidateSet(content.sources, initial?.content.sources ?? [])
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
      ...(!sourcesExist ? ['citations must reference published target sources and include the official excerpt that defines the selected outcome'] : []),
      ...(!sourcesAllowed ? ['citations must come from the original retrieved source set'] : []),
    ]
    throw new UnprocessableEntityException({ code: 'LESSON_PLAN_QA_FAILED', message: `Fix these lesson plan checks before continuing: ${issues.join('; ')}.` })
  }
}

function validatePlanContext(targetRevisionId: string | null, original: LessonPlanContent, updated: LessonPlanContent) {
  if (!targetRevisionId) throw new UnprocessableEntityException({ code: 'CURRICULUM_CONTEXT_MISSING', message: 'This lesson plan has no curriculum target. Start a new plan from the curriculum library.' })
  if (updated.subject !== original.subject || updated.grade !== original.grade || updated.learningOutcome !== original.learningOutcome) {
    throw new UnprocessableEntityException({
      code: 'CURRICULUM_CONTEXT_IMMUTABLE',
      message: 'The selected curriculum target, subject, and grade are fixed for this plan. Start a new plan to use another target.',
    })
  }
}

export function citationsWithinCandidateSet(citations: LessonPlanContent['sources'], candidates: LessonPlanContent['sources']) {
  const candidateSet = new Set(candidates.map((source) => `${source.documentId}:${source.chunkId}`))
  return citations.every((source) => candidateSet.has(`${source.documentId}:${source.chunkId}`))
}
