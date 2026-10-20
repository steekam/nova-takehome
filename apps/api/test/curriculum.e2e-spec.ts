import { BadRequestException, ForbiddenException, ConflictException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasValidReturnComment, type ApiPrincipal, type CurriculumOutcomeDto, type LessonPlanContent } from '@nova/shared'
import { LessonPlanContentSchema } from '@nova/shared'
import { assertCanReadPlan, assertTeacherOwns, citationsWithinCandidateSet, formatLessonPlanSchemaIssues, planDurationMatches, transitionPlanStatus, validatePlanQa, validateReviewComment } from '../src/curriculum/curriculum.service'
import { createEmbeddingEncoder, EmbeddingError, embeddingCacheKey, retryEmbeddingOperation } from '../src/curriculum/embedding.adapter'
import { LessonPlanGenerator, validateGeneratedPlan } from '../src/curriculum/lesson-plan-generator'
import { OpenAiCompatibleLessonPlanProvider } from '../src/curriculum/llm-provider'
import { parseRequest } from '../src/curriculum/curriculum.controller'
import { validateEnvironment } from '../src/configuration'
import { z } from 'zod'

const teacher: ApiPrincipal = { subject: 'teacher-1', roles: ['teacher'], permissions: [] }
const lead: ApiPrincipal = { subject: 'lead-1', roles: ['curriculum_lead'], permissions: [] }
const outcome: CurriculumOutcomeDto = {
  id: '00000000-0000-4000-8000-000000000001', targetId: '00000000-0000-4000-8000-000000000002',
  title: 'Changes of state', subject: 'Science', grade: 'Primary 5', content: 'Explain changes of state in water.',
}
const plan: LessonPlanContent = {
  title: 'Water changes state', subject: 'Science', grade: 'Primary 5', learningOutcome: outcome.content,
  durationMinutes: 40, objectives: ['Explain the change'], materials: ['Water'], starter: 'Observe water.',
  activities: [{ title: 'Practice', description: outcome.content, durationMinutes: 40 }],
  checkForUnderstanding: 'Explain the change.', sources: [{ documentId: outcome.id, chunkId: outcome.targetId }],
}

