import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { getFixture } from './corpus.js'
import type { FixtureId } from './corpus.js'
import { CorpusChunkSchema, LessonContentSchema } from './domain.js'
import { verify } from './verify.js'

const checkSchema = z.object({ code: z.string(), passed: z.boolean(), message: z.string() }).strict()
const verificationSchema = z.object({ passed: z.boolean(), checks: z.array(checkSchema) }).strict()
const versionSchema = z.object({
  versionId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  parentVersionId: z.string().uuid().optional(),
  origin: z.enum(['ai_generated', 'teacher_authored', 'teacher_edit']),
  createdAt: z.string().datetime(),
  content: LessonContentSchema,
  sourceChunks: z.array(CorpusChunkSchema).min(1).optional(),
  generation: z.object({ runId: z.string().uuid(), candidateId: z.string().min(1) }).strict().optional(),
  verification: verificationSchema,
}).strict()
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('drafted'), actorRole: z.literal('ai'), actorId: z.string().min(1), runId: z.string().uuid(), versionId: z.string().uuid(), at: z.string().datetime() }).strict(),
  z.object({ type: z.literal('created'), actorRole: z.literal('teacher'), actorId: z.string().min(1), versionId: z.string().uuid(), at: z.string().datetime() }).strict(),
  z.object({ type: z.literal('edited'), actorRole: z.literal('teacher'), actorId: z.string().min(1), versionId: z.string().uuid(), at: z.string().datetime() }).strict(),
  z.object({ type: z.literal('submitted'), actorRole: z.literal('teacher'), actorId: z.string().min(1), versionId: z.string().uuid(), at: z.string().datetime() }).strict(),
  z.object({ type: z.literal('returned'), actorRole: z.literal('lead'), actorId: z.string().min(1), versionId: z.string().uuid(), at: z.string().datetime(), comment: z.string().min(1) }).strict(),
  z.object({ type: z.literal('published'), actorRole: z.literal('lead'), actorId: z.string().min(1), versionId: z.string().uuid(), at: z.string().datetime() }).strict(),
])

export const PlanSchema = z.object({
  schemaVersion: z.literal('playground-plan-v1'),
  planId: z.string().uuid(),
  ownerId: z.string().min(1),
  fixtureId: z.enum(['particles', 'changes']),
  targetId: z.string().min(1),
  status: z.enum(['draft', 'submitted', 'returned', 'published']),
  currentVersionId: z.string().uuid(),
  publishedVersionId: z.string().uuid().optional(),
  versions: z.array(versionSchema).min(1),
  events: z.array(eventSchema).min(1),
}).strict()

export type Plan = z.infer<typeof PlanSchema>
export type PlanVersion = Plan['versions'][number]

export class WorkflowError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'WorkflowError'
  }
}

function planDirectory(): string {
  return path.resolve(process.env.PLAYGROUND_PLANS_DIR ?? '.cache/playground/plans')
}

function planPath(planId: string): string {
  if (!z.string().uuid().safeParse(planId).success) throw new WorkflowError('PLAN_ID_INVALID', 'Plan ID must be a UUID.')
  return path.join(planDirectory(), `${planId}.json`)
}

function validatedContent(raw: unknown, sourceChunks: PlanVersion['sourceChunks'], requestedDurationMinutes?: number) {
  if (!sourceChunks) throw new WorkflowError('PLAN_SOURCE_SNAPSHOT_MISSING', 'Plan version has no frozen source snapshot.')
  const parsed = LessonContentSchema.safeParse(raw)
  const result = verify(raw, sourceChunks, requestedDurationMinutes ?? (parsed.success ? parsed.data.durationMinutes : undefined))
  if (!result.content) throw new WorkflowError('PLAN_CONTENT_INVALID', result.verification.checks.map(({ message }) => message).join(' '))
  return { content: result.content, verification: result.verification }
}

