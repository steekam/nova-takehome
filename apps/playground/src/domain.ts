import { z } from 'zod'

export const ParticleScoringSchema = z.object({
      perDiagram: z.object({ pointsPerCriterion: z.number().int().positive(), criteria: z.array(z.enum(['state', 'spacing', 'movement'])).length(3) }).strict(),
      particleSizeAcrossPair: z.object({ points: z.number().int().positive(), expected: z.enum(['same', 'larger', 'smaller']) }).strict(),
      spacingComparison: z.object({ points: z.number().int().positive(), criterion: z.enum(['similar_or_different']) }).strict(),
      movementComparison: z.object({ points: z.number().int().positive(), criterion: z.enum(['compare_movement']) }).strict(),
      totalPoints: z.number().int().positive(),
}).strict()

export const ChangeScoringSchema = z.object({
  perCase: z.object({
    pointsPerCriterion: z.number().int().positive(),
    criteria: z.array(z.enum(['classification', 'new_substance_evidence'])).length(2),
    caseCount: z.number().int().positive(),
  }).strict(),
  totalPoints: z.number().int().positive(),
}).strict()

export const LessonContentSchema = z.object({
  title: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  lessonObjectives: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    sourceChunkIds: z.array(z.string().min(1)).min(1),
  }).strict()).min(1),
  materials: z.array(z.object({ name: z.string().min(1), notes: z.string().min(1) }).strict()),
  activities: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(['starter', 'main', 'closing']),
    durationMinutes: z.number().int().positive(),
    teacherActions: z.string().min(1),
    learnerActions: z.string().min(1),
    objectiveIds: z.array(z.string().min(1)).min(1),
    sourceChunkIds: z.array(z.string().min(1)).min(1),
  }).strict()).min(2),
  checksForUnderstanding: z.array(z.object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    expectedEvidence: z.string().min(1),
    scoringCriteria: z.union([ParticleScoringSchema, ChangeScoringSchema]),
    objectiveIds: z.array(z.string().min(1)).min(1),
    sourceChunkIds: z.array(z.string().min(1)).min(1),
  }).strict()).min(1),
  differentiation: z.array(z.string().min(1)),
  safetyNotes: z.array(z.string().min(1)),
}).strict()

export type LessonContent = z.infer<typeof LessonContentSchema>

export const SourceReferenceSchema = z.object({
  sourceId: z.string(),
  publisher: z.string(),
  documentTitle: z.string(),
  edition: z.string(),
  url: z.string().url(),
  locator: z.string(),
  relationship: z.enum(['exact_excerpt', 'paraphrase']),
}).strict()

export type SourceReference = z.infer<typeof SourceReferenceSchema>

export const CorpusChunkSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  title: z.string(),
  kind: z.enum(['curriculum_target', 'scheme', 'teaching_note', 'assessment', 'lead_guidance', 'exemplar']),
  text: z.string(),
  synthetic: z.boolean(),
  eligibleForGrounding: z.literal(true),
  targetId: z.string().optional(),
  sourceReference: SourceReferenceSchema.optional(),
}).strict()

export type CorpusChunk = z.infer<typeof CorpusChunkSchema>

export type Candidate = {
  id: string
  provider: 'baseten' | 'litellm' | 'opencode_cli' | 'mock'
  model: string
  displayName: string
}

export function modelLabel(candidate: Candidate, responseModel?: string): string {
  if (responseModel && responseModel !== candidate.model) return responseModel
  if (candidate.provider === 'litellm') return candidate.displayName.replace(/ via LiteLLM$/, '')
  return candidate.model
}

export type Verification = {
  passed: boolean
  checks: Array<{ code: string; passed: boolean; message: string }>
}

export type TokenUsage = {
  promptTokens?: number
  cachedPromptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type CostEstimate = {
  usd: number
  inputRateUsdPerMillion: number
  cachedInputRateUsdPerMillion: number
  outputRateUsdPerMillion: number
  pricingModel: string
  pricingSource: string
  pricingCheckedAt: string
}

export type RunReport = {
  schemaVersion: 'playground-run-v10'
  runId: string
  createdAt: string
  traceId?: string
  scenario: {
    fixtureId?: 'particles' | 'changes'
    curriculum: string
    curriculumRelease: string
    programme: string
    grade: string
    subject: string
    targetId: string
    targetLocator: string
    lessonFocus: string
    requestedDurationMinutes: number
    containsSyntheticSources: true
  }
  retrieval: {
    model: string
    modelRevision?: string
    query: string
    selectedChunkIds: string[]
    selectedChunks: CorpusChunk[]
    ranked: Array<{ chunkId: string; score: number }>
    cacheHits: number
    cacheMisses: number
  }
  promptVersion: string
  promptName: string
  promptSource: 'local' | 'langfuse'
  promptFallbackReason?: string
  outputSchema: unknown
  candidates: Array<{
    candidate: Candidate
    status: 'success' | 'failed' | 'blocked'
    attempts: Array<{ number: number; prompt: string; rawOutput?: string; error?: string; errorCode?: string; finishReason?: string; responseModel?: string; usage?: TokenUsage; reportedCostUsd?: number; elapsedMs: number; traceId?: string; observationId?: string; langfuseScore?: import('./telemetry.js').ScoreDelivery }>
    content?: LessonContent
    verification?: Verification
    usage?: TokenUsage
    estimatedCost?: CostEstimate
    reportedCostUsd?: number
    elapsedMs: number
    errorCode?: string
    errorMessage?: string
  }>
  expandedMatrix?: false
  selection?: { candidateId: string; reason: string }
}
