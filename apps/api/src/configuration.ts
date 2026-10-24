import { z } from 'zod'
import { normalizeOrigin } from './common/security/upstream/cross-origin.util'

const EnvironmentSchema = z
  .object({
    CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    LLM_PROVIDER: z.enum(['mock', 'openai-compatible']).default('mock'),
    LLM_BASE_URL: z.string().url().optional(),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().min(1).optional(),
    LLM_GENERATOR_MODEL: z.string().min(1).optional(),
    LLM_REVIEWER_MODEL: z.string().min(1).optional(),
    LLM_REVIEW_TIMEOUT_MS: z.coerce.number().int().min(20_000).max(180_000).default(90_000),
    EMBEDDING_PROVIDER: z.enum(['local', 'mock']).default('local'),
    EMBEDDING_MODEL: z.string().min(1).default('Xenova/bge-small-en-v1.5'),
    EMBEDDING_MODEL_REVISION: z.string().min(1).default('main'),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(384),
    EMBEDDING_CACHE_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    EMBEDDING_CACHE_DIR: z.string().default('.cache/embeddings'),
    TRANSFORMERS_CACHE_DIR: z.string().default('.cache/transformers'),
  })
  .superRefine((env, context) => {
    for (const origin of env.CORS_ORIGIN.split(',')) {
      try {
        const normalized = normalizeOrigin(origin.trim(), 'CORS_ORIGIN')
        if (!['http:', 'https:'].includes(new URL(normalized).protocol))
          throw new Error('Only HTTP and HTTPS origins are supported')
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ORIGIN'],
          message: 'Use comma-separated HTTP(S) origins without paths or wildcards',
        })
      }
    }
    if (env.EMBEDDING_DIMENSIONS !== 384)
      context.addIssue({
        code: 'custom',
        path: ['EMBEDDING_DIMENSIONS'],
        message: 'BGE-small requires 384 dimensions',
      })
  })

export function validateEnvironment(environment: Record<string, unknown>) {
  if (environment.NODE_ENV === 'production' && !environment.CORS_ORIGIN)
    throw new Error('CORS_ORIGIN must explicitly list trusted browser origins in production')
  const input = {
    ...environment,
    EMBEDDING_PROVIDER:
      environment.EMBEDDING_PROVIDER ?? (environment.NODE_ENV === 'test' ? 'mock' : 'local'),
  }
  const result = EnvironmentSchema.safeParse(input)
  if (!result.success)
    throw new Error(
      `Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    )
  return {
    ...environment,
    ...result.data,
    LLM_GENERATOR_MODEL: result.data.LLM_GENERATOR_MODEL ?? result.data.LLM_MODEL,
    LLM_REVIEWER_MODEL:
      result.data.LLM_REVIEWER_MODEL ?? result.data.LLM_GENERATOR_MODEL ?? result.data.LLM_MODEL,
  }
}