const generationReportSchema = z.object({
  schemaVersion: z.literal('playground-run-v10'),
  runId: z.string().uuid(),
  scenario: z.object({ fixtureId: z.enum(['particles', 'changes']), targetId: z.string().min(1), requestedDurationMinutes: z.number().int().min(30).max(60).multipleOf(5) }),
  retrieval: z.object({ selectedChunkIds: z.array(z.string()).min(1), selectedChunks: z.array(CorpusChunkSchema).min(1) }),
  candidates: z.array(z.object({ candidate: z.object({ id: z.string().min(1) }), status: z.enum(['success', 'failed', 'blocked']), content: z.unknown().optional() })),
  selection: z.object({ candidateId: z.string().min(1) }).optional(),
})

async function readPlan(planId: string): Promise<Plan> {
  const filePath = planPath(planId)
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new WorkflowError('PLAN_NOT_FOUND', `No plan exists with ID ${planId}.`)
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new WorkflowError('PLAN_RECORD_INVALID', `Saved plan ${planId} is not valid JSON.`)
  }
  const parsed = PlanSchema.safeParse(value)
  if (!parsed.success) throw new WorkflowError('PLAN_RECORD_INVALID', `Saved plan ${planId} does not match playground-plan-v1.`)
  return parsed.data
}

