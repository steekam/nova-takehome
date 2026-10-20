import type { LlmMode, RuntimeLlmModeStatus } from '@nova/shared'
import { apiClient } from '../../lib/api-client'

export type { LlmMode, RuntimeLlmModeStatus }

export const runtimeLlmKey = ['runtime-llm-mode'] as const

export async function getRuntimeLlmMode() {
  const { data, error } = await apiClient.GET('/api/runtime/llm')
  if (error) throw error
  if (!data) throw new Error('The API returned no runtime model settings.')
  return data
}

export async function setRuntimeLlmMode(mode: LlmMode) {
  const { data, error } = await apiClient.PUT('/api/runtime/llm', { body: { mode } })
  if (error) throw error
  if (!data) throw new Error('The API returned no updated runtime model settings.')
  return data
}
