import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  createTeacherPlan,
  editTeacherPlan,
  getPlan,
  listPlans,
  publishSubmittedPlan,
  returnSubmittedPlan,
  submitTeacherPlan,
  WorkflowError,
} from './workflow.js'

const contentPath = fileURLToPath(new URL('../fixtures/teacher-authored-particles.json', import.meta.url))

async function withPlanDirectory(run: () => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nova-plan-workflow-'))
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
  return JSON.parse(await readFile(contentPath, 'utf8')) as Record<string, unknown>
}

test('teacher-authored plan versions follow draft, submit, return, resubmit, publish', async () => {
  await withPlanDirectory(async () => {
    const firstContent = await sampleContent()
    const authored = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content: firstContent })
    assert.equal(authored.status, 'draft')
    assert.equal(authored.versions[0].origin, 'teacher_authored')
    assert.equal(authored.versions[0].verification.passed, true)
    assert.equal(authored.events[0].type, 'created')
    assert.equal((await listPlans()).length, 1)

    await assert.rejects(
      editTeacherPlan({ planId: authored.planId, ownerId: 'teacher-2', content: firstContent }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_OWNER_MISMATCH',
    )
    const submitted = await submitTeacherPlan({ planId: authored.planId, ownerId: 'teacher-1' })
    assert.equal(submitted.status, 'submitted')

    const returned = await returnSubmittedPlan({ planId: authored.planId, leadId: 'lead-1', comment: 'Clarify that the liquid particles slide past one another.' })
    assert.equal(returned.status, 'returned')
    assert.equal(returned.events.at(-1)?.type, 'returned')

    const editedContent = await sampleContent()
    editedContent.title = 'Teacher revision: compare particle spacing and movement'
    const edited = await editTeacherPlan({ planId: authored.planId, ownerId: 'teacher-1', content: editedContent })
    assert.equal(edited.status, 'draft')
    assert.equal(edited.versions.length, 2)
    assert.equal(edited.versions[1].origin, 'teacher_edit')
    assert.equal(edited.versions[1].parentVersionId, authored.versions[0].versionId)
    assert.equal(edited.versions[0].content.title, 'Compare particle models across three states')
    assert.equal(edited.versions[1].content.title, 'Teacher revision: compare particle spacing and movement')

    const resubmitted = await submitTeacherPlan({ planId: authored.planId, ownerId: 'teacher-1' })
    const published = await publishSubmittedPlan({ planId: authored.planId, leadId: 'lead-1' })
    assert.equal(published.status, 'published')
    assert.equal(published.publishedVersionId, resubmitted.currentVersionId)
    assert.equal((await getPlan(authored.planId)).events.map(({ type }) => type).join(','), 'created,submitted,returned,edited,submitted,published')
  })
})

test('deterministic QA gaps stay visible and block submission', async () => {
  await withPlanDirectory(async () => {
    const content = await sampleContent()
    const objectives = content.lessonObjectives as Array<{ sourceChunkIds: string[] }>
    objectives[0].sourceChunkIds = ['unknown-source']
    const plan = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content })
    assert.equal(plan.status, 'draft')
    assert.equal(plan.versions[0].verification.passed, false)
    assert.ok(plan.versions[0].verification.checks.some(({ code, passed }) => code === 'KNOWN_SOURCE_IDS' && !passed))
    await assert.rejects(
      submitTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_QA_FAILED',
    )
  })
})

test('workflow rejects invalid state transitions and empty return comments', async () => {
  await withPlanDirectory(async () => {
    const plan = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content: await sampleContent() })
    await assert.rejects(
      publishSubmittedPlan({ planId: plan.planId, leadId: 'lead-1' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_TRANSITION_INVALID',
    )
    await submitTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1' })
    await assert.rejects(
      returnSubmittedPlan({ planId: plan.planId, leadId: 'lead-1', comment: '  ' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'LEAD_COMMENT_REQUIRED',
    )
  })
})