async function writePlan(plan: Plan): Promise<void> {
  const directory = planDirectory()
  await mkdir(directory, { recursive: true })
  const destination = planPath(plan.planId)
  const temporary = `${destination}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, destination)
}

function currentVersion(plan: Plan): PlanVersion {
  const version = plan.versions.find(({ versionId }) => versionId === plan.currentVersionId)
  if (!version) throw new WorkflowError('PLAN_RECORD_INVALID', 'Current version is missing from the plan history.')
  return version
}

function requireOwner(plan: Plan, ownerId: string): void {
  if (plan.ownerId !== ownerId) throw new WorkflowError('PLAN_OWNER_MISMATCH', 'Only the owning teacher can change or submit this plan.')
}

export async function createTeacherPlan(input: { fixtureId: FixtureId; ownerId: string; content: unknown }): Promise<Plan> {
  if (!input.ownerId.trim()) throw new WorkflowError('ACTOR_REQUIRED', 'Teacher owner ID is required.')
  const fixture = getFixture(input.fixtureId)
  const sourceChunks = structuredClone(fixture.chunks)
  const { content, verification } = validatedContent(input.content, sourceChunks)
  const planId = randomUUID()
  const versionId = randomUUID()
  const at = new Date().toISOString()
  const plan: Plan = {
    schemaVersion: 'playground-plan-v1',
    planId,
    ownerId: input.ownerId,
    fixtureId: input.fixtureId,
    targetId: fixture.scenario.targetId,
    status: 'draft',
    currentVersionId: versionId,
    versions: [{ versionId, versionNumber: 1, origin: 'teacher_authored', createdAt: at, content, sourceChunks, verification }],
    events: [{ type: 'created', actorRole: 'teacher', actorId: input.ownerId, versionId, at }],
  }
  await writePlan(plan)
  return plan
}

export async function importGeneratedPlan(input: { report: unknown; ownerId: string; candidateId?: string }): Promise<Plan> {
  if (!input.ownerId.trim()) throw new WorkflowError('ACTOR_REQUIRED', 'Teacher owner ID is required.')
  const parsed = generationReportSchema.safeParse(input.report)
  if (!parsed.success) throw new WorkflowError('GENERATION_REPORT_INVALID', 'Generation report is missing a supported frozen retrieval snapshot or candidate list.')
  const report = parsed.data
  const fixture = getFixture(report.scenario.fixtureId)
  if (fixture.scenario.targetId !== report.scenario.targetId) {
    throw new WorkflowError('GENERATION_TARGET_MISMATCH', 'Generation report target does not match its CBC fixture.')
  }
  const selectedIds = report.retrieval.selectedChunks.map(({ id }) => id)
  if (new Set(selectedIds).size !== selectedIds.length
    || selectedIds.length !== report.retrieval.selectedChunkIds.length
    || selectedIds.some((id, index) => id !== report.retrieval.selectedChunkIds[index])) {
    throw new WorkflowError('GENERATION_RETRIEVAL_INVALID', 'Generation report chunk IDs do not match its frozen retrieval snapshot.')
  }
  const canonicalChunks = new Map(fixture.chunks.map((chunk) => [chunk.id, chunk]))
  if (report.retrieval.selectedChunks.some((chunk) => !isDeepStrictEqual(canonicalChunks.get(chunk.id), chunk))) {
    throw new WorkflowError('GENERATION_RETRIEVAL_INVALID', 'Frozen retrieval snapshot contains content that does not match the CBC fixture.')
  }
  if (!report.retrieval.selectedChunks.some((chunk) => chunk.kind === 'curriculum_target' && chunk.targetId === report.scenario.targetId)) {
    throw new WorkflowError('GENERATION_TARGET_MISSING', 'Frozen retrieval snapshot does not contain the selected CBC curriculum target.')
  }
  const requiredChunkIds = [
    fixture.chunks.find((chunk) => chunk.kind === 'curriculum_target')!.id,
    ...fixture.chunks.filter((chunk) => chunk.kind === 'lead_guidance').map(({ id }) => id),
    fixture.citationEvidence.lessonFocusChunkId,
    fixture.citationEvidence.assessmentChunkId,
  ]
  if (requiredChunkIds.some((id) => !selectedIds.includes(id))) {
    throw new WorkflowError('GENERATION_RETRIEVAL_INVALID', 'Frozen retrieval snapshot is missing a pinned CBC target or evidence chunk.')
  }
  const importable = report.candidates.filter(({ status, content }) => status !== 'blocked' && content !== undefined)
  const selectedCandidateId = input.candidateId ?? report.selection?.candidateId
  const candidate = selectedCandidateId
    ? importable.find(({ candidate }) => candidate.id === selectedCandidateId)
    : importable.length === 1 ? importable[0] : undefined
  if (!candidate) {
    if (!importable.length) throw new WorkflowError('GENERATION_NO_IMPORTABLE_CANDIDATE', 'No candidate in this report produced schema-valid lesson content.')
    if (selectedCandidateId) throw new WorkflowError('GENERATION_CANDIDATE_INVALID', `Candidate ${selectedCandidateId} has no importable lesson content.`)
    throw new WorkflowError('GENERATION_CANDIDATE_REQUIRED', 'Choose --candidate because this report has multiple importable lessons.')
  }
  const { content, verification } = validatedContent(candidate.content, report.retrieval.selectedChunks, report.scenario.requestedDurationMinutes)
  if (content.durationMinutes !== report.scenario.requestedDurationMinutes) {
    throw new WorkflowError('GENERATION_DURATION_MISMATCH', 'Generated lesson duration does not match the requested duration in its report.')
  }
  const planId = randomUUID()
  const versionId = randomUUID()
  const at = new Date().toISOString()
  const plan: Plan = {
    schemaVersion: 'playground-plan-v1',
    planId,
    ownerId: input.ownerId,
    fixtureId: report.scenario.fixtureId,
    targetId: report.scenario.targetId,
    status: 'draft',
    currentVersionId: versionId,
    versions: [{
      versionId,
      versionNumber: 1,
      origin: 'ai_generated',
      createdAt: at,
      content,
      sourceChunks: structuredClone(report.retrieval.selectedChunks),
      generation: { runId: report.runId, candidateId: candidate.candidate.id },
      verification,
    }],
    events: [{ type: 'drafted', actorRole: 'ai', actorId: candidate.candidate.id, runId: report.runId, versionId, at }],
  }
  await writePlan(plan)
  return plan
}

export async function editTeacherPlan(input: { planId: string; ownerId: string; content: unknown }): Promise<Plan> {
  const plan = await readPlan(input.planId)
  requireOwner(plan, input.ownerId)
  if (plan.status !== 'draft' && plan.status !== 'returned') throw new WorkflowError('PLAN_TRANSITION_INVALID', `A ${plan.status} plan cannot be edited.`)
  const previous = currentVersion(plan)
  const sourceChunks = structuredClone(previous.sourceChunks ?? getFixture(plan.fixtureId).chunks)
  const { content, verification } = validatedContent(input.content, sourceChunks)
  const versionId = randomUUID()
  const at = new Date().toISOString()
  const updated: Plan = {
    ...plan,
    status: 'draft',
    currentVersionId: versionId,
    versions: [...plan.versions, { versionId, versionNumber: previous.versionNumber + 1, parentVersionId: previous.versionId, origin: 'teacher_edit', createdAt: at, content, sourceChunks, verification }],
    events: [...plan.events, { type: 'edited', actorRole: 'teacher', actorId: input.ownerId, versionId, at }],
  }
  await writePlan(updated)
  return updated
}

export async function submitTeacherPlan(input: { planId: string; ownerId: string }): Promise<Plan> {
  const plan = await readPlan(input.planId)
  requireOwner(plan, input.ownerId)
  if (plan.status !== 'draft') throw new WorkflowError('PLAN_TRANSITION_INVALID', `Only a draft plan can be submitted; current status is ${plan.status}.`)
  const version = currentVersion(plan)
  if (!version.verification.passed) {
    const failures = version.verification.checks.filter(({ passed }) => !passed).map(({ code }) => code).join(', ')
    throw new WorkflowError('PLAN_QA_FAILED', `Fix deterministic QA gaps before submission: ${failures}.`)
  }
  const at = new Date().toISOString()
  const updated: Plan = { ...plan, status: 'submitted', events: [...plan.events, { type: 'submitted', actorRole: 'teacher', actorId: input.ownerId, versionId: version.versionId, at }] }
  await writePlan(updated)
  return updated
}

export async function returnSubmittedPlan(input: { planId: string; leadId: string; comment: string }): Promise<Plan> {
  const plan = await readPlan(input.planId)
  if (!input.leadId.trim()) throw new WorkflowError('ACTOR_REQUIRED', 'Curriculum Lead ID is required.')
  if (!input.comment.trim()) throw new WorkflowError('LEAD_COMMENT_REQUIRED', 'A return decision needs an actionable comment.')
  if (plan.status !== 'submitted') throw new WorkflowError('PLAN_TRANSITION_INVALID', `Only a submitted plan can be returned; current status is ${plan.status}.`)
  const version = currentVersion(plan)
  const at = new Date().toISOString()
  const updated: Plan = { ...plan, status: 'returned', events: [...plan.events, { type: 'returned', actorRole: 'lead', actorId: input.leadId, versionId: version.versionId, at, comment: input.comment }] }
  await writePlan(updated)
  return updated
}

export async function publishSubmittedPlan(input: { planId: string; leadId: string }): Promise<Plan> {
  const plan = await readPlan(input.planId)
  if (!input.leadId.trim()) throw new WorkflowError('ACTOR_REQUIRED', 'Curriculum Lead ID is required.')
  if (plan.status !== 'submitted') throw new WorkflowError('PLAN_TRANSITION_INVALID', `Only a submitted plan can be published; current status is ${plan.status}.`)
  const version = currentVersion(plan)
  const at = new Date().toISOString()
  const updated: Plan = {
    ...plan,
    status: 'published',
    publishedVersionId: version.versionId,
    events: [...plan.events, { type: 'published', actorRole: 'lead', actorId: input.leadId, versionId: version.versionId, at }],
  }
  await writePlan(updated)
  return updated
}

export async function getPlan(planId: string): Promise<Plan> {
  return readPlan(planId)
}

export async function listPlans(): Promise<Plan[]> {
  let filenames: string[]
  try {
    filenames = (await readdir(planDirectory())).filter((filename) => filename.endsWith('.json'))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
  return Promise.all(filenames.map(async (filename) => {
    const planId = filename.slice(0, -'.json'.length)
    return readPlan(planId)
  }))
}
