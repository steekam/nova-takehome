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
  PlanSchema,
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
      (error: unknown) => error instanceof WorkflowError && error.code === 'LESSON_PLAN_QA_FAILED',
    )
  })
})

test('workflow rejects invalid transitions and return comments shorter than eight non-space characters', async () => {
  await withPlanDirectory(async () => {
    const plan = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content: await sampleContent() })
    await assert.rejects(
      publishSubmittedPlan({ planId: plan.planId, leadId: 'lead-1' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_TRANSITION_INVALID',
    )
    await submitTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1' })
    await returnSubmittedPlan({ planId: plan.planId, leadId: 'lead-1', comment: 'Add more learner practice.' })
    const returned = await getPlan(plan.planId)
    assert.equal(PlanSchema.safeParse({
      ...returned,
      events: returned.events.map(event => event.type === 'returned' ? { ...event, comment: 'short' } : event),
    }).success, false)
    await assert.rejects(
      submitTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_TRANSITION_INVALID',
    )
    assert.equal((await getPlan(plan.planId)).status, 'returned')
    await assert.rejects(
      returnSubmittedPlan({ planId: plan.planId, leadId: 'lead-1', comment: 'short' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'PLAN_TRANSITION_INVALID',
    )
    await editTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1', content: await sampleContent() })
    await submitTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1' })
    await assert.rejects(
      returnSubmittedPlan({ planId: plan.planId, leadId: 'lead-1', comment: 'a b c d' }),
      (error: unknown) => error instanceof WorkflowError && error.code === 'REVIEW_COMMENT_REQUIRED',
    )
  })
})

test('saved plans reject status and version pointers that contradict workflow history', async () => {
  await withPlanDirectory(async () => {
    const plan = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content: await sampleContent() })
    assert.equal(PlanSchema.safeParse({ ...plan, status: 'published' }).success, false)
    assert.equal(PlanSchema.safeParse({ ...plan, currentVersionId: '00000000-0000-4000-8000-000000000000' }).success, false)
    await submitTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1' })
    await publishSubmittedPlan({ planId: plan.planId, leadId: 'lead-1' })
    const published = await getPlan(plan.planId)
    assert.equal(PlanSchema.safeParse({ ...published, publishedVersionId: '00000000-0000-4000-8000-000000000000' }).success, false)
    assert.equal(PlanSchema.safeParse({ ...published, versions: published.versions.map(version => ({ ...version, verification: { ...version.verification, passed: false } })) }).success, false)
    assert.equal(PlanSchema.safeParse({ ...published, versions: published.versions.map(version => ({ ...version, verification: { passed: true, checks: version.verification.checks.map((check, index) => index === 0 ? { ...check, passed: false } : check) } })) }).success, false)

    const edited = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content: await sampleContent() })
    const revised = await editTeacherPlan({ planId: edited.planId, ownerId: 'teacher-1', content: await sampleContent() })
    assert.equal(PlanSchema.safeParse({ ...revised, events: revised.events.filter(event => event.type !== 'edited') }).success, false)
  })
})

test('concurrent local edits serialize into consecutive immutable versions', async () => {
  await withPlanDirectory(async () => {
    const content = await sampleContent()
    const plan = await createTeacherPlan({ fixtureId: 'particles', ownerId: 'teacher-1', content })
    await Promise.all([
      editTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1', content }),
      editTeacherPlan({ planId: plan.planId, ownerId: 'teacher-1', content }),
    ])
    const updated = await getPlan(plan.planId)
    assert.equal(updated.versions.length, 3)
    assert.deepEqual(updated.versions.map(({ versionNumber }) => versionNumber), [1, 2, 3])
  })
})
