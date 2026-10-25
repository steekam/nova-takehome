import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  hasValidReturnComment,
  permissionsForRoles,
  type ApiPrincipal,
  type CurriculumOutcomeDto,
  type CurriculumSourceDto,
  type LessonPlanContent,
} from '@nova/shared'
import { LessonPlanContentSchema } from '@nova/shared'
import {
  assertCanReadPlan,
  assertTeacherOwns,
  citationsWithinCandidateSet,
  formatLessonPlanSchemaIssues,
  planDurationMatches,
  transitionPlanStatus,
  validatePlanQa,
  validateReviewComment,
} from '../src/lesson-planning/lesson-planning.service'
import {
  createEmbeddingEncoder,
  EmbeddingError,
  embeddingCacheKey,
  retryEmbeddingOperation,
} from '../src/embeddings/embedding.adapter'
import {
  LessonPlanGenerator,
  validateGeneratedPlan,
} from '../src/lesson-planning/llm-workflows/lesson-plan-generator'
import { OpenAiCompatibleLessonPlanProvider } from '../src/lesson-planning/llm-workflows/llm-provider'
import { LangfusePrompts } from '../src/lesson-planning/llm-workflows/langfuse-prompts'
import { MockLessonPlanProvider } from '../src/lesson-planning/llm-workflows/mock-lesson-plan-provider'
import { RuntimeLessonPlanProvider } from '../src/lesson-planning/llm-workflows/runtime-lesson-plan-provider'
import { RequestIdService } from '../src/common/request-id.service'
import * as generationTelemetry from '../src/lesson-planning/llm-workflows/generation-telemetry'
import { StandardSchemaPipe } from '../src/common/validation/standard-schema.pipe'
import { validateEnvironment } from '../src/configuration'
import { z } from 'zod'

const teacher: ApiPrincipal = {
  subject: 'teacher-1',
  roles: ['teacher'],
  permissions: permissionsForRoles(['teacher']),
}
const lead: ApiPrincipal = {
  subject: 'lead-1',
  roles: ['curriculum_lead'],
  permissions: permissionsForRoles(['curriculum_lead']),
}
const outcome: CurriculumOutcomeDto = {
  id: '00000000-0000-4000-8000-000000000001',
  designVersionId: '00000000-0000-4000-8000-000000000004',
  offeringId: '00000000-0000-4000-8000-000000000005',
  kind: 'specific_learning_outcome',
  title: 'Changes of state',
  subject: 'Science',
  grade: 'Primary 5',
  programme: 'Primary',
  framework: 'CBC',
  editionLabel: 'April 2024',
  locator: 'Strand 1 / Outcome 1',
  content: 'Explain changes of state in water.',
  sourceCount: 1,
  generationReady: true,
}
const source: CurriculumSourceDto = {
  linkId: '00000000-0000-4000-8000-000000000006',
  documentId: '00000000-0000-4000-8000-000000000007',
  resourceRevisionId: '00000000-0000-4000-8000-000000000008',
  revisionNumber: 1,
  chunkId: '00000000-0000-4000-8000-000000000002',
  resourceType: 'curriculum_design',
  title: 'Changes of state excerpt',
  subject: 'Science',
  grade: 'Primary 5',
  content: 'Official excerpt defining the selected target.',
  authority: 'official',
  editionLabel: 'April 2024',
  sourceUrl: 'https://example.test/cbc',
  locator: 'Page 3',
  sourceLocator: null,
  resourceMetadata: {},
  synthetic: false,
  role: 'defines_target',
  status: 'published',
}
const plan: LessonPlanContent = {
  title: 'Water changes state',
  subject: 'Science',
  grade: 'Primary 5',
  learningOutcome: outcome.content,
  durationMinutes: 40,
  objectives: ['Explain the change'],
  materials: ['Water'],
  starter: 'Observe water.',
  activities: [{ title: 'Practice', description: outcome.content, durationMinutes: 40 }],
  checkForUnderstanding: 'Explain the change.',
  sources: [{ documentId: source.documentId, chunkId: source.chunkId }],
}

