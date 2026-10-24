import type { LessonPlanTableItem } from '../../components/lesson-plan-table'
import type { LessonPlanSummary } from './api'

export function toLessonPlanTableItems(plans: LessonPlanSummary[]): LessonPlanTableItem[] {
  return plans.map((plan) => ({
    id: plan.id,
    title: plan.content.title,
    subject: plan.content.subject,
    grade: plan.content.grade,
    targetRevisionId: plan.targetRevisionId,
    curriculumContext: plan.curriculumContext,
    status: plan.status,
    availableActions: plan.viewer.availableActions,
    updatedAt: plan.updatedAt,
  }))
}
