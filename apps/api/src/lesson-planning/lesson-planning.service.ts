import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { UnprocessableEntityException } from '@nestjs/common'
import {
  hasValidReturnComment,
  LessonPlanContentSchema,
  transitionLessonPlan,
  type ApiPrincipal,
  type LessonPlanAction,
  type LessonPlanContent,
  type LessonPlanStatus,
} from '@nova/shared'
import { DatabaseService } from '../database/database.service'
import type { DbExecutor } from '../database/executor'
import { LessonPlanGenerator } from './llm-workflows/lesson-plan-generator'
import { LessonPlanningRepository } from './lesson-planning.repository'
import { EmbeddingAdapter } from '../embeddings/embedding.service'
import { EmbeddingError } from '../embeddings/embedding.adapter'
import { CurriculumLibraryService } from '../curriculum-library/curriculum-library.service'
import type { ZodIssue } from 'zod'
import { SpanStatusCode } from '@opentelemetry/api'
import {
  setLangfuseInput,
  setLangfuseOutput,
  startLangfuseSpan,
} from './llm-workflows/generation-telemetry'
import { LessonPlanRubric } from './llm-workflows/lesson-plan-rubric'
import { RequestIdService } from '../common/request-id.service'
import { authorize } from '../common/auth/policy'
import { LessonPlanPolicy, lessonPlanAvailableActions } from '../common/auth/policies'

