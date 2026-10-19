import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chunks, getFixture } from './corpus.js'
import type { FixtureId } from './corpus.js'
import type { Candidate, RunReport } from './domain.js'
import { retrieve } from './embedding.js'
import { outputSchemaFor } from './prompt.js'
import { buildGenerationPrompt, resolveGenerationPrompt } from './langfuse-prompts.js'
import type { ResolvedGenerationPrompt } from './langfuse-prompts.js'
import { lessonTiming } from './prompt.js'
import { generate, ProviderError } from './provider.js'
import { verify } from './verify.js'
import { estimateCost, mergeUsage } from './pricing.js'
import { reportVerificationScore, withSpan } from './telemetry.js'
import { PlaygroundError } from './failure-report.js'

const basetenCandidates = (): Candidate[] => [
  { id: 'baseten-deepseek-v4.1-flash', provider: 'baseten', model: process.env.BASETEN_DEEPSEEK_MODEL ?? 'deepseek-ai/DeepSeek-V4.1-Flash', displayName: 'Baseten DeepSeek V4.1 Flash' },
  { id: 'baseten-glm-5.3-flash', provider: 'baseten', model: process.env.BASETEN_GLM_MODEL ?? 'zai-org/GLM-5.3-Flash', displayName: 'Baseten GLM 5.3 Flash' },
]

const litellmCandidates = (): Candidate[] => [
  { id: 'litellm-deepseek-v4.1-flash', provider: 'litellm', model: process.env.LITELLM_MODEL ?? 'lesson-planner', displayName: 'DeepSeek V4.1 Flash via LiteLLM' },
  { id: 'litellm-glm-5.3-flash', provider: 'litellm', model: process.env.LITELLM_GLM_MODEL ?? 'lesson-planner-glm', displayName: 'GLM 5.3 Flash via LiteLLM' },
]

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1))
    throw new Error('Response was not valid JSON.')
  }
}