describe('curriculum workflow invariants', () => {
  it('allows separate generator and reviewer model names while supporting the legacy model fallback', () => {
    const config = validateEnvironment({
      NODE_ENV: 'test', LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: 'http://localhost:4000/v1',
      LLM_GENERATOR_MODEL: 'lesson-generator', LLM_REVIEWER_MODEL: 'lesson-reviewer', EMBEDDING_PROVIDER: 'mock',
    })
    expect(config.LLM_GENERATOR_MODEL).toBe('lesson-generator')
    expect(config.LLM_REVIEWER_MODEL).toBe('lesson-reviewer')
    const legacy = validateEnvironment({
      NODE_ENV: 'test', LLM_PROVIDER: 'openai-compatible', LLM_BASE_URL: 'http://localhost:4000/v1',
      LLM_MODEL: 'legacy-model', EMBEDDING_PROVIDER: 'mock',
    })
    expect(legacy.LLM_GENERATOR_MODEL).toBe('legacy-model')
    expect(legacy.LLM_REVIEWER_MODEL).toBe('legacy-model')
  })

  it('returns field-level guidance for invalid workflow requests', () => {
    try {
      parseRequest(z.object({ targetId: z.string().uuid(), durationMinutes: z.number().int().positive() }), { targetId: 'bad', durationMinutes: 0 })
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
    expect(validateReviewComment('returned', 'Add more learner practice')).toBe('Add more learner practice')
    expect(validateReviewComment('published')).toBeUndefined()
  })

  it('allows teachers to read published plans and leads to read submitted plans', () => {
    expect(() => assertCanReadPlan('teacher-2', 'published', teacher)).not.toThrow()
    expect(() => assertCanReadPlan('teacher-2', 'submitted', lead)).not.toThrow()
    expect(() => assertCanReadPlan('teacher-2', 'draft', lead)).toThrow(ForbiddenException)
    expect(() => assertCanReadPlan('teacher-2', 'returned', teacher)).toThrow(ForbiddenException)
  })

  it('validates lesson structure, time totals, and source grounding', () => {
    expect(() => validateGeneratedPlan(LessonPlanContentSchema.parse(plan), outcome, [outcome], 40)).not.toThrow()
    const relatedOutcome = { ...outcome, id: '00000000-0000-4000-8000-000000000010', targetId: '00000000-0000-4000-8000-000000000011' }
    expect(() => validateGeneratedPlan(LessonPlanContentSchema.parse(plan), outcome, [outcome, relatedOutcome], 40)).not.toThrow()
    const badDuration = { ...plan, activities: [{ ...plan.activities[0], durationMinutes: 39 }] }
    expect(planDurationMatches(badDuration)).toBe(false)
    expect(() => validateGeneratedPlan(badDuration, outcome, [outcome], 40)).toThrow()
    try {
      validatePlanQa(badDuration, true, true)
      throw new Error('Expected submission QA to reject the plan')
    } catch (error) {
      expect(error).toHaveProperty('status', 422)
      expect((error as { getResponse(): { code: string } }).getResponse().code).toBe('LESSON_PLAN_QA_FAILED')
    }
    expect(() => validateGeneratedPlan({ ...plan, sources: [{ documentId: outcome.id, chunkId: '00000000-0000-4000-8000-000000000003' }] }, outcome, [outcome], 40)).toThrow()
    expect(() => validateGeneratedPlan({ ...plan, sources: [{ documentId: relatedOutcome.id, chunkId: relatedOutcome.targetId }] }, outcome, [outcome, relatedOutcome], 40)).toThrow()
    expect(citationsWithinCandidateSet(plan.sources, plan.sources)).toBe(true)
    expect(citationsWithinCandidateSet([{ documentId: outcome.id, chunkId: '00000000-0000-4000-8000-000000000003' }], plan.sources)).toBe(false)
  })

  it('returns field paths and corrections for malformed lesson content', () => {
    const result = LessonPlanContentSchema.safeParse({ ...plan, starter: '' })
    if (result.success) throw new Error('Expected invalid lesson content')
    expect(formatLessonPlanSchemaIssues(result.error.issues)).toContainEqual({ field: 'starter', message: 'Too small: expected string to have >=1 characters' })
  })

  it('routes generation through its configured model alias', async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requestBody = JSON.parse(init?.body as string) as Record<string, unknown>
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }), { status: 200 })
    })
    const provider = new OpenAiCompatibleLessonPlanProvider({ get: (key: string) => key === 'LLM_BASE_URL' ? 'http://localhost:4000/v1' : key === 'LLM_GENERATOR_MODEL' ? 'lesson-generator-test' : undefined } as ConfigService)
    try {
      await provider.complete({ system: 'Return JSON.', user: '{}' })
      expect(requestBody?.model).toBe('lesson-generator-test')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('repairs invalid provider output once and accepts a corrected plan', async () => {
    const invalid = { ...plan, durationMinutes: 35 }
    const requests: RequestInit[] = []
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requests.push(init ?? {})
      const content = requests.length === 1 ? invalid : plan
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 })
    })
    const generator = new LessonPlanGenerator(new OpenAiCompatibleLessonPlanProvider(providerConfig() as ConfigService))
    try {
      await expect(generator.generate(outcome, [outcome], 40)).resolves.toEqual(plan)
      expect(requests).toHaveLength(2)
      const secondBody = JSON.parse(requests[1].body as string) as { messages: { content: string }[] }
      expect(secondBody.messages.at(-1)?.content).toContain('durationMinutes must match')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('returns a stable provider error after one failed correction', async () => {
    const invalid = { ...plan, durationMinutes: 35 }
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalid) } }] }), { status: 200 },
    ))
    const generator = new LessonPlanGenerator(new OpenAiCompatibleLessonPlanProvider(providerConfig() as ConfigService))
    try {
      await expect(generator.generate(outcome, [outcome], 40)).rejects.toMatchObject({
        status: 503,
        response: {
          code: 'LLM_INVALID_RESPONSE',
          message: expect.stringContaining('No draft was saved'),
        },
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('retries a transient provider failure once and does not retry authentication failures', async () => {
    const provider = new OpenAiCompatibleLessonPlanProvider(providerConfig() as ConfigService)
    const request = { system: 'Return JSON.', user: '{}' }
    const networkFailure = jest.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => { throw new TypeError('network unavailable') })
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }))
    try {
      await expect(provider.complete(request)).resolves.toBe('{"ok":true}')
      expect(networkFailure).toHaveBeenCalledTimes(2)
    } finally {
      networkFailure.mockRestore()
    }

    const authFailure = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))
    try {
      await expect(provider.complete(request)).rejects.toMatchObject({
        response: { code: 'LLM_PROVIDER_AUTH_FAILED' },
      })
      expect(authFailure).toHaveBeenCalledTimes(1)
    } finally {
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
      if (attempts === 1) throw new EmbeddingError('EMBEDDING_MODEL_LOAD_FAILED', 'Try again.', true)
      return [1]
    })
    expect(result).toEqual([1])
    expect(attempts).toBe(2)
  })
})

function mockEmbeddingSettings() {
  return { provider: 'mock' as const, model: 'mock-hash-v1', revision: 'v1', dimensions: 384, cacheEnabled: true,
    vectorCacheDir: '.cache/test-vectors', modelCacheDir: '.cache/test-models' }
}

function providerConfig() {
  const values: Record<string, string> = {
    LLM_PROVIDER: 'openai-compatible',
    LLM_BASE_URL: 'http://localhost:4000/v1',
    LLM_MODEL: 'lesson-planner',
  }
  return { get: (key: string, fallback?: string) => values[key] ?? fallback }
}
