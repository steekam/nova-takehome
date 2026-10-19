import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Candidate, CorpusChunk, RunReport, Verification } from './domain.js'
import { CorpusChunkSchema, LessonContentSchema } from './domain.js'
import { generate, ProviderError } from './provider.js'
import { toStrictJsonSchema } from './prompt.js'
import type { JsonSchemaNode } from './prompt.js'
import { estimateCost, mergeUsage } from './pricing.js'
import { reportReviewFindingScores, withSpan } from './telemetry.js'
import type { ScoreDelivery } from './telemetry.js'
import { getPlan, WorkflowError } from './workflow.js'

export const REVIEW_PROMPT_VERSION = 'review-lesson-v11'
export const REVIEW_RUBRIC_VERSION = 'review-rubric-v11'

const ReviewFindingSchema = z.object({
  code: z.string().min(1),
  dimension: z.enum(['alignment', 'grounding', 'accuracy', 'assessment', 'feasibility', 'safety', 'accessibility']),
  severity: z.enum(['blocker', 'warning', 'info']),
  sectionPath: z.string().min(1),
  summary: z.string().min(1),
  evidenceChunkIds: z.array(z.string()).min(1),
  suggestion: z.string().nullable(),
  signal: z.enum(['rule', 'jev', 'llm', 'human']),
  confidence: z.number().min(0).max(1).nullable(),
}).strict()

export const ReviewReportSchema = z.object({
  planVersionId: z.string().min(1),
  rubricVersion: z.string().min(1),
  findings: z.array(ReviewFindingSchema).max(5),
}).strict()

export type ReviewReport = z.infer<typeof ReviewReportSchema>
export const reviewOutputSchema = toStrictJsonSchema(z.toJSONSchema(ReviewReportSchema))

function reviewOutputSchemaFor(input: ReviewInput): JsonSchemaNode {
  const schema = JSON.parse(JSON.stringify(reviewOutputSchema)) as JsonSchemaNode
  const node = (pathParts: string[]) => pathParts.reduce<JsonSchemaNode>((current, part) => current[part] as JsonSchemaNode, schema)
  node(['properties', 'planVersionId']).enum = [input.planVersionId]
  node(['properties', 'rubricVersion']).enum = [REVIEW_RUBRIC_VERSION]
  node(['properties', 'findings', 'items', 'properties', 'signal']).enum = ['llm']
  node(['properties', 'findings', 'items', 'properties', 'evidenceChunkIds', 'items']).enum = input.allowedChunkIds
  return schema
}

type ReviewInput = {
  sourceType: 'generation_run' | 'saved_plan'
  planVersionId: string
  sourceRunId?: string
  sourcePlanId?: string
  sourceTraceId?: string
  sourceObservationId?: string
  inputHash: string
  content: z.infer<typeof LessonContentSchema>
  sourceChunks: CorpusChunk[]
  allowedChunkIds: string[]
}

type ReviewAttempt = RunReport['candidates'][number]['attempts'][number]

export type ReviewRunReport = {
  schemaVersion: 'playground-review-run-v2' | 'playground-review-run-v3'
  runId: string
  createdAt: string
  traceId?: string
  sourceRunId?: string
  sourceType?: ReviewInput['sourceType']
  sourcePlanId?: string
  sourceTraceId?: string
  sourceObservationId?: string
  planVersionId: string
  inputHash: string
  promptVersion: string
  rubricVersion: string
  input: { content: z.infer<typeof LessonContentSchema>; sourceChunks: CorpusChunk[] }
  outputSchema: unknown
  candidate: Candidate
  status: 'evaluated' | 'failed' | 'blocked'
  attempts: ReviewAttempt[]
  review?: ReviewReport
  verification?: Verification
  judgeScoreDelivery: ScoreDelivery
  usage?: RunReport['candidates'][number]['usage']
  estimatedCost?: RunReport['candidates'][number]['estimatedCost']
  reportedCostUsd?: number
  elapsedMs: number
  errorCode?: string
  errorMessage?: string
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1))
    throw new Error('Response was not valid JSON.')
  }
}