@Injectable()
export class LessonPlanningService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: LessonPlanningRepository,
    private readonly library: CurriculumLibraryService,
    private readonly generator: LessonPlanGenerator,
    private readonly embeddings: EmbeddingAdapter,
    private readonly rubric: LessonPlanRubric,
    private readonly requestIds: RequestIdService,
  ) {}

  async list(principal: ApiPrincipal) {
    await authorize(principal, new LessonPlanPolicy(), 'view')
    const isLead = new LessonPlanPolicy().review(principal)
    const plans = isLead
      ? await this.repository.plansForLead()
      : await this.repository.plansForTeacher(principal.subject)
    const planIds = plans.map((plan) => plan.id)
    const [versions, reviewedPlans] = await Promise.all([
      this.repository.latestVersions(planIds),
      this.repository.plansWithReviewHistory(planIds),
    ])
    const versionByPlan = new Map(versions.map((version) => [version.lessonPlanId, version]))
    const plansWithReviewHistory = new Set(reviewedPlans.map((plan) => plan.lessonPlanId))
    const targetRevisionIds = [
      ...new Set(
        versions.flatMap((version) => (version.targetRevisionId ? [version.targetRevisionId] : [])),
      ),
    ]
    const contexts = await this.library.targetContexts(targetRevisionIds)
    const contextByTarget = new Map(contexts.map((context) => [context.targetRevisionId, context]))
    return plans.map((plan) => {
      const latest = versionByPlan.get(plan.id)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      const context = latest.targetRevisionId
        ? contextByTarget.get(latest.targetRevisionId)
        : undefined
      return {
        id: plan.id,
        teacherId: plan.teacherId,
        status: plan.status,
        viewer: {
          availableActions: lessonPlanAvailableActions(
            principal,
            plan,
            plansWithReviewHistory.has(plan.id),
          ),
        },
        targetRevisionId: latest.targetRevisionId,
        versionId: latest.id,
        content: latest.content,
        version: latest.version,
        curriculumContext: context
          ? {
              framework: context.framework,
              programme: context.programme,
              grade: context.grade ?? 'All levels',
              subject: context.subject,
              releaseLabel: context.releaseLabel,
              locator: context.locator,
              targetTitle: context.targetTitle,
            }
          : null,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      }
    })
  }

  async get(id: string, principal: ApiPrincipal) {
    const plan = await this.plan(id)
    await authorize(principal, new LessonPlanPolicy(), 'viewPlan', plan)
    return this.view(id, principal)
  }

  async delete(id: string, principal: ApiPrincipal) {
    await this.database.db.transaction(async (tx) => {
      const [plan] = await this.repository.planForDelete(id, tx)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      await authorize(principal, new LessonPlanPolicy(), 'deletePlan', plan)
      if (plan.deletedAt) return
      const hasReviewHistory = await this.repository.hasReviewHistory(id, tx)
      const availableActions = lessonPlanAvailableActions(principal, plan, hasReviewHistory)
      if (!availableActions.delete && plan.status !== 'draft') {
        throw new ConflictException({
          code: 'LESSON_PLAN_DELETE_NOT_ALLOWED',
          message:
            plan.status === 'submitted'
              ? 'This plan is in review. A curriculum lead must return it before you can remove it.'
              : plan.status === 'returned'
                ? 'Returned plans are retained with their curriculum review history.'
                : 'Published plans are retained for curriculum review and audit.',
        })
      }
      if (!availableActions.delete) {
        throw new ConflictException({
          code: 'LESSON_PLAN_DELETE_NOT_ALLOWED',
          message: 'This draft has curriculum review history and is retained for audit.',
        })
      }
      await this.repository.removeFromWorkspace(id, new Date(), tx)
    })
  }

  async reviews(id: string, principal: ApiPrincipal) {
    const plan = await this.plan(id)
    await authorize(principal, new LessonPlanPolicy(), 'viewPlan', plan)
    return this.repository.reviews(id)
  }

  async versions(id: string, principal: ApiPrincipal) {
    const plan = await this.plan(id)
    await authorize(principal, new LessonPlanPolicy(), 'viewPlan', plan)
    return this.repository.versions(id)
  }

  async latestRubricQa(id: string, principal: ApiPrincipal) {
    const plan = await this.plan(id)
    await authorize(principal, new LessonPlanPolicy(), 'viewPlan', plan)
    const [latest] = await this.repository.latestValidation(id)
    return latest ? { ...latest, createdAt: latest.createdAt.toISOString() } : null
  }

  async validateVersion(id: string, versionId: string, principal: ApiPrincipal) {
    const plan = await this.plan(id)
    await authorize(principal, new LessonPlanPolicy(), 'viewPlan', plan)
    const [version] = await this.repository.versionById(id, versionId)
    if (!version) throw new NotFoundException('Lesson plan version not found')
    const sourceDetails = version.targetRevisionId
      ? await this.library.sourceDetailsForTarget(version.targetRevisionId)
      : []
    const cited = new Set(version.content.sources.map((source) => source.chunkId))
    const evidence = sourceDetails
      .filter((source) => cited.has(source.chunkId))
      .map((source) => ({
        chunkId: source.chunkId,
        role: source.role,
        authority: source.authority,
        content: source.content,
      }))
    const validation = await this.rubric.validate(id, versionId, version.content, evidence)
    return { validation }
  }

  async generate(principal: ApiPrincipal, targetRevisionId: string, durationMinutes: number) {
    await authorize(principal, new LessonPlanPolicy(), 'create')
    return startLangfuseSpan(
      'curriculum.lesson_plan.workflow.generate',
      async (span) => {
        span.setAttribute('lesson_plan.workflow', 'generate')
        const requestId = this.requestIds.current()
        if (requestId) span.setAttribute('http.request_id', requestId)
        span.setAttribute('curriculum.target_revision_id', targetRevisionId)
        span.setAttribute('lesson.duration_minutes', durationMinutes)
        setLangfuseInput(span, { targetRevisionId, durationMinutes })
        try {
          const outcome = await runGenerationStage(
            'curriculum.lesson_plan.target.resolve',
            { targetRevisionId },
            () => this.library.outcomeForGeneration(targetRevisionId),
          )
          const queryEmbedding = await runGenerationStage(
            'curriculum.lesson_plan.embedding.query',
            { targetRevisionId, query: outcome.content },
            () => this.embedQuery(outcome.content),
            (embedding) => ({ dimensions: embedding.length }),
          )
          const sources = await runGenerationStage(
            'curriculum.lesson_plan.retrieval',
            {
              targetRevisionId,
              subject: outcome.subject,
              grade: outcome.grade,
              queryEmbeddingDimensions: queryEmbedding.length,
            },
            () =>
              this.library.sourceChunksForGeneration(
                targetRevisionId,
                queryEmbedding,
                outcome.subject,
                outcome.grade,
              ),
          )
          span.setAttribute('curriculum.source_count', sources.length)
          const content = await this.generator.generate(outcome, sources, durationMinutes)
          const persisted = await runGenerationStage(
            'curriculum.lesson_plan.persistence',
            {
              targetRevisionId,
              candidateChunkIds: sources.map((source) => source.chunkId),
              citedChunkIds: content.sources.map((source) => source.chunkId),
            },
            () =>
              this.database.db.transaction(async (tx) => {
                const created = await this.repository.createPlan(principal.subject, tx)
                const [version] = await this.repository.createVersion(
                  {
                    lessonPlanId: created.id,
                    targetRevisionId,
                    version: 1,
                    content,
                    createdBy: principal.subject,
                  },
                  tx,
                )
                const candidateChunkIds = new Set(sources.map((source) => source.chunkId))
                await this.repository.addRetrievalCandidates(created.id, [...candidateChunkIds], tx)
                await this.repository.addVersionSources(
                  version.id,
                  content.sources.map((source) => source.chunkId),
                  tx,
                )
                return { planId: created.id, versionId: version.id, version: version.version }
              }),
          )
          const result = await this.view(persisted.planId, principal)
          const { plan } = result
          const cited = new Set(content.sources.map((source) => source.chunkId))
          const rubricQa = await this.rubric.validate(
            plan.id,
            plan.versionId,
            content,
            sources
              .filter((source) => cited.has(source.chunkId))
              .map((source) => ({
                chunkId: source.chunkId,
                role: source.role,
                authority: source.authority,
                content: source.content,
              })),
          )
          span.setAttribute('lesson_plan.id', plan.id)
          span.setAttribute('lesson_plan.version_id', plan.versionId)
          span.setAttribute('lesson_plan.version', plan.version)
          span.setAttribute('lesson_plan.status', plan.status)
          span.setAttribute('lesson_plan.workflow.outcome', 'success')
          setLangfuseOutput(span, {
            plan,
            deterministicQa: { passed: true },
            rubricQa,
          })
          span.setStatus({ code: SpanStatusCode.OK })
          return { ...result, rubricQa }
        } catch (error) {
          span.setAttribute('lesson_plan.workflow.outcome', 'failure')
          if (error instanceof Error) {
            span.setAttribute('error.type', error.name)
            span.recordException(error)
          }
          span.setStatus({ code: SpanStatusCode.ERROR })
          throw error
        } finally {
          span.end()
        }
      },
      this.requestIds.current(),
    )
  }

  async edit(id: string, principal: ApiPrincipal, content: unknown) {
    await this.database.db.transaction(async (tx) => {
      const [plan] = await this.repository.planForUpdate(id, tx)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      await authorize(principal, new LessonPlanPolicy(), 'editPlan', plan)
      const nextStatus = transitionPlanStatus(plan.status, 'edit')
      const valid = LessonPlanContentSchema.safeParse(content)
      if (!valid.success) {
        const errors = formatLessonPlanSchemaIssues(valid.error.issues)
        throw new UnprocessableEntityException({
          code: 'LESSON_PLAN_QA_FAILED',
          message: `Fix these lesson plan fields before saving: ${errors.map(({ field, message }) => `${field}: ${message}`).join('; ')}.`,
          errors,
        })
      }
      const [latest] = await this.repository.latestVersion(id, tx)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      validatePlanContext(latest.targetRevisionId, latest.content, valid.data)
      await this.assertPlanQa(id, latest.targetRevisionId, valid.data, tx)
      const [version] = await this.repository.createVersion(
        {
          lessonPlanId: id,
          targetRevisionId: latest.targetRevisionId,
          version: latest.version + 1,
          content: valid.data,
          createdBy: principal.subject,
        },
        tx,
      )
      await this.repository.addVersionSources(
        version.id,
        valid.data.sources.map((source) => source.chunkId),
        tx,
      )
      await this.repository.updatePlanStatus(id, nextStatus, new Date(), tx)
    })
    return this.view(id, principal)
  }

  async submit(id: string, principal: ApiPrincipal) {
    await this.database.db.transaction(async (tx) => {
      const [plan] = await this.repository.planForUpdate(id, tx)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      await authorize(principal, new LessonPlanPolicy(), 'submitPlan', plan)
      const nextStatus = transitionPlanStatus(plan.status, 'submit')
      const [latest] = await this.repository.latestVersion(id, tx)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      await this.assertPlanQa(id, latest.targetRevisionId, latest.content, tx)
      await this.repository.updatePlanStatus(id, nextStatus, new Date(), tx)
    })
    return this.view(id, principal)
  }

  async review(
    id: string,
    principal: ApiPrincipal,
    decision: 'returned' | 'published',
    comment?: string,
  ) {
    const [review] = await this.database.db.transaction(async (tx) => {
      const [plan] = await this.repository.planForUpdate(id, tx)
      if (!plan) throw new NotFoundException('Lesson plan not found')
      await authorize(principal, new LessonPlanPolicy(), 'review')
      const nextStatus = transitionPlanStatus(plan.status, decision)
      const normalizedComment = validateReviewComment(decision, comment)
      const [latest] = await this.repository.latestVersion(id, tx)
      if (!latest) throw new NotFoundException('Lesson plan content not found')
      if (decision === 'published')
        await this.assertPlanQa(id, latest.targetRevisionId, latest.content, tx)
      await this.repository.updatePlanStatus(id, nextStatus, new Date(), tx)
      const [created] = await this.repository.createReview(
        {
          lessonPlanId: id,
          lessonPlanVersionId: latest.id,
          curriculumLeadId: principal.subject,
          decision,
          comment: normalizedComment,
        },
        tx,
      )
      return [{ ...created, lessonPlanVersionNumber: latest.version }]
    })
    return { review, ...(await this.view(id, principal)) }
  }

  private async view(id: string, principal: ApiPrincipal) {
    const plan = await this.plan(id)
    const [latest] = await this.repository.latestVersion(id)
    if (!latest) throw new NotFoundException('Lesson plan content not found')
    const hasReviewHistory =
      plan.status === 'draft' && new LessonPlanPolicy().deletePlan(principal, plan)
        ? await this.repository.hasReviewHistory(id)
        : false
    return {
      plan: {
        id: plan.id,
        teacherId: plan.teacherId,
        status: plan.status,
        targetRevisionId: latest.targetRevisionId,
        versionId: latest.id,
        content: latest.content,
        version: latest.version,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      },
      viewer: {
        availableActions: lessonPlanAvailableActions(principal, plan, hasReviewHistory),
      },
    }
  }
  private async plan(id: string) {
    const plan = await this.repository.plan(id)
    if (!plan) throw new NotFoundException('Lesson plan not found')
    return plan
  }
  private async embedQuery(content: string) {
    try {
      return await this.embeddings.embedQuery(content)
    } catch (error) {
      if (error instanceof EmbeddingError)
        throw new ServiceUnavailableException({ code: error.code, message: error.message })
      throw error
    }
  }

  private async assertPlanQa(
    id: string,
    targetRevisionId: string | null,
    content: LessonPlanContent,
    executor: DbExecutor = this.database.db,
  ) {
    const sourcesExist = await this.citationsExist(content, targetRevisionId, executor)
    const sourcesAllowed = await this.citationsAllowed(id, content, executor)
    validatePlanQa(content, sourcesExist, sourcesAllowed)
  }

  async citationsExist(
    content: LessonPlanContent,
    targetRevisionId: string | null,
    executor: DbExecutor = this.database.db,
  ) {
    if (!targetRevisionId) return false
    const sources = await this.library.sourceDetailsForTarget(targetRevisionId, executor)
    const available = new Set(sources.map((source) => `${source.documentId}:${source.chunkId}`))
    const referencesExist = content.sources.every((source) =>
      available.has(`${source.documentId}:${source.chunkId}`),
    )
    const citations = new Set(
      content.sources.map((source) => `${source.documentId}:${source.chunkId}`),
    )
    const citesTargetSource = sources.some(
      (source) =>
        source.role === 'defines_target' &&
        source.authority === 'official' &&
        source.resourceType === 'curriculum_design' &&
        citations.has(`${source.documentId}:${source.chunkId}`),
    )
    return referencesExist && citesTargetSource
  }

  async citationsAllowed(
    id: string,
    content: LessonPlanContent,
    executor: DbExecutor = this.database.db,
  ) {
    const candidates = await this.repository.retrievalCandidates(id, executor)
    const uniqueReferences =
      new Set(content.sources.map((source) => `${source.documentId}:${source.chunkId}`)).size ===
      content.sources.length
    if (candidates.length)
      return uniqueReferences && citationsWithinCandidateSet(content.sources, candidates)
    const [initial] = await this.repository.initialVersion(id, executor)
    return (
      uniqueReferences &&
      citationsWithinCandidateSet(content.sources, initial?.content.sources ?? [])
    )
  }
}

