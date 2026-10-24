import {
  transitionLessonPlan,
  type ApiPrincipal,
  type LessonPlanAvailableActions,
  type LessonPlanStatus,
} from '@nova/shared'
import { Policy } from './policy'

@Policy()
export class RoutePolicy {
  authenticated(principal: ApiPrincipal | null) {
    return principal !== null
  }

  publicRoute(_principal: ApiPrincipal | null) {
    return true
  }
}

@Policy()
export class LessonPlanPolicy {
  view(principal: ApiPrincipal | null) {
    return has(principal, 'lesson_plan:view')
  }
  create(principal: ApiPrincipal | null) {
    return has(principal, 'lesson_plan:create')
  }
  edit(principal: ApiPrincipal | null) {
    return has(principal, 'lesson_plan:edit')
  }
  submit(principal: ApiPrincipal | null) {
    return has(principal, 'lesson_plan:submit')
  }
  delete(principal: ApiPrincipal | null) {
    return has(principal, 'lesson_plan:delete')
  }
  review(principal: ApiPrincipal | null) {
    return has(principal, 'lesson_plan:review')
  }

  viewPlan(principal: ApiPrincipal | null, plan: LessonPlanAccess) {
    return (
      has(principal, 'lesson_plan:view') &&
      (plan.teacherId === principal?.subject ||
        plan.status === 'published' ||
        (has(principal, 'lesson_plan:review') && plan.status === 'submitted'))
    )
  }

  editPlan(principal: ApiPrincipal | null, plan: LessonPlanAccess) {
    return has(principal, 'lesson_plan:edit') && plan.teacherId === principal?.subject
  }

  deletePlan(principal: ApiPrincipal | null, plan: LessonPlanAccess) {
    return has(principal, 'lesson_plan:delete') && plan.teacherId === principal?.subject
  }

  submitPlan(principal: ApiPrincipal | null, plan: LessonPlanAccess) {
    return has(principal, 'lesson_plan:submit') && plan.teacherId === principal?.subject
  }
}

export function lessonPlanAvailableActions(
  principal: ApiPrincipal,
  plan: LessonPlanAccess,
  hasReviewHistory: boolean,
): LessonPlanAvailableActions {
  const policy = new LessonPlanPolicy()
  const editTransition = transitionLessonPlan(plan.status, 'edit')
  const canEdit = policy.editPlan(principal, plan) && editTransition.ok
  const canSubmit =
    policy.submitPlan(principal, plan) &&
    (transitionLessonPlan(plan.status, 'submit').ok ||
      (editTransition.ok && transitionLessonPlan(editTransition.status, 'submit').ok))

  return {
    edit: canEdit,
    submit: canSubmit,
    delete: policy.deletePlan(principal, plan) && plan.status === 'draft' && !hasReviewHistory,
    returnForRevision: policy.review(principal) && transitionLessonPlan(plan.status, 'returned').ok,
    publish: policy.review(principal) && transitionLessonPlan(plan.status, 'published').ok,
    validate: policy.viewPlan(principal, plan),
  }
}

export interface LessonPlanAccess {
  teacherId: string
  status: LessonPlanStatus
}

@Policy()
export class CurriculumSourcePolicy {
  viewDraft(principal: ApiPrincipal | null) {
    return has(principal, 'curriculum_source:view_draft')
  }
  add(principal: ApiPrincipal | null) {
    return has(principal, 'curriculum_source:add')
  }
  publish(principal: ApiPrincipal | null) {
    return has(principal, 'curriculum_source:publish')
  }
}

@Policy()
export class RuntimeLlmPolicy {
  manage(principal: ApiPrincipal | null) {
    return has(principal, 'runtime_llm:manage')
  }
}

function has(principal: ApiPrincipal | null, permission: ApiPrincipal['permissions'][number]) {
  return principal?.permissions.includes(permission) === true
}