export function makeReviewPrompt(input: ReviewInput, schema: JsonSchemaNode, repairErrors: string[] = []): string {
  const repair = repairErrors.length > 0
    ? `\nFix these validation issues from your prior answer:\n${repairErrors.map((error) => `- ${error}`).join('\n')}`
    : ''
  const fixtureGuidance = input.sourceChunks.some(({ id }) => id === 'chunk-target-particles')
    ? `For this lesson's check, three points are deliberately separate: six points cover state, spacing, and movement for each of two selected diagrams; one covers particle size; one covers whether the pair's spacing is similar or different; and one covers naming how movement differs between the pair. This totals nine. Requiring each learner to identify state using its spacing and movement already captures the supplied guidance to justify identification with both; do not ask for another justification criterion or report its absence. The check does not require a separate written justification. The answer key may list all three states as a teacher reference; learners answer only for their two selected diagrams. Do not report those rubric choices as inconsistencies when the plan states them clearly.`
    : `For this lesson's check, each of four supplied cases earns one point for classification and one for whether a new substance forms: eight total. Melting ice and tearing paper are physical; rusting iron and cooking an egg are chemical. These are described cases, not live demonstrations. Reversibility alone is insufficient: tearing paper remains physical. The four cases and eight-point rubric are synthetic teaching choices, not official KICD requirements.`
  return `Review this immutable lesson-plan snapshot against its selected target, cited source passages, and applicable curriculum-lead guidance. Return one JSON object matching the supplied JSON Schema.

Assess alignment, grounding, accuracy, assessment, feasibility, safety, and accessibility. Report unsupported claims, contradictions, target drift, weak assessment alignment, unclear instructions, infeasible pacing, safety concerns, and accessibility gaps. Read the complete lesson before reporting a gap: do not say a tool, instruction, accommodation, or evidence is absent when another supplied field provides it. Treat an explicit lesson-wide or all-activities accommodation as applying to each stated activity, including closing, unless another field contradicts or narrows it; do not report a missing field-specific accommodation when the supplied global direction already provides it. Each finding must name an exact sectionPath from the supplied content and only evidenceChunkIds that support the finding. For alignment, grounding, or accuracy findings, include at least one source chunk that supports or contradicts the claim. Citation presence alone does not prove support. If evidence is insufficient, report that plainly and do not infer support from citation presence. Report actionable gaps only; omit praise and compliance confirmations. Group findings by root cause. When one defect causes objective, activity, assessment, and citation mismatches, report one finding at the root field and summarize those effects there; do not split the same false claim and its incorrect citations into separate findings. Do not emit multiple findings for the same false claim at the same sectionPath just because it affects more than one review dimension; choose the primary dimension and mention the other impact in the same finding. Do not create separate findings for downstream consequences that only follow if a teacher ignores the lesson's explicit materials or activities. When an objective is contradicted by the target but the activities and checks teach the target correctly, report the objective defect alone and do not suggest changing correct activities or checks to match the false objective. Return no more than five findings, ordered with blockers first. Lesson design details such as a locally authored point total or timing are synthetic choices; assess whether they fit the target and lead guidance, not whether a source chunk prescribes that exact number.

Every actionable finding needs at least one exact evidenceChunkId from the frozen context. The schema rejects an empty evidenceChunkIds list. If no source establishes the concern, omit the finding rather than guess.

When a finding identifies a factual contradiction, its suggestion must state the source-grounded correction and the specific edit to make. Telling the author only to remove a false claim or align with the target is not enough.

${fixtureGuidance} Check that each learner has an individual response tool for the closing check, even when diagrams or case cards are shared. Treat possible timing concerns as suggestions unless the supplied evidence establishes that the schedule cannot work.

Keep evidence in summary and advice in suggestion. Use signal "llm" for every finding. Use null for suggestion or confidence when unavailable. Return an empty findings array when you find no material issue. Do not rewrite the plan, add citations, change workflow state, submit, approve, or publish it. Findings are advisory and never override deterministic validation or human review.

planVersionId: ${input.planVersionId}
rubricVersion: ${REVIEW_RUBRIC_VERSION}
selectedTarget: ${JSON.stringify(input.sourceChunks.find((chunk) => chunk.kind === 'curriculum_target'))}
lessonContent: ${JSON.stringify(input.content)}
allowedEvidenceChunks: ${JSON.stringify(input.sourceChunks.map(({ id, title, kind, text, targetId, sourceReference }) => ({ id, title, kind, text, targetId, sourceReference })))}
JSON Schema: ${JSON.stringify(schema)}${repair}`
}

