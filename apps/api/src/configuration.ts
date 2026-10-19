import { z } from 'zod'

const EnvironmentSchema = z.object({
  LLM_PROVIDER: z.enum(['mock', 'openai-compatible']).default('mock'),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().min(1).optional(),
  EMBEDDING_PROVIDER: z.enum(['local', 'mock']).default('local'),
  EMBEDDING_MODEL: z.string().min(1).default('Xenova/bge-small-en-v1.5'),
  EMBEDDING_MODEL_REVISION: z.string().min(1).default('main'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(384),
  EMBEDDING_CACHE_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  EMBEDDING_CACHE_DIR: z.string().default('.cache/embeddings'),
  TRANSFORMERS_CACHE_DIR: z.string().default('.cache/transformers'),
}).superRefine((env, context) => {
  if (env.LLM_PROVIDER === 'openai-compatible') {
    if (!env.LLM_BASE_URL) context.addIssue({ code: 'custom', path: ['LLM_BASE_URL'], message: 'Required for openai-compatible provider' })
    if (!env.LLM_MODEL) context.addIssue({ code: 'custom', path: ['LLM_MODEL'], message: 'Required for openai-compatible provider' })
  }
  if (env.EMBEDDING_DIMENSIONS !== 384) context.addIssue({ code: 'custom', path: ['EMBEDDING_DIMENSIONS'], message: 'BGE-small requires 384 dimensions' })
})

export function validateEnvironment(environment: Record<string, unknown>) {
  const input = { ...environment, EMBEDDING_PROVIDER: environment.EMBEDDING_PROVIDER ?? (environment.NODE_ENV === 'test' ? 'mock' : 'local') }
  const result = EnvironmentSchema.safeParse(input)
  if (!result.success) throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  return { ...environment, ...result.data }
}