describe('curriculum workflow invariants', () => {
  it('allows separate generator and reviewer model names while supporting the legacy model fallback', () => {
    const config = validateEnvironment({
      NODE_ENV: 'test',
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://localhost:4000/v1',
      LLM_GENERATOR_MODEL: 'lesson-generator',
      LLM_REVIEWER_MODEL: 'lesson-reviewer',
      EMBEDDING_PROVIDER: 'mock',
    })
    expect(config.LLM_GENERATOR_MODEL).toBe('lesson-generator')
    expect(config.LLM_REVIEWER_MODEL).toBe('lesson-reviewer')
    expect(config.LLM_REVIEW_TIMEOUT_MS).toBe(90_000)
    const legacy = validateEnvironment({
      NODE_ENV: 'test',
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://localhost:4000/v1',
      LLM_MODEL: 'legacy-model',
      EMBEDDING_PROVIDER: 'mock',
    })
    expect(legacy.LLM_GENERATOR_MODEL).toBe('legacy-model')
    expect(legacy.LLM_REVIEWER_MODEL).toBe('legacy-model')
    expect(
      validateEnvironment({ NODE_ENV: 'test', LLM_REVIEW_TIMEOUT_MS: '60000' })
        .LLM_REVIEW_TIMEOUT_MS,
    ).toBe(60_000)
  })

  it('returns field-level guidance for invalid workflow requests', async () => {
    try {
      await new StandardSchemaPipe(
        z.object({ targetId: z.string().uuid(), durationMinutes: z.number().int().positive() }),
      ).transform({ targetId: 'bad', durationMinutes: 0 })
      throw new Error('Expected invalid request to fail')
    } catch (error) {
      expect(error).toHaveProperty('status', 400)
      expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Correct the listed request fields and try again.',
        errors: [
          { field: 'targetId', constraints: [expect.any(String)] },
          { field: 'durationMinutes', constraints: [expect.any(String)] },
        ],
      })
    }
  })

  it('enforces teacher ownership and role', () => {
    expect(() => assertTeacherOwns('teacher-1', teacher)).not.toThrow()
    expect(() => assertTeacherOwns('teacher-2', teacher)).toThrow(ForbiddenException)
    expect(() => assertTeacherOwns('teacher-1', lead)).toThrow(ForbiddenException)
  })

  it('allows only valid plan state transitions', () => {
    expect(transitionPlanStatus('draft', 'submit')).toBe('submitted')
    expect(transitionPlanStatus('submitted', 'returned')).toBe('returned')
    expect(transitionPlanStatus('submitted', 'published')).toBe('published')
    expect(transitionPlanStatus('returned', 'edit')).toBe('draft')
    expect(() => transitionPlanStatus('returned', 'submit')).toThrow(ConflictException)
    expect(() => transitionPlanStatus('draft', 'published')).toThrow(ConflictException)
    expect(() => transitionPlanStatus('published', 'edit')).toThrow(ConflictException)
    expect(() => transitionPlanStatus('published', 'submit')).toThrow(ConflictException)
    try {
      transitionPlanStatus('submitted', 'edit')
      throw new Error('Expected in-review edit to be rejected')
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'PLAN_TRANSITION_INVALID',
        message: 'This lesson plan is under review. Wait for the curriculum lead before editing.',
      })
    }
  })

  it('requires a useful comment when returning a plan', () => {
    expect(hasValidReturnComment('a b c d')).toBe(false)
    expect(hasValidReturnComment('add a check')).toBe(true)
    try {
      validateReviewComment('returned', ' fix ')
      throw new Error('Expected a short return reason to be rejected')
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'REVIEW_COMMENT_REQUIRED',
        message: 'Add an actionable return reason with at least eight non-space characters.',
      })
    }
    expect(() => validateReviewComment('returned', 'a b c d')).toThrow()
    expect(validateReviewComment('returned', 'Add more learner practice')).toBe(
      'Add more learner practice',
    )
    expect(validateReviewComment('published')).toBeUndefined()
  })

  it('allows teachers to read published plans and leads to read submitted plans', () => {
    expect(() => assertCanReadPlan('teacher-2', 'published', teacher)).not.toThrow()
    expect(() => assertCanReadPlan('teacher-2', 'submitted', lead)).not.toThrow()
    expect(() => assertCanReadPlan('teacher-2', 'draft', lead)).toThrow(ForbiddenException)
    expect(() => assertCanReadPlan('teacher-2', 'returned', teacher)).toThrow(ForbiddenException)
  })

  it('validates lesson structure, time totals, and source grounding', () => {
    expect(() =>
      validateGeneratedPlan(LessonPlanContentSchema.parse(plan), outcome, [source], 40),
    ).not.toThrow()
    const relatedSource: CurriculumSourceDto = {
      ...source,
      documentId: '00000000-0000-4000-8000-000000000010',
      chunkId: '00000000-0000-4000-8000-000000000011',
      role: 'teaching_support',
      resourceType: 'teaching_note',
      authority: 'school',
    }
    expect(() =>
      validateGeneratedPlan(
        LessonPlanContentSchema.parse(plan),
        outcome,
        [source, relatedSource],
        40,
      ),
    ).not.toThrow()
    const badDuration = { ...plan, activities: [{ ...plan.activities[0], durationMinutes: 39 }] }
    expect(planDurationMatches(badDuration)).toBe(false)
    expect(() => validateGeneratedPlan(badDuration, outcome, [source], 40)).not.toThrow()
    expect(() => validatePlanQa(badDuration, true, true)).not.toThrow()
    expect(() =>
      validateGeneratedPlan(
        {
          ...plan,
          sources: [
            { documentId: source.documentId, chunkId: '00000000-0000-4000-8000-000000000003' },
          ],
        },
        outcome,
        [source],
        40,
      ),
    ).toThrow()
    expect(() =>
      validateGeneratedPlan(
        {
          ...plan,
          sources: [{ documentId: relatedSource.documentId, chunkId: relatedSource.chunkId }],
        },
        outcome,
        [source, relatedSource],
        40,
      ),
    ).toThrow()
    expect(
      citationsWithinCandidateSet(plan.sources, [
        ...plan.sources,
        { documentId: relatedSource.documentId, chunkId: relatedSource.chunkId },
      ]),
    ).toBe(true)
    expect(
      citationsWithinCandidateSet(
        [{ documentId: outcome.id, chunkId: '00000000-0000-4000-8000-000000000003' }],
        plan.sources,
      ),
    ).toBe(false)
  })

  it('returns field paths and corrections for malformed lesson content', () => {
    const result = LessonPlanContentSchema.safeParse({ ...plan, starter: '' })
    if (result.success) throw new Error('Expected invalid lesson content')
    expect(formatLessonPlanSchemaIssues(result.error.issues)).toContainEqual({
      field: 'starter',
      message: 'Too small: expected string to have >=1 characters',
    })
  })

  it('routes generation through its configured model alias', async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requestBody = JSON.parse(init?.body as string) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          model: 'provider-response-model',
          choices: [{ message: { content: JSON.stringify(plan) } }],
          usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
        }),
        { status: 200, headers: { 'x-litellm-response-cost': '0.0004' } },
      )
    })
    const provider = new OpenAiCompatibleLessonPlanProvider(
      {
        get: (key: string) =>
          key === 'LLM_BASE_URL'
            ? 'http://localhost:4000/v1'
            : key === 'LLM_GENERATOR_MODEL'
              ? 'lesson-generator-test'
              : undefined,
      } as ConfigService,
      new RequestIdService(),
    )
    try {
      const result = await provider.complete({ system: 'Return JSON.', user: '{}' })
      expect(requestBody?.model).toBe('lesson-generator-test')
      expect(result).toMatchObject({
        content: JSON.stringify(plan),
        provider: 'openai-compatible',
        model: 'lesson-generator-test',
        responseModel: 'provider-response-model',
        usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
        reportedCostUsd: 0.0004,
        providerAttempts: 1,
      })
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('exercises mock success, invalid output, and provider unavailability', async () => {
    const config = {
      get: (key: string, fallback?: string) => (key === 'LLM_PROVIDER' ? 'mock' : fallback),
    } as ConfigService
    const runtime = new RuntimeLessonPlanProvider(
      config,
      new OpenAiCompatibleLessonPlanProvider(config, new RequestIdService()),
      new MockLessonPlanProvider(),
    )
    const generator = new LessonPlanGenerator(runtime, new LangfusePrompts(config))

    expect(runtime.status()).toMatchObject({ mode: 'mock', mockScenario: 'happy_path' })
    await expect(generator.generate(outcome, [source], 40)).resolves.toMatchObject({
      durationMinutes: 40,
      sources: [{ documentId: source.documentId, chunkId: source.chunkId }],
    })

    runtime.setMode('mock', 'invalid_output')
    await expect(generator.generate(outcome, [source], 40)).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'LLM_INVALID_RESPONSE',
        message: expect.stringContaining('No draft was saved'),
      },
    })

    runtime.setMode('mock', 'connection_failure')
    await expect(generator.generate(outcome, [source], 40)).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'LLM_PROVIDER_UNAVAILABLE',
        message: expect.stringContaining('No draft was saved'),
      },
    })
  })

  it('repairs invalid provider output once and accepts a corrected plan', async () => {
    const invalid = { ...plan, durationMinutes: 35 }
    const requests: RequestInit[] = []
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requests.push(init ?? {})
      const content = requests.length === 1 ? invalid : plan
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
        { status: 200 },
      )
    })
    const validationMetrics = jest.spyOn(generationTelemetry, 'recordGenerationValidation')
    const config = providerConfig() as ConfigService
    const generator = new LessonPlanGenerator(
      new OpenAiCompatibleLessonPlanProvider(config, new RequestIdService()),
      new LangfusePrompts(config),
    )
    try {
      await expect(generator.generate(outcome, [source], 40)).resolves.toEqual(plan)
      expect(requests).toHaveLength(2)
      const secondBody = JSON.parse(requests[1].body as string) as {
        messages: { content: string }[]
      }
      expect(secondBody.messages.at(-1)?.content).toContain('durationMinutes must match')
      expect(secondBody.messages.at(-1)?.content).toContain('Prior response')
      expect(secondBody.messages.at(-1)?.content).toContain(JSON.stringify(invalid))
      expect(validationMetrics).toHaveBeenCalledWith({
        provider: 'openai-compatible',
        checkCode: 'OUTPUT_SCHEMA',
        status: 'passed',
      })
    } finally {
      validationMetrics.mockRestore()
      fetchMock.mockRestore()
    }
  })

  it('returns a stable provider error after one failed correction', async () => {
    const invalid = { ...plan, durationMinutes: 35 }
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalid) } }] }),
            { status: 200 },
          ),
      )
    const generationMetric = jest.spyOn(generationTelemetry, 'recordGeneration')
    const config = providerConfig() as ConfigService
    const generator = new LessonPlanGenerator(
      new OpenAiCompatibleLessonPlanProvider(config, new RequestIdService()),
      new LangfusePrompts(config),
    )
    try {
      await expect(generator.generate(outcome, [source], 40)).rejects.toMatchObject({
        status: 503,
        response: {
          code: 'LLM_INVALID_RESPONSE',
          message: expect.stringContaining('No draft was saved'),
        },
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(generationMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai-compatible',
          providerAttempts: 2,
          repairAttempts: 1,
        }),
      )
    } finally {
      generationMetric.mockRestore()
      fetchMock.mockRestore()
    }
  })

  it('retries a transient provider failure once and does not retry authentication failures', async () => {
    const config = providerConfig() as ConfigService
    const provider = new OpenAiCompatibleLessonPlanProvider(config, new RequestIdService())
    const request = { system: 'Return JSON.', user: '{}' }
    const networkFailure = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => {
        throw new TypeError('network unavailable')
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
          status: 200,
        }),
      )
    try {
      await expect(provider.complete(request)).resolves.toMatchObject({
        content: '{"ok":true}',
        providerAttempts: 2,
      })
      expect(networkFailure).toHaveBeenCalledTimes(2)
    } finally {
      networkFailure.mockRestore()
    }

    const authFailure = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 401 }))
    const generationMetric = jest.spyOn(generationTelemetry, 'recordGeneration')
    try {
      await expect(provider.complete(request)).rejects.toMatchObject({
        provider: 'openai-compatible',
        providerAttempts: 1,
        response: { code: 'LLM_PROVIDER_AUTH_FAILED' },
      })
      expect(authFailure).toHaveBeenCalledTimes(1)
      const generator = new LessonPlanGenerator(provider, new LangfusePrompts(config))
      await expect(generator.generate(outcome, [source], 40)).rejects.toMatchObject({
        response: { code: 'LLM_PROVIDER_AUTH_FAILED' },
      })
      expect(generationMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai-compatible',
          outcome: 'provider_error',
          providerAttempts: 1,
        }),
      )
      expect(authFailure).toHaveBeenCalledTimes(2)
    } finally {
      generationMetric.mockRestore()
      authFailure.mockRestore()
    }
  })

  it('produces stable normalized mock embeddings with a distinct query prefix', async () => {
    const embed = createEmbeddingEncoder(mockEmbeddingSettings())
    const query = await embed('query', 'changes of state')
    expect(query).toEqual(await embed('query', 'changes of state'))
    expect(query).not.toEqual(await embed('document', 'changes of state'))
    expect(Math.hypot(...query)).toBeCloseTo(1)
  })

  it('persists content-addressed vectors under the vector cache directory', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'nova-embedding-cache-'))
    const settings = { ...mockEmbeddingSettings(), vectorCacheDir: cacheDir }
    const text = 'cached CBC document'
    try {
      const vector = await createEmbeddingEncoder(settings)('document', text)
      const file = join(cacheDir, `${embeddingCacheKey(settings, 'document', text)}.json`)
      const cached = JSON.parse(await readFile(file, 'utf8')) as { vector: number[] }
      expect(cached.vector).toEqual(vector)
      expect(cached.vector).toHaveLength(384)
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('retries one classified transient embedding failure', async () => {
    let attempts = 0
    const result = await retryEmbeddingOperation(async () => {
      attempts += 1
      if (attempts === 1)
        throw new EmbeddingError('EMBEDDING_MODEL_LOAD_FAILED', 'Try again.', true)
      return [1]
    })
    expect(result).toEqual([1])
    expect(attempts).toBe(2)
  })
})

function mockEmbeddingSettings() {
  return {
    provider: 'mock' as const,
    model: 'mock-hash-v1',
    revision: 'v1',
    dimensions: 384,
    cacheEnabled: true,
    vectorCacheDir: '.cache/test-vectors',
    modelCacheDir: '.cache/test-models',
  }
}

function providerConfig() {
  const values: Record<string, string> = {
    LLM_PROVIDER: 'openai-compatible',
    LLM_BASE_URL: 'http://localhost:4000/v1',
    LLM_MODEL: 'lesson-planner',
  }
  return { get: (key: string, fallback?: string) => values[key] ?? fallback }
}
