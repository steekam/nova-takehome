import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { reviewCandidate } from './review.js'
import { runReviewPlanVersion } from './review.js'
import { createTeacherPlan, editTeacherPlan, getPlan, WorkflowError } from './workflow.js'

const contentPath = fileURLToPath(new URL('../fixtures/teacher-authored-particles.json', import.meta.url))

async function withPlaygroundDirectories(run: () => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nova-plan-review-'))
  const previousPlans = process.env.PLAYGROUND_PLANS_DIR
  const previousReports = process.env.PLAYGROUND_REPORTS_DIR
  process.env.PLAYGROUND_PLANS_DIR = path.join(root, 'plans')
  process.env.PLAYGROUND_REPORTS_DIR = path.join(root, 'reports')
  try {
    await run()
  } finally {
    if (previousPlans === undefined) delete process.env.PLAYGROUND_PLANS_DIR
    else process.env.PLAYGROUND_PLANS_DIR = previousPlans
    if (previousReports === undefined) delete process.env.PLAYGROUND_REPORTS_DIR
    else process.env.PLAYGROUND_REPORTS_DIR = previousReports
    await rm(root, { recursive: true, force: true })
  }
}

async function sampleContent(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(contentPath, 'utf8')) as Record<string, unknown>
}

test('advisory review uses the selected frozen teacher-authored version without changing workflow state', async () => {
  await withPlaygroundDirectories(async () => {
    const authored = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content: await sampleContent() })
    const beforeReview = await getPlan(authored.planId)
    const firstReview = await runReviewPlanVersion(authored.planId, authored.versions[0].versionId, false)

    assert.equal(firstReview.sourceType, 'saved_plan')
    assert.equal(firstReview.sourcePlanId, authored.planId)
    assert.equal(firstReview.planVersionId, authored.versions[0].versionId)
    assert.equal(firstReview.status, 'evaluated')
    assert.equal(firstReview.judgeScoreDelivery.status, 'skipped')
    assert.deepEqual(firstReview.input.content, authored.versions[0].content)
    assert.deepEqual(firstReview.input.sourceChunks, authored.versions[0].sourceChunks)
    assert.deepEqual(await getPlan(authored.planId), beforeReview)

    const editedContent = await sampleContent()
    editedContent.title = 'Teacher edit after advisory guidance'
    const edited = await editTeacherPlan({ planId: authored.planId, ownerId: 'teacher-1', content: editedContent })
    const repeatedFirstReview = await runReviewPlanVersion(authored.planId, authored.versions[0].versionId, false)
    const secondReview = await runReviewPlanVersion(authored.planId, edited.versions[1].versionId, false)

    assert.equal(repeatedFirstReview.inputHash, firstReview.inputHash)
    assert.deepEqual(repeatedFirstReview.input, firstReview.input)
    assert.notEqual(secondReview.inputHash, firstReview.inputHash)
    assert.equal(secondReview.input.content.title, edited.versions[1].content.title)
    assert.deepEqual(secondReview.input.sourceChunks, edited.versions[1].sourceChunks)
    assert.deepEqual((await getPlan(authored.planId)).events, edited.events)
  })
})

test('saved-plan review rejects missing snapshots and unknown version IDs with stable codes', async () => {
  await withPlaygroundDirectories(async () => {
    const plan = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content: await sampleContent() })
    await assert.rejects(
      runReviewPlanVersion(plan.planId, '00000000-0000-4000-8000-000000000000', false),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_VERSION_NOT_FOUND',
    )

    const planFile = path.join(process.env.PLAYGROUND_PLANS_DIR!, `${plan.planId}.json`)
    const saved = JSON.parse(await readFile(planFile, 'utf8')) as { versions: Array<Record<string, unknown>> }
    const corrupted = structuredClone(saved)
    const snapshot = corrupted.versions[0].sourceChunks as Array<{ kind: string; targetId?: string }>
    const target = snapshot.find(({ kind }) => kind === 'curriculum_target')!
    target.targetId = 'wrong-target'
    await writeFile(planFile, `${JSON.stringify(corrupted)}\n`)
    await assert.rejects(
      runReviewPlanVersion(plan.planId, plan.versions[0].versionId, false),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_RECORD_INVALID',
    )

    delete saved.versions[0].sourceChunks
    await writeFile(planFile, `${JSON.stringify(saved)}\n`)
    await assert.rejects(
      runReviewPlanVersion(plan.planId, plan.versions[0].versionId, false),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_SOURCE_SNAPSHOT_MISSING',
    )
  })
})
test('LiteLLM review uses the reviewer-role model alias', () => {
  const previousReviewer = process.env.LITELLM_REVIEWER_MODEL
  const previousLegacy = process.env.LITELLM_MODEL
  process.env.LITELLM_REVIEWER_MODEL = 'reviewer-alias'
  process.env.LITELLM_MODEL = 'legacy-alias'
  try {
    assert.equal(reviewCandidate(true, true).model, 'reviewer-alias')
  } finally {
    if (previousReviewer === undefined) delete process.env.LITELLM_REVIEWER_MODEL
    else process.env.LITELLM_REVIEWER_MODEL = previousReviewer
    if (previousLegacy === undefined) delete process.env.LITELLM_MODEL
    else process.env.LITELLM_MODEL = previousLegacy
  }
})
