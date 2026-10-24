import {
  LlmModeSchema,
  LlmMockScenarioSchema,
  RuntimeLlmModeStatusSchema,
  type LlmMockScenario,
  type LlmMode,
  type RuntimeLlmModeStatus,
} from '@nova/shared'
import { apiClient } from '../../lib/api-client'

export type { LlmMockScenario, LlmMode, RuntimeLlmModeStatus }

export const runtimeLlmKey = ['runtime-llm-mode'] as const

export async function getRuntimeLlmMode() {
  const { data, error } = await apiClient.GET('/api/runtime/llm')
  if (error) throw error
  if (!data) throw new Error('The API returned no runtime model settings.')
  return RuntimeLlmModeStatusSchema.parse(data)
}

export async function setRuntimeLlmMode(mode: LlmMode, mockScenario?: LlmMockScenario) {
  const { data, error } = await apiClient.PUT('/api/runtime/llm', {
    body: {
      mode: LlmModeSchema.parse(mode),
      ...(mockScenario ? { mockScenario: LlmMockScenarioSchema.parse(mockScenario) } : {}),
    },
  })
  if (error) throw error
  if (!data) throw new Error('The API returned no updated runtime model settings.')
  return RuntimeLlmModeStatusSchema.parse(data)
}
