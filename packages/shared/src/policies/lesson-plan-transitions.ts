import type { LessonPlanAction, LessonPlanStatus } from '../contracts/lesson-planning'

const lessonPlanTransitions: Record<LessonPlanStatus, Partial<Record<LessonPlanAction, LessonPlanStatus>>> = {
  draft: { edit: 'draft', submit: 'submitted' },
  submitted: { returned: 'returned', published: 'published' },
  returned: { edit: 'draft' },
  published: {},
}

export function transitionLessonPlan(status: LessonPlanStatus, action: LessonPlanAction):
  | { ok: true; status: LessonPlanStatus }
  | { ok: false; code: 'PLAN_TRANSITION_INVALID'; message: string } {
  const next = lessonPlanTransitions[status][action]
  if (next) return { ok: true, status: next }
  if (status === 'published') return { ok: false, code: 'PLAN_TRANSITION_INVALID', message: 'Published lesson plans are read-only.' }
  if (status === 'submitted') return { ok: false, code: 'PLAN_TRANSITION_INVALID', message: action === 'edit'
    ? 'This lesson plan is under review. Wait for the curriculum lead before editing.'
    : 'This lesson plan is already awaiting review.' }
  if (status === 'returned') return { ok: false, code: 'PLAN_TRANSITION_INVALID', message: 'Returned lesson plans must be edited before they can be resubmitted.' }
  return { ok: false, code: 'PLAN_TRANSITION_INVALID', message: 'Only a submitted lesson plan can be reviewed.' }
}