async function runGenerationStage<T>(
  name: string,
  input: unknown,
  action: () => Promise<T>,
  projectOutput: (result: T) => unknown = (result) => result,
): Promise<T> {
  return startLangfuseSpan(name, async (span) => {
    setLangfuseInput(span, input)
    try {
      const result = await action()
      setLangfuseOutput(span, projectOutput(result))
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      if (error instanceof Error) {
        span.setAttribute('error.type', error.name)
        span.recordException(error)
      }
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw error
    } finally {
      span.end()
    }
  })
}

export function assertTeacherOwns(owner: string, principal: ApiPrincipal) {
  if (!new LessonPlanPolicy().editPlan(principal, { teacherId: owner, status: 'draft' }))
    throw new ForbiddenException()
}

export function assertCurriculumLead(principal: ApiPrincipal) {
  if (!new LessonPlanPolicy().review(principal)) throw new ForbiddenException()
}

export function assertCanReadPlan(
  owner: string,
  status: LessonPlanStatus,
  principal: ApiPrincipal,
) {
  if (!new LessonPlanPolicy().viewPlan(principal, { teacherId: owner, status }))
    throw new ForbiddenException()
}

export function transitionPlanStatus(
  status: LessonPlanStatus,
  action: LessonPlanAction,
): LessonPlanStatus {
  const result = transitionLessonPlan(status, action)
  if (!result.ok) throw new ConflictException({ code: result.code, message: result.message })
  return result.status
}

