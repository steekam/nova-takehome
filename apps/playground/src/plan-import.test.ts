import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { getFixture } from './corpus.js'
import { editTeacherPlan, importGeneratedPlan, publishSubmittedPlan, returnSubmittedPlan, submitTeacherPlan, WorkflowError } from './workflow.js'

const runId = 'f21eacbf-8133-4e96-8f10-a78c75f8f80d'

async function withPlanDirectory(run: () => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nova-generated-plan-'))
  const previous = process.env.PLAYGROUND_PLANS_DIR
  process.env.PLAYGROUND_PLANS_DIR = directory
  try {
    await run()
  } finally {
    if (previous === undefined) delete process.env.PLAYGROUND_PLANS_DIR
    else process.env.PLAYGROUND_PLANS_DIR = previous
    await rm(directory, { recursive: true, force: true })
  }
}

async function sampleContent(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL('../fixtures/teacher-authored-particles.json', import.meta.url), 'utf8')) as Record<string, unknown>
}

async function generationReport(): Promise<Record<string, unknown>> {
  const fixture = getFixture('particles')
  const content = await sampleContent()
  return {
    schemaVersion: 'playground-run-v10',
    runId,
    scenario: { fixtureId: fixture.id, targetId: fixture.scenario.targetId, requestedDurationMinutes: content.durationMinutes },
    retrieval: { selectedChunkIds: fixture.chunks.map(({ id }) => id), selectedChunks: structuredClone(fixture.chunks) },
    candidates: [{ candidate: { id: 'baseten-deepseek-v4.1-flash' }, status: 'success', content }],
  }
}

test('generated lesson imports as a draft and teacher edits retain its frozen retrieval context', async () => {
  await withPlanDirectory(async () => {
    const report = await generationReport()
    const plan = await importGeneratedPlan({ report, ownerId: 'teacher-1' })
    assert.equal(plan.status, 'draft')
    assert.equal(plan.versions[0].origin, 'ai_generated')
    assert.deepEqual(plan.versions[0].generation, { runId, candidateId: 'baseten-deepseek-v4.1-flash' })
    assert.equal(plan.events[0].type, 'drafted')
    assert.equal(plan.versions[0].verification.passed, true)

    const editedContent = await sampleContent()
    editedContent.title = 'Teacher-edited generated lesson'
    const edited = await editTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1', content: editedContent })
    assert.deepEqual(edited.versions[1].sourceChunks, plan.versions[0].sourceChunks)
    assert.equal(edited.versions[1].origin, 'teacher_edit')
  })
})

test('generated lessons retain a teacher-selected duration when imported as plans', async () => {
  await withPlanDirectory(async () => {
    const report = await generationReport()
    const scenario = report.scenario as Record<string, unknown>
    const candidates = report.candidates as Array<{ content: Record<string, unknown> }>
    const content = candidates[0].content
    scenario.requestedDurationMinutes = 30
    content.durationMinutes = 30
    const activities = content.activities as Array<Record<string, unknown>>
    activities[0].durationMinutes = 5
    activities[1].durationMinutes = 20
    activities[2].durationMinutes = 5

    const plan = await importGeneratedPlan({ report, ownerId: 'teacher-1' })
    assert.equal(plan.versions[0].content.durationMinutes, 30)
    assert.equal(plan.versions[0].verification.passed, true)
  })
})

test('imported AI draft can be edited, returned, resubmitted, and published', async () => {
  await withPlanDirectory(async () => {
    const report = await generationReport()
    const imported = await importGeneratedPlan({ report, ownerId: 'teacher-1' })
    const firstVersionId = imported.currentVersionId
    const submitted = await submitTeacherPlan({ planId: imported.planId, ownerId: 'teacher-1' })
    assert.equal(submitted.status, 'submitted')

    const returned = await returnSubmittedPlan({ planId: imported.planId, leadId: 'lead-1', comment: 'Clarify the evidence for the closing check.' })
    assert.equal(returned.status, 'returned')
    const revisedContent = await sampleContent()
    revisedContent.title = 'Teacher revision of generated lesson'
    const edited = await editTeacherPlan({ planId: imported.planId, ownerId: 'teacher-1', content: revisedContent })
    assert.equal(edited.status, 'draft')
    assert.equal(edited.versions[1].parentVersionId, firstVersionId)
    assert.deepEqual(edited.versions[1].sourceChunks, imported.versions[0].sourceChunks)

    const resubmitted = await submitTeacherPlan({ planId: imported.planId, ownerId: 'teacher-1' })
    const published = await publishSubmittedPlan({ planId: imported.planId, leadId: 'lead-1' })
    assert.equal(published.status, 'published')
    assert.equal(published.publishedVersionId, resubmitted.currentVersionId)
    assert.deepEqual(published.events.map(({ type }) => type), ['drafted', 'submitted', 'returned', 'edited', 'submitted', 'published'])
  })
})

test('generation import requires an explicit candidate when multiple lessons exist', async () => {
  await withPlanDirectory(async () => {
    const report = await generationReport()
    const candidates = report.candidates as Array<Record<string, unknown>>
    candidates.push({ ...candidates[0], candidate: { id: 'second-candidate' } })
    await assert.rejects(
      importGeneratedPlan({ report, ownerId: 'teacher-1' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'GENERATION_CANDIDATE_REQUIRED',
    )
    const selected = await importGeneratedPlan({ report, ownerId: 'teacher-1', candidateId: 'second-candidate' })
    assert.equal(selected.versions[0].generation?.candidateId, 'second-candidate')
  })
})

test('schema-valid generated drafts with QA gaps import but cannot be submitted', async () => {
  await withPlanDirectory(async () => {
    const report = await generationReport()
    const candidates = report.candidates as Array<{ status: string; content: Record<string, unknown> }>
    candidates[0].status = 'failed'
    const objectives = candidates[0].content.lessonObjectives as Array<{ sourceChunkIds: string[] }>
    objectives[0].sourceChunkIds = ['unknown-source']
    const plan = await importGeneratedPlan({ report, ownerId: 'teacher-1' })
    assert.equal(plan.status, 'draft')
    assert.equal(plan.versions[0].verification.passed, false)
    assert.ok(plan.versions[0].verification.checks.some(({ code, passed }) => code === 'KNOWN_SOURCE_IDS' && !passed))
  })
})

test('generation import rejects mismatched target and incomplete retrieval snapshots', async () => {
  await withPlanDirectory(async () => {
    const mismatched = await generationReport()
    const scenario = mismatched.scenario as Record<string, unknown>
    scenario.targetId = 'wrong-target'
    await assert.rejects(
      importGeneratedPlan({ report: mismatched, ownerId: 'teacher-1' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'GENERATION_TARGET_MISMATCH',
    )

    const incomplete = await generationReport()
    const retrieval = incomplete.retrieval as { selectedChunkIds: string[]; selectedChunks: Array<{ id: string }> }
    retrieval.selectedChunkIds[0] = 'wrong-chunk'
    await assert.rejects(
      importGeneratedPlan({ report: incomplete, ownerId: 'teacher-1' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'GENERATION_RETRIEVAL_INVALID',
    )

    const forged = await generationReport()
    const forgedRetrieval = forged.retrieval as { selectedChunks: Array<{ kind: string; text: string }> }
    const teachingNote = forgedRetrieval.selectedChunks.find(({ kind }) => kind === 'teaching_note')!
    teachingNote.text = 'Forged evidence with an otherwise valid chunk ID.'
    await assert.rejects(
      importGeneratedPlan({ report: forged, ownerId: 'teacher-1' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'GENERATION_RETRIEVAL_INVALID',
    )
  })
})
