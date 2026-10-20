import { z } from 'zod'

export const LlmModeSchema = z.enum(['mock', 'live'])
export const RuntimeLlmModeRequestSchema = z.object({ mode: LlmModeSchema }).strict()
export const RuntimeLlmModeStatusSchema = z.object({
  mode: LlmModeSchema,
  liveAvailable: z.boolean(),
  missing: z.array(z.string()),
}).strict()

export type LlmMode = z.infer<typeof LlmModeSchema>
export type RuntimeLlmModeStatus = z.infer<typeof RuntimeLlmModeStatusSchema>