export function validateReviewComment(decision: 'returned' | 'published', comment?: string) {
  const normalized = comment?.trim()
  if (decision === 'returned' && (!normalized || !hasValidReturnComment(normalized))) {
    throw new BadRequestException({
      code: 'REVIEW_COMMENT_REQUIRED',
      message: 'Add an actionable return reason with at least eight non-space characters.',
    })
  }
  return normalized || undefined
}

export function formatLessonPlanSchemaIssues(issues: readonly ZodIssue[]) {
  return issues.map(({ path, message }) => ({
    field: path.length ? path.join('.') : 'content',
    message,
  }))
}

export function planDurationMatches(content: LessonPlanContent) {
  return (
    content.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0) ===
    content.durationMinutes
  )
}

export function validatePlanQa(
  content: unknown,
  sourcesExist: boolean,
  sourcesAllowed: boolean,
): asserts content is LessonPlanContent {
  const valid = LessonPlanContentSchema.safeParse(content)
  if (!valid.success || !sourcesExist || !sourcesAllowed) {
    const issues = [
      ...(!valid.success ? ['content must match the lesson plan schema'] : []),
      ...(!sourcesExist
        ? [
            'citations must reference published target sources and include the official excerpt that defines the selected outcome',
          ]
        : []),
      ...(!sourcesAllowed ? ['citations must come from the original retrieved source set'] : []),
    ]
    throw new UnprocessableEntityException({
      code: 'LESSON_PLAN_QA_FAILED',
      message: `Fix these lesson plan checks before continuing: ${issues.join('; ')}.`,
    })
  }
}

function validatePlanContext(
  targetRevisionId: string | null,
  original: LessonPlanContent,
  updated: LessonPlanContent,
) {
  if (!targetRevisionId)
    throw new UnprocessableEntityException({
      code: 'CURRICULUM_CONTEXT_MISSING',
      message:
        'This lesson plan has no curriculum target. Start a new plan from the curriculum library.',
    })
  if (
    updated.subject !== original.subject ||
    updated.grade !== original.grade ||
    updated.learningOutcome !== original.learningOutcome
  ) {
    throw new UnprocessableEntityException({
      code: 'CURRICULUM_CONTEXT_IMMUTABLE',
      message:
        'The selected curriculum target, subject, and grade are fixed for this plan. Start a new plan to use another target.',
    })
  }
}

export function citationsWithinCandidateSet(
  citations: LessonPlanContent['sources'],
  candidates: LessonPlanContent['sources'],
) {
  const candidateSet = new Set(candidates.map((source) => `${source.documentId}:${source.chunkId}`))
  return citations.every((source) => candidateSet.has(`${source.documentId}:${source.chunkId}`))
}
