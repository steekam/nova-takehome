import type { components } from '../../lib/api-schema'
import { apiClient } from '../../lib/api-client'

type Schemas = components['schemas']

export type LessonPlan = Schemas['LessonPlanResponse']['plan']
export type LessonPlanSummary = Schemas['LessonPlanListResponse']['items'][number]
export type LessonPlanDetails = Schemas['LessonPlanDetailsResponse']
export type LessonPlanContent = Schemas['LessonPlanContent']
export type QualityReport = LessonPlanDetails['qa']
export type RubricQa = NonNullable<LessonPlanDetails['rubricQa']>

export const lessonPlanningKeys = {
  all: ['lesson-plans'] as const,
  detail: (id: string) => ['lesson-plan', id] as const,
}

export async function listLessonPlans() {
  const { data, error } = await apiClient.GET('/api/lesson-plans')
  if (error) throw error
  if (!data) throw new Error('The API returned no lesson plan list.')
  return data.items
}

export async function getLessonPlan(id: string) {
  const { data, error } = await apiClient.GET('/api/lesson-plans/{id}', {
    params: { path: { id } },
  })
  if (error) throw error
  if (!data) throw new Error('The API returned no lesson plan details.')
  return data
}

export async function validateLessonPlan(id: string, versionId: string) {
  const { data, error } = await apiClient.POST('/api/lesson-plans/{id}/validate', {
    params: { path: { id } },
    body: { versionId },
  })
  if (error) throw error
  if (!data) throw new Error('The API returned no rubric review.')
  return data.validation
}

export async function generateLessonPlan(input: {
  targetRevisionId: string
  durationMinutes: number
}) {
  const { data, error } = await apiClient.POST('/api/lesson-plans/generate', { body: input })
  if (error) throw error
  if (!data) throw new Error('The API returned no generated lesson plan.')
  return data
}

export async function updateLessonPlan(id: string, content: LessonPlanContent) {
  const { data, error } = await apiClient.PATCH('/api/lesson-plans/{id}', {
    params: { path: { id } },
    body: { content },
  })
  if (error) throw error
  if (!data) throw new Error('The API returned no updated lesson plan.')
  return data
}

export async function submitLessonPlan(id: string) {
  const { data, error } = await apiClient.POST('/api/lesson-plans/{id}/submit', {
    params: { path: { id } },
  })
  if (error) throw error
  if (!data) throw new Error('The API returned no submitted lesson plan.')
  return data
}

export async function deleteLessonPlan(id: string) {
  const { error } = await apiClient.DELETE('/api/lesson-plans/{id}', {
    params: { path: { id } },
  })
  if (error) throw error
}

export async function reviewLessonPlan(
  id: string,
  input: { decision: 'returned' | 'published'; comment?: string },
) {
  const { data, error } = await apiClient.POST('/api/lesson-plans/{id}/reviews', {
    params: { path: { id } },
    body: input,
  })
  if (error) throw error
  if (!data) throw new Error('The API returned no review decision.')
  return data
}
