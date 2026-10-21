import type { CurriculumLibraryTargetDto, CurriculumSourceDto } from '@nova/shared'
import type { components } from '../../lib/api-schema'
import { apiClient } from '../../lib/api-client'

export type { CurriculumLibraryTargetDto, CurriculumSourceDto }
export type CurriculumOutcome = components['schemas']['CurriculumOutcomesResponse']['items'][number]
export type CurriculumSource = components['schemas']['CurriculumSourcesResponse']['items'][number]

export const curriculumLibraryKeys = {
  catalogue: ['curriculum-library'] as const,
  target: (id: string) => ['curriculum-library-target', id] as const,
  outcomes: ['outcomes'] as const,
  sources: ['curriculum-sources'] as const,
}

export async function getCurriculumCatalogue() {
  const { data, error } = await apiClient.GET('/api/curriculum/library')
  if (error) throw error
  if (!data) throw new Error('The API returned no curriculum catalogue.')
  return data
}

export async function getCurriculumTarget(targetRevisionId: string) {
  const { data, error } = await apiClient.GET(
    '/api/curriculum/library/targets/{targetRevisionId}',
    { params: { path: { targetRevisionId } } },
  )
  if (error) throw error
  if (!data) throw new Error('The API returned no curriculum target.')
  return data
}

export async function listCurriculumOutcomes() {
  const { data, error } = await apiClient.GET('/api/outcomes')
  if (error) throw error
  if (!data) throw new Error('The API returned no curriculum outcomes.')
  return data.items
}

export async function listCurriculumSources() {
  const { data, error } = await apiClient.GET('/api/sources')
  if (error) throw error
  if (!data) throw new Error('The API returned no curriculum sources.')
  return data.items
}