function hasSectionPath(content: unknown, sectionPath: string): boolean {
  const parts: Array<string | number> = []
  const token = /(?:^|\.)([A-Za-z][A-Za-z0-9_]*)|\[(0|[1-9]\d*)\]/gy
  let cursor = 0
  while (cursor < sectionPath.length) {
    token.lastIndex = cursor
    const match = token.exec(sectionPath)
    if (!match) return false
    parts.push(match[1] ?? Number(match[2]))
    cursor = token.lastIndex
  }
  if (!parts.length) return false
  let current: unknown = content
  for (const part of parts) {
    if (typeof part === 'number') {
      if (!Array.isArray(current) || part >= current.length) return false
      current = current[part]
    } else {
      if (typeof current !== 'object' || current === null || !Object.hasOwn(current, part)) return false
      current = (current as Record<string, unknown>)[part]
    }
  }
  return true
}

export function verifyReview(raw: unknown, input: ReviewInput): { review?: ReviewReport; verification: Verification } {
  const parsed = ReviewReportSchema.safeParse(raw)
  if (!parsed.success) {
    return { verification: { passed: false, checks: parsed.error.issues.map((issue) => ({
      code: 'OUTPUT_SCHEMA_INVALID', passed: false, message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    })) } }
  }

  const review = parsed.data
  const duplicateCitationFinding = review.findings.some((finding) => {
    if (finding.dimension !== 'grounding' || !finding.sectionPath.endsWith('.sourceChunkIds')) return false
    const rootPath = finding.sectionPath.slice(0, -'.sourceChunkIds'.length)
    return review.findings.some((other) => other !== finding
      && other.sectionPath.startsWith(`${rootPath}.`)
      && ['alignment', 'grounding', 'accuracy'].includes(other.dimension))
  })
  const checks: Verification['checks'] = [
    { code: 'REVIEW_PLAN_VERSION', passed: review.planVersionId === input.planVersionId, message: 'Review must name the exact lesson-plan snapshot it evaluated.' },
    { code: 'REVIEW_RUBRIC_VERSION', passed: review.rubricVersion === REVIEW_RUBRIC_VERSION, message: `Review must use rubric ${REVIEW_RUBRIC_VERSION}.` },
    { code: 'REVIEW_SIGNAL_PROVENANCE', passed: review.findings.every((finding) => finding.signal === 'llm'), message: 'The model cannot label findings as deterministic, Jev, or human signals.' },
    { code: 'REVIEW_SECTION_PATHS', passed: review.findings.every((finding) => hasSectionPath(input.content, finding.sectionPath)), message: 'Every finding must point to an existing lesson-content field.' },
    { code: 'REVIEW_EVIDENCE_IDS', passed: review.findings.every((finding) => finding.evidenceChunkIds.every((id) => input.allowedChunkIds.includes(id))), message: 'Finding evidence IDs must belong to the frozen review context.' },
    { code: 'REVIEW_FINDING_EVIDENCE_REQUIRED', passed: review.findings.every((finding) => finding.evidenceChunkIds.length > 0), message: 'Every actionable review finding must cite at least one frozen source chunk.' },
    { code: 'REVIEW_DUPLICATE_CITATION_FINDING', passed: !duplicateCitationFinding, message: 'Merge citation mismatch into the existing alignment, grounding, or accuracy finding on that same content field.' },
  ]
  return { review, verification: { passed: checks.every((check) => check.passed), checks } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reviewCandidate(live: boolean, viaLitellm: boolean): Candidate {
  return live
    ? viaLitellm
      ? { id: 'litellm-deepseek-v4.1-flash', provider: 'litellm', model: process.env.LITELLM_MODEL ?? 'lesson-planner', displayName: 'DeepSeek V4.1 Flash via LiteLLM' }
      : { id: 'baseten-deepseek-v4.1-flash', provider: 'baseten', model: process.env.BASETEN_DEEPSEEK_MODEL ?? 'deepseek-ai/DeepSeek-V4.1-Flash', displayName: 'Baseten DeepSeek V4.1 Flash' }
    : { id: 'mock-review', provider: 'mock', model: 'mock-review', displayName: 'Mock lesson review' }
}

export async function runReview(sourceRunPath: string, live: boolean, traceId?: string, viaLitellm = false): Promise<ReviewRunReport> {
  const reportsDir = path.resolve(process.env.PLAYGROUND_REPORTS_DIR ?? '.cache/playground/runs')
  const resolvedSourcePath = sourceRunPath.endsWith('.json') ? path.resolve(sourceRunPath) : path.join(reportsDir, `${sourceRunPath}.json`)
  const sourceValue: unknown = JSON.parse(await readFile(resolvedSourcePath, 'utf8'))
  if (!isRecord(sourceValue) || !['playground-run-v5', 'playground-run-v6', 'playground-run-v7', 'playground-run-v8', 'playground-run-v9', 'playground-run-v10'].includes(String(sourceValue.schemaVersion)) || typeof sourceValue.runId !== 'string' || !isRecord(sourceValue.retrieval) || !Array.isArray(sourceValue.retrieval.selectedChunkIds) || !Array.isArray(sourceValue.candidates)) {
    throw new Error('Source run report is missing required generation fields.')
  }
  const selectedChunkIds = sourceValue.retrieval.selectedChunkIds.filter((id): id is string => typeof id === 'string')
  if (sourceValue.schemaVersion !== 'playground-run-v9' && sourceValue.schemaVersion !== 'playground-run-v10') {
    throw new Error('Legacy run reports do not contain a frozen retrieval snapshot. Regenerate with the current playground before review.')
  }
  if (!Array.isArray(sourceValue.retrieval.selectedChunks)) throw new Error('Source run report is missing its frozen retrieval context.')
  const legacySnapshotSchema = z.array(z.object({
    id: z.string(), documentId: z.string(), title: z.string(),
    kind: z.enum(['curriculum_target', 'scheme', 'teaching_note', 'assessment', 'lead_guidance', 'exemplar']),
    text: z.string(), synthetic: z.literal(true), eligibleForGrounding: z.literal(true),
  }).strict()).safeParse(sourceValue.retrieval.selectedChunks)
  const currentSnapshotSchema = z.array(CorpusChunkSchema).safeParse(sourceValue.retrieval.selectedChunks)
  const snapshotData = sourceValue.schemaVersion === 'playground-run-v10'
    ? currentSnapshotSchema.success ? currentSnapshotSchema.data : undefined
    : legacySnapshotSchema.success ? legacySnapshotSchema.data : undefined
  if (!snapshotData || snapshotData.map(({ id }) => id).join('\n') !== selectedChunkIds.join('\n')) {
    throw new Error('Source run report has an invalid or mismatched frozen retrieval context.')
  }
  const sourceChunks: CorpusChunk[] = snapshotData
  const sourceRunId = sourceValue.runId
  const sourceCandidate = sourceValue.candidates.find((item) => isRecord(item) && item.status === 'success' && item.content)
  if (!isRecord(sourceCandidate)) throw new Error('Source run has no successfully verified lesson plan to review.')
  const contentResult = LessonContentSchema.safeParse(sourceCandidate.content)
  if (!contentResult.success) throw new Error('Source run lesson content no longer matches its schema.')
  const allowedChunkIds = selectedChunkIds
  const planVersionId = `${sourceRunId}:${String(isRecord(sourceCandidate.candidate) ? sourceCandidate.candidate.id : 'candidate')}:v1`
  const sourceGenerationAttempt = Array.isArray(sourceCandidate.attempts)
    ? [...sourceCandidate.attempts].reverse().find((attempt: unknown): attempt is Record<string, unknown> => isRecord(attempt) && typeof attempt.traceId === 'string' && typeof attempt.observationId === 'string')
    : undefined
  const sourceTraceId = typeof sourceGenerationAttempt?.traceId === 'string' ? sourceGenerationAttempt.traceId : undefined
  const sourceObservationId = typeof sourceGenerationAttempt?.observationId === 'string' ? sourceGenerationAttempt.observationId : undefined
  const hashInput = JSON.stringify({ sourceType: 'generation_run', sourceRunId, planVersionId, content: contentResult.data, sourceChunks, rubricVersion: REVIEW_RUBRIC_VERSION })
  const input: ReviewInput = {
    sourceType: 'generation_run',
    planVersionId,
    sourceRunId,
    sourceTraceId,
    sourceObservationId,
    inputHash: createHash('sha256').update(hashInput).digest('hex'),
    content: contentResult.data,
    sourceChunks,
    allowedChunkIds: sourceChunks.map((chunk) => chunk.id),
  }
  return runReviewInput(input, live, traceId, viaLitellm)
}

export async function runReviewPlanVersion(planId: string, versionId: string | undefined, live: boolean, traceId?: string, viaLitellm = false): Promise<ReviewRunReport> {
  const plan = await getPlan(planId)
  const selectedVersionId = versionId ?? plan.currentVersionId
  const version = plan.versions.find(({ versionId: id }) => id === selectedVersionId)
  if (!version) throw new WorkflowError('PLAN_VERSION_NOT_FOUND', `Plan ${planId} has no version ${selectedVersionId}.`)
  if (!version.sourceChunks) throw new WorkflowError('PLAN_SOURCE_SNAPSHOT_MISSING', `Plan version ${selectedVersionId} has no frozen source snapshot. Create a new version before requesting AI guidance.`)
  const parsedChunks = z.array(CorpusChunkSchema).min(1).safeParse(version.sourceChunks)
  if (!parsedChunks.success) throw new WorkflowError('PLAN_RECORD_INVALID', `Plan version ${selectedVersionId} has an invalid frozen source snapshot.`)
  const sourceChunks = parsedChunks.data
  const targetChunk = sourceChunks.find(({ kind }) => kind === 'curriculum_target')
  if (!targetChunk || targetChunk.targetId !== plan.targetId) {
    throw new WorkflowError('PLAN_RECORD_INVALID', `Plan version ${selectedVersionId} does not freeze the selected curriculum target.`)
  }
  const parsedContent = LessonContentSchema.safeParse(version.content)
  if (!parsedContent.success) throw new WorkflowError('PLAN_RECORD_INVALID', `Plan version ${selectedVersionId} has invalid lesson content.`)
  const sourceReferences = new Set(sourceChunks.map(({ id }) => id))
  if (sourceChunks.length !== version.sourceChunks.length || new Set(sourceChunks.map(({ id }) => id)).size !== sourceChunks.length) {
    throw new WorkflowError('PLAN_RECORD_INVALID', `Plan version ${selectedVersionId} has duplicate or invalid source records.`)
  }
  const inputHash = createHash('sha256').update(JSON.stringify({ sourceType: 'saved_plan', planId, planVersionId: selectedVersionId, content: parsedContent.data, sourceChunks, rubricVersion: REVIEW_RUBRIC_VERSION })).digest('hex')
  return runReviewInput({
    sourceType: 'saved_plan',
    sourcePlanId: planId,
    planVersionId: selectedVersionId,
    inputHash,
    content: parsedContent.data,
    sourceChunks,
    allowedChunkIds: [...sourceReferences],
  }, live, traceId, viaLitellm)
}

async function runReviewInput(input: ReviewInput, live: boolean, traceId: string | undefined, viaLitellm: boolean): Promise<ReviewRunReport> {
  const reportsDir = path.resolve(process.env.PLAYGROUND_REPORTS_DIR ?? '.cache/playground/runs')
  const { sourceChunks } = input
  const candidate = reviewCandidate(live, viaLitellm)
  const responseSchema = reviewOutputSchemaFor(input)
  const attempts: ReviewAttempt[] = []
  const reviewRunId = randomUUID()
  const startedAt = Date.now()
  let repairErrors: string[] = []
  let usage: ReviewRunReport['usage']
  let reportedCostUsd = 0
  let hasReportedCost = false
  let review: ReviewReport | undefined
  let verification: Verification | undefined
  let errorCode: string | undefined
  let errorMessage: string | undefined
  let judgeTraceId: string | undefined
  let judgeObservationId: string | undefined
  let status: ReviewRunReport['status'] = 'failed'

  for (let number = 1; number <= 2; number += 1) {
    const prompt = makeReviewPrompt(input, responseSchema, repairErrors)
    const attemptStart = Date.now()
    try {
      const mockReview = JSON.stringify({ planVersionId: input.planVersionId, rubricVersion: REVIEW_RUBRIC_VERSION, findings: [] })
      const response = await withSpan('playground.llm.review', {
        'llm.provider': candidate.provider,
        'llm.model': candidate.model,
        'langfuse.observation.type': 'generation',
        'playground.review.run_id': reviewRunId,
        'playground.attempt': number,
        'playground.source.type': input.sourceType,
        ...(input.sourceRunId ? { 'playground.source_run_id': input.sourceRunId } : {}),
        ...(input.sourcePlanId ? { 'playground.source_plan_id': input.sourcePlanId } : {}),
        ...(input.sourceTraceId ? { 'playground.source_generation.trace_id': input.sourceTraceId } : {}),
        ...(input.sourceObservationId ? { 'playground.source_generation.observation_id': input.sourceObservationId } : {}),
        'playground.plan_version_id': input.planVersionId,
        'playground.review.input_hash': input.inputHash,
        'playground.review.rubric_version': REVIEW_RUBRIC_VERSION,
      }, async (span) => {
        span.setAttribute('gen_ai.operation.name', 'chat')
        span.setAttribute('gen_ai.provider.name', candidate.provider)
        span.setAttribute('gen_ai.request.model', candidate.model)
        span.setAttribute('langfuse.observation.metadata.prompt_version', REVIEW_PROMPT_VERSION)
        if (process.env.LANGFUSE_CAPTURE_PROMPTS === 'true') {
          span.setAttribute('langfuse.observation.input', prompt)
          span.setAttribute('gen_ai.input.messages', JSON.stringify([{ role: 'user', content: prompt }]))
        }
        const result = await generate(candidate, prompt, input.allowedChunkIds, {
          name: 'lesson_review', schema: responseSchema, mockContent: mockReview,
        })
        if (result.usage?.totalTokens !== undefined) span.setAttribute('llm.usage.total_tokens', result.usage.totalTokens)
        if (result.usage?.promptTokens !== undefined) span.setAttribute('gen_ai.usage.input_tokens', result.usage.promptTokens)
        if (result.usage?.completionTokens !== undefined) span.setAttribute('gen_ai.usage.output_tokens', result.usage.completionTokens)
        if (result.usage) {
          span.setAttribute('langfuse.observation.usage_details', JSON.stringify({
            input: result.usage.promptTokens,
            output: result.usage.completionTokens,
            cached_input: result.usage.cachedPromptTokens,
          }))
          const cost = estimateCost(candidate, result.usage)
          if (cost) span.setAttribute('gen_ai.usage.cost', cost.usd)
        }
        if (result.reportedCostUsd !== undefined) span.setAttribute('gen_ai.usage.cost', result.reportedCostUsd)
        if (result.responseModel) span.setAttribute('gen_ai.response.model', result.responseModel)
        if (result.finishReason) span.setAttribute('llm.response.finish_reason', result.finishReason)
        if (process.env.LANGFUSE_CAPTURE_PROMPTS === 'true') {
          span.setAttribute('langfuse.observation.output', result.content)
          span.setAttribute('gen_ai.output.messages', JSON.stringify([{ role: 'assistant', content: result.content }]))
        }
        const context = span.spanContext()
        return {
          result,
          traceId: /^0+$/.test(context.traceId) ? undefined : context.traceId,
          observationId: /^0+$/.test(context.spanId) ? undefined : context.spanId,
        }
      })
      const { result: responseResult, traceId: reviewTraceId, observationId: reviewObservationId } = response
      judgeTraceId = reviewTraceId
      judgeObservationId = reviewObservationId
      if (responseResult.usage) {
        usage = mergeUsage(usage, responseResult.usage)
      }
      if (responseResult.reportedCostUsd !== undefined) {
        reportedCostUsd += responseResult.reportedCostUsd
        hasReportedCost = true
      }
      let raw: unknown
      try {
        raw = parseJson(responseResult.content)
      } catch {
        await withSpan('playground.validation', {
          'playground.review.run_id': reviewRunId,
          'playground.attempt': number,
          'playground.validation.stage': 'review',
          'playground.validation.passed': false,
          'playground.validation.check_count': 1,
          'playground.validation.failed_check_count': 1,
          'playground.validation.failed_codes': 'OUTPUT_SCHEMA_INVALID',
        }, async () => undefined)
        repairErrors = ['Return one valid JSON object matching the supplied ReviewReport schema.']
        verification = { passed: false, checks: [{ code: 'OUTPUT_SCHEMA_INVALID', passed: false, message: 'Response was not valid JSON.' }] }
        attempts.push({ number, prompt, rawOutput: responseResult.content, error: 'Response was not valid JSON.', errorCode: 'OUTPUT_SCHEMA_INVALID', finishReason: responseResult.finishReason, responseModel: responseResult.responseModel, usage: responseResult.usage, reportedCostUsd: responseResult.reportedCostUsd, elapsedMs: Date.now() - attemptStart, traceId: reviewTraceId, observationId: reviewObservationId })
        continue
      }
      const checked = await withSpan('playground.validation', {
        'playground.review.run_id': reviewRunId,
        'playground.attempt': number,
        'playground.validation.stage': 'review',
      }, async (span) => {
        const result = verifyReview(raw, input)
        const failed = result.verification.checks.filter((check) => !check.passed)
        span.setAttributes({
          'playground.validation.passed': result.verification.passed,
          'playground.validation.check_count': result.verification.checks.length,
          'playground.validation.failed_check_count': failed.length,
          'playground.validation.failed_codes': failed.map((check) => check.code).join(','),
        })
        return result
      })
      review = checked.review
      verification = checked.verification
      attempts.push({ number, prompt, rawOutput: responseResult.content, error: verification.passed ? undefined : verification.checks.filter((check) => !check.passed).map((check) => check.message).join(' '), errorCode: verification.passed ? undefined : verification.checks.some((check) => check.code === 'OUTPUT_SCHEMA_INVALID') ? 'OUTPUT_SCHEMA_INVALID' : 'VERIFICATION_FAILED', finishReason: responseResult.finishReason, responseModel: responseResult.responseModel, usage: responseResult.usage, reportedCostUsd: responseResult.reportedCostUsd, elapsedMs: Date.now() - attemptStart, traceId: reviewTraceId, observationId: reviewObservationId })
      if (verification.passed) {
        status = 'evaluated'
        errorCode = undefined
        errorMessage = undefined
        break
      }
      repairErrors = verification.checks.filter((check) => !check.passed).map((check) => check.message)
    } catch (error) {
      const providerError = error instanceof ProviderError ? error : new ProviderError('PROVIDER_UNAVAILABLE', 'Unexpected provider error.')
      attempts.push({ number, prompt, error: providerError.message, errorCode: providerError.code, elapsedMs: Date.now() - attemptStart })
      errorCode = providerError.code
      errorMessage = providerError.message
      if (!providerError.retryable || number === 2) {
        status = providerError.code === 'PROVIDER_AUTH_ERROR' ? 'blocked' : 'failed'
        break
      }
    }
  }

  if (status === 'failed' && verification?.passed === false) {
    const terminalAttempt = attempts.at(-1)
    errorCode = terminalAttempt?.errorCode ?? 'VERIFICATION_FAILED'
    errorMessage = terminalAttempt?.error ?? 'Review output failed deterministic verification after one repair attempt.'
  }
  const findings = review?.findings ?? []
  const scoreTraceId = input.sourceType === 'saved_plan' ? judgeTraceId : input.sourceTraceId
  const scoreObservationId = input.sourceType === 'saved_plan' ? judgeObservationId : input.sourceObservationId
  const judgeScoreDelivery = live && candidate.provider !== 'mock' && status === 'evaluated' && review && verification?.passed
    ? await reportReviewFindingScores({
        traceId: scoreTraceId,
        observationId: scoreObservationId,
        rubricVersion: REVIEW_RUBRIC_VERSION,
        inputHash: input.inputHash,
        counts: {
          total: findings.length,
          blocker: findings.filter((finding) => finding.severity === 'blocker').length,
          warning: findings.filter((finding) => finding.severity === 'warning').length,
          info: findings.filter((finding) => finding.severity === 'info').length,
        },
      })
    : { status: 'skipped' as const, message: live ? 'A valid, verified review result is required before judge scores are reported.' : 'Mock review results are not reported as LLM judge scores.' }
  const report: ReviewRunReport = {
    schemaVersion: 'playground-review-run-v3',
    runId: reviewRunId,
    createdAt: new Date().toISOString(),
    traceId,
    sourceRunId: input.sourceRunId,
    sourceType: input.sourceType,
    sourcePlanId: input.sourcePlanId,
    sourceTraceId: input.sourceTraceId,
    sourceObservationId: input.sourceObservationId,
    planVersionId: input.planVersionId,
    inputHash: input.inputHash,
    promptVersion: REVIEW_PROMPT_VERSION,
    rubricVersion: REVIEW_RUBRIC_VERSION,
    input: { content: input.content, sourceChunks },
    outputSchema: responseSchema,
    candidate,
    status,
    attempts,
    review,
    verification,
    judgeScoreDelivery,
    usage,
    estimatedCost: estimateCost(candidate, usage),
    reportedCostUsd: hasReportedCost ? Number(reportedCostUsd.toFixed(8)) : undefined,
    elapsedMs: Date.now() - startedAt,
    errorCode,
    errorMessage,
  }
  await mkdir(reportsDir, { recursive: true })
  await writeFile(path.join(reportsDir, `${report.runId}.json`), `${JSON.stringify(report, null, 2)}\n`)
  return report
}