async function runCandidate(candidate: Candidate, sourceChunks: typeof chunks, allowedIds: string[], generationPrompt: ResolvedGenerationPrompt, metadata: { runId: string; fixtureId: string; targetId: string; route: string; durationMinutes: number }) {
  const attempts: RunReport['candidates'][number]['attempts'] = []
  const start = Date.now()
  const outputSchemaHash = createHash('sha256').update(JSON.stringify(outputSchemaFor(sourceChunks))).digest('hex')
  let repairErrors: string[] = []
  let usage: RunReport['candidates'][number]['usage']
  let verification: RunReport['candidates'][number]['verification']
  let content: RunReport['candidates'][number]['content']
  let reportedCostUsd = 0
  let hasReportedCost = false
  for (let number = 1; number <= 2; number += 1) {
    const prompt = buildGenerationPrompt(generationPrompt, sourceChunks, repairErrors, metadata.durationMinutes)
    const attemptStart = Date.now()
    try {
      const generation = await withSpan('playground.llm.generate', {
        'llm.provider': candidate.provider,
        'llm.model': candidate.model,
        'langfuse.observation.type': 'generation',
        'playground.run_id': metadata.runId,
        'playground.fixture_id': metadata.fixtureId,
        'playground.target_id': metadata.targetId,
        'playground.route': metadata.route,
        'playground.candidate.id': candidate.id,
        'playground.attempt': number,
        'playground.duration_minutes': metadata.durationMinutes,
      }, async (span) => {
        span.setAttribute('gen_ai.operation.name', 'chat')
        span.setAttribute('gen_ai.provider.name', candidate.provider)
        span.setAttribute('gen_ai.request.model', candidate.model)
        span.setAttribute('langfuse.observation.metadata.run_id', metadata.runId)
        span.setAttribute('langfuse.observation.metadata.fixture_id', metadata.fixtureId)
        span.setAttribute('langfuse.observation.metadata.target_id', metadata.targetId)
        span.setAttribute('langfuse.observation.metadata.duration_minutes', metadata.durationMinutes)
        span.setAttribute('langfuse.observation.metadata.output_schema_sha256', outputSchemaHash)
        span.setAttribute('langfuse.observation.metadata.prompt_version', generationPrompt.version)
        span.setAttribute('langfuse.observation.metadata.prompt_source', generationPrompt.source)
        if (generationPrompt.source === 'langfuse') {
          span.setAttribute('langfuse.observation.prompt.name', generationPrompt.name)
          span.setAttribute('langfuse.observation.prompt.version', Number(generationPrompt.version))
        }
        if (process.env.LANGFUSE_CAPTURE_PROMPTS === 'true') {
          span.setAttribute('langfuse.observation.input', prompt)
          span.setAttribute('gen_ai.input.messages', JSON.stringify([{ role: 'user', content: prompt }]))
        }
        const result = await generate(candidate, prompt, allowedIds, {
          name: 'lesson_content',
          schema: outputSchemaFor(sourceChunks),
          durationMinutes: metadata.durationMinutes,
        })
        if (result.usage?.totalTokens !== undefined) span.setAttribute('llm.usage.total_tokens', result.usage.totalTokens)
        if (result.usage?.promptTokens !== undefined) span.setAttribute('gen_ai.usage.input_tokens', result.usage.promptTokens)
        if (result.usage?.completionTokens !== undefined) span.setAttribute('gen_ai.usage.output_tokens', result.usage.completionTokens)
        if (result.usage) {
          span.setAttribute('langfuse.observation.usage_details', JSON.stringify({
            input: result.usage.promptTokens,
            output: result.usage.completionTokens,
            cached_input: result.usage.cachedPromptTokens,
          }))
          const cost = estimateCost(candidate, result.usage)
          if (cost) span.setAttribute('gen_ai.usage.cost', cost.usd)
        }
        if (result.reportedCostUsd !== undefined) span.setAttribute('gen_ai.usage.cost', result.reportedCostUsd)
        if (result.responseModel) span.setAttribute('gen_ai.response.model', result.responseModel)
        if (result.finishReason) span.setAttribute('llm.response.finish_reason', result.finishReason)
        if (process.env.LANGFUSE_CAPTURE_PROMPTS === 'true') {
          span.setAttribute('langfuse.observation.output', result.content)
          span.setAttribute('gen_ai.output.messages', JSON.stringify([{ role: 'assistant', content: result.content }]))
        }
        const context = span.spanContext()
        return {
          result,
          traceId: /^0+$/.test(context.traceId) ? undefined : context.traceId,
          observationId: /^0+$/.test(context.spanId) ? undefined : context.spanId,
        }
      })
      const { result: response, traceId, observationId } = generation
      if (response.reportedCostUsd !== undefined) {
        reportedCostUsd += response.reportedCostUsd
        hasReportedCost = true
      }
      if (response.usage) {
        usage = mergeUsage(usage, response.usage)
      }
      let raw: unknown
      try {
        raw = parseJson(response.content)
      } catch {
        await withSpan('playground.validation', {
          'playground.run_id': metadata.runId,
          'playground.fixture_id': metadata.fixtureId,
          'playground.attempt': number,
          'playground.validation.stage': 'generation',
          'playground.validation.passed': false,
          'playground.validation.check_count': 1,
          'playground.validation.failed_check_count': 1,
          'playground.validation.failed_codes': 'OUTPUT_SCHEMA_INVALID',
        }, async () => undefined)
        repairErrors = [response.finishReason === 'length'
          ? 'Your previous response reached the token limit. Return a concise, complete JSON object with every required field and no extra explanation.'
          : 'Return one valid JSON object matching the schema.']
        verification = {
          passed: false,
          checks: [{ code: 'OUTPUT_SCHEMA_INVALID', passed: false, message: 'Response was not valid JSON.' }],
        }
        const langfuseScore = await reportVerificationScore({
          id: randomUUID(), traceId, observationId, passed: false, comment: 'OUTPUT_SCHEMA_INVALID: response was not valid JSON.',
        })
        attempts.push({ number, prompt, rawOutput: response.content, error: 'Response was not valid JSON.', errorCode: 'OUTPUT_SCHEMA_INVALID', finishReason: response.finishReason, responseModel: response.responseModel, usage: response.usage, reportedCostUsd: response.reportedCostUsd, elapsedMs: Date.now() - attemptStart, traceId, observationId, langfuseScore })
        continue
      }

      const checked = await withSpan('playground.validation', {
        'playground.run_id': metadata.runId,
        'playground.fixture_id': metadata.fixtureId,
        'playground.attempt': number,
        'playground.validation.stage': 'generation',
      }, async (span) => {
        const result = verify(raw, sourceChunks, metadata.durationMinutes)
        const failed = result.verification.checks.filter((check) => !check.passed)
        span.setAttributes({
          'playground.validation.passed': result.verification.passed,
          'playground.validation.check_count': result.verification.checks.length,
          'playground.validation.failed_check_count': failed.length,
          'playground.validation.failed_codes': failed.map((check) => check.code).join(','),
        })
        return result
      })
      verification = checked.verification
      content = checked.content
      const failedChecks = checked.verification.checks.filter((check) => !check.passed)
      const errorCode = failedChecks.some((check) => check.code === 'OUTPUT_SCHEMA_INVALID') ? 'OUTPUT_SCHEMA_INVALID' : 'VERIFICATION_FAILED'
      const langfuseScore = await reportVerificationScore({
        id: randomUUID(), traceId, observationId, passed: checked.verification.passed,
        comment: checked.verification.passed ? 'All deterministic verification checks passed.' : failedChecks.map((check) => check.code).join(', '),
      })
      attempts.push({ number, prompt, rawOutput: response.content, error: checked.verification.passed ? undefined : failedChecks.map((check) => check.message).join(' '), errorCode: checked.verification.passed ? undefined : errorCode, finishReason: response.finishReason, responseModel: response.responseModel, usage: response.usage, reportedCostUsd: response.reportedCostUsd, elapsedMs: Date.now() - attemptStart, traceId, observationId, langfuseScore })
      if (checked.verification.passed) break
      repairErrors = checked.verification.checks.filter((check) => !check.passed).map((check) => check.message)
    } catch (error) {
      const providerError = error instanceof ProviderError ? error : new ProviderError('PROVIDER_UNAVAILABLE', 'Unexpected provider error.')
      attempts.push({ number, prompt, error: providerError.message, errorCode: providerError.code, elapsedMs: Date.now() - attemptStart })
      if (!providerError.retryable || number === 2) {
        return {
          candidate, status: providerError.code === 'PROVIDER_AUTH_ERROR' ? 'blocked' as const : 'failed' as const, attempts, usage,
          estimatedCost: estimateCost(candidate, usage),
          reportedCostUsd: hasReportedCost ? Number(reportedCostUsd.toFixed(8)) : undefined,
          elapsedMs: Date.now() - start, errorCode: providerError.code, errorMessage: providerError.message,
        }
      }
    }
  }

  return {
    candidate,
    status: verification?.passed ? 'success' as const : 'failed' as const,
    attempts,
    content,
    verification,
    usage,
    estimatedCost: estimateCost(candidate, usage),
    reportedCostUsd: hasReportedCost ? Number(reportedCostUsd.toFixed(8)) : undefined,
    elapsedMs: Date.now() - start,
    errorCode: verification?.passed ? undefined : verification?.checks.some((check) => !check.passed && check.code === 'OUTPUT_SCHEMA_INVALID') ? 'OUTPUT_SCHEMA_INVALID' : 'VERIFICATION_FAILED',
    errorMessage: verification?.passed ? undefined : 'Output failed deterministic verification after one repair attempt.',
  }
}

