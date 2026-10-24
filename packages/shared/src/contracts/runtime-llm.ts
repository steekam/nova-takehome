import { z } from 'zod'

export const LlmModeSchema = z.enum(['mock', 'live'])
export const LlmMockScenarioSchema = z.enum(['happy_path', 'invalid_output', 'connection_failure'])
export const RuntimeLlmModeRequestSchema = z
  .object({ mode: LlmModeSchema, mockScenario: LlmMockScenarioSchema.optional() })
  .strict()
export const RuntimeLlmModeStatusSchema = z
  .object({
    mode: LlmModeSchema,
    mockScenario: LlmMockScenarioSchema,
    liveAvailable: z.boolean(),
    missing: z.array(z.string()),
  })
  .strict()

export type LlmMode = z.infer<typeof LlmModeSchema>
export type LlmMockScenario = z.infer<typeof LlmMockScenarioSchema>
export type RuntimeLlmModeStatus = z.infer<typeof RuntimeLlmModeStatusSchema>