function mockCandidates(): Candidate[] {
  return [
    { id: 'mock-deepseek-shape', provider: 'mock', model: 'mock-deepseek', displayName: 'Mock DeepSeek-shaped output' },
    { id: 'mock-glm-shape', provider: 'mock', model: 'mock-glm', displayName: 'Mock GLM-shaped output' },
  ]
}

export async function runGeneration(options: { live: boolean; model?: 'deepseek' | 'glm'; viaLitellm?: boolean; traceId?: string; fixtureId?: FixtureId; durationMinutes?: number }): Promise<RunReport> {
  const runId = randomUUID()
  const fixture = getFixture(options.fixtureId)
  const scenario = { ...fixture.scenario, durationMinutes: options.durationMinutes ?? fixture.scenario.durationMinutes }
  try {
    lessonTiming(scenario.durationMinutes)
  } catch (error) {
    throw new PlaygroundError('LESSON_DURATION_INVALID', 'generation', error instanceof Error ? error.message : 'Lesson duration is invalid.')
  }
  const { retrievalQuery } = fixture
  const route = options.live ? options.viaLitellm ? 'litellm' : 'baseten' : 'mock'
  const retrieval = await withSpan('playground.retrieval', {
    'playground.live': options.live,
    'playground.run_id': runId,
    'playground.fixture_id': fixture.id,
    'playground.target_id': scenario.targetId,
  }, async (span) => {
    const result = await retrieve(options.live ? undefined : 'mock', fixture.id)
    span.setAttribute('playground.embedding.model', result.model)
    span.setAttribute('playground.embedding.model_revision', result.modelRevision)
    span.setAttribute('playground.retrieval.selected_chunks', result.selected.length)
    span.setAttribute('playground.embedding.cache_hits', result.cacheHits)
    span.setAttribute('playground.embedding.cache_misses', result.cacheMisses)
    return result
  })
  const allowedIds = retrieval.selected.map((chunk) => chunk.id)
  const generationPrompt = await resolveGenerationPrompt(fixture.id)
  const candidates = [options.live
    ? (options.viaLitellm ? litellmCandidates() : basetenCandidates())[options.model === 'glm' ? 1 : 0]
    : mockCandidates()[options.model === 'glm' ? 1 : 0]]
  const results: RunReport['candidates'] = []
  process.stdout.write(`Retrieved ${allowedIds.length} chunks with ${retrieval.model}@${retrieval.modelRevision}; running ${candidates.map((candidate) => candidate.displayName).join(' and ')}.\n`)
  const candidateMetadata = { runId, fixtureId: fixture.id, targetId: scenario.targetId, route, durationMinutes: scenario.durationMinutes }
  for (const candidate of candidates) results.push(await runCandidate(candidate, retrieval.selected, allowedIds, generationPrompt, candidateMetadata))

  const report: RunReport = {
    schemaVersion: 'playground-run-v10',
    runId,
    createdAt: new Date().toISOString(),
    traceId: options.traceId,
    scenario: {
      fixtureId: fixture.id,
      curriculum: scenario.curriculum,
      curriculumRelease: scenario.curriculumRelease,
      programme: scenario.programme,
      grade: scenario.grade,
      subject: scenario.subject,
      targetId: scenario.targetId,
      targetLocator: scenario.targetLocator,
      lessonFocus: scenario.lessonFocus,
      requestedDurationMinutes: scenario.durationMinutes,
      containsSyntheticSources: true,
    },
    retrieval: {
      model: retrieval.model,
      modelRevision: retrieval.modelRevision,
      query: retrievalQuery,
      selectedChunkIds: allowedIds,
      selectedChunks: retrieval.selected,
      ranked: retrieval.ranked,
      cacheHits: retrieval.cacheHits,
      cacheMisses: retrieval.cacheMisses,
    },
    promptVersion: generationPrompt.version,
    promptName: generationPrompt.name,
    promptSource: generationPrompt.source,
    promptFallbackReason: generationPrompt.fallbackReason,
    outputSchema: outputSchemaFor(retrieval.selected),
    candidates: results,
  }
  report.selection = choose(report.candidates)
  const reportsDir = path.resolve(process.env.PLAYGROUND_REPORTS_DIR ?? '.cache/playground/runs')
  await mkdir(reportsDir, { recursive: true })
  await writeFile(path.join(reportsDir, `${report.runId}.json`), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

function choose(results: RunReport['candidates']): RunReport['selection'] {
  if (results.length < 2) return undefined
  const successful = results.filter((result) => result.status === 'success')
  if (successful.length === 0) return undefined
  if (successful.length === 1) return { candidateId: successful[0].candidate.id, reason: 'Only candidate that passed deterministic verification.' }
  const reason = successful.length === results.length
    ? 'All listed candidates passed deterministic checks; this is a provisional first candidate pending human or blinded semantic review.'
    : `${successful.length} candidates passed deterministic checks; this is a provisional first candidate pending human or blinded semantic review.`
  return { candidateId: successful[0].candidate.id, reason }
}
