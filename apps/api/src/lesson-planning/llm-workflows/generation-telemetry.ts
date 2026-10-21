import { metrics } from '@opentelemetry/api'
import type { Span } from '@opentelemetry/api'
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing'

const meter = metrics.getMeter('nova-api-curriculum')
const providerCallCount = meter.createCounter('llm.provider.attempts')
const providerCallDuration = meter.createHistogram('llm.provider.duration', { unit: 'ms' })
const providerRetryCount = meter.createCounter('llm.provider.retries')
const providerRetryDelay = meter.createHistogram('llm.provider.retry_delay', { unit: 'ms' })
const generationCount = meter.createCounter('lesson_plan.generation.count')
const generationDuration = meter.createHistogram('lesson_plan.generation.duration', { unit: 'ms' })
const generationProviderAttempts = meter.createHistogram('lesson_plan.generation.provider_attempts')
const generationRepairAttempts = meter.createHistogram('lesson_plan.generation.repair_attempts')
const generationValidationChecks = meter.createCounter('lesson_plan.generation.validation_checks')
const generationInputTokens = meter.createHistogram('lesson_plan.generation.input_tokens', { unit: 'token' })
const generationOutputTokens = meter.createHistogram('lesson_plan.generation.output_tokens', { unit: 'token' })
const generationReportedCost = meter.createHistogram('lesson_plan.generation.reported_cost', { unit: 'USD' })
const capturePromptContent = process.env.LANGFUSE_CAPTURE_PROMPTS === 'true'

export function setLangfuseInput(span: Span, input: unknown): void {
  if (capturePromptContent) span.setAttribute('langfuse.observation.input', JSON.stringify(input))
}

export function setLangfuseOutput(span: Span, output: unknown): void {
  if (capturePromptContent) span.setAttribute('langfuse.observation.output', JSON.stringify(output))
}

export function startLangfuseSpan<T>(name: string, callback: (span: Span) => Promise<T>, requestId?: string): Promise<T> {
  return startActiveObservation(name, async (observation) => {
    if (requestId) {
      observation.update({ metadata: { requestId } })
      return propagateAttributes({ metadata: { requestId }, traceName: name, asBaggage: true }, () => callback(observation.otelSpan))
    }
    return callback(observation.otelSpan)
  }, { endOnExit: false })
}

export type ProviderAttemptOutcome = 'success' | 'failure'
export type GenerationOutcome = 'success' | 'invalid_output' | 'provider_error'

export function recordProviderAttempt(input: {
  provider: string
  outcome: ProviderAttemptOutcome
  durationMs: number
  errorCode?: string
  retryDelayMs?: number
}): void {
  const attributes = {
    provider: input.provider,
    outcome: input.outcome,
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
  }
  providerCallCount.add(1, attributes)
  providerCallDuration.record(input.durationMs, attributes)
  if (input.retryDelayMs !== undefined) {
    providerRetryCount.add(1, attributes)
    providerRetryDelay.record(input.retryDelayMs, attributes)
  }
}

export function recordGenerationValidation(input: { provider: string; checkCode: string; passed: boolean }): void {
  generationValidationChecks.add(1, {
    provider: input.provider,
    check_code: input.checkCode,
    outcome: input.passed ? 'passed' : 'failed',
  })
}

export function recordGeneration(input: {
  provider: string
  outcome: GenerationOutcome
  durationMs: number
  providerAttempts: number
  repairAttempts: number
  inputTokens: number
  outputTokens: number
  reportedCostUsd: number
}): void {
  const attributes = { provider: input.provider, outcome: input.outcome }
  generationCount.add(1, attributes)
  generationDuration.record(input.durationMs, attributes)
  generationProviderAttempts.record(input.providerAttempts, attributes)
  generationRepairAttempts.record(input.repairAttempts, attributes)
  if (input.inputTokens > 0) generationInputTokens.record(input.inputTokens, attributes)
  if (input.outputTokens > 0) generationOutputTokens.record(input.outputTokens, attributes)
  if (input.reportedCostUsd > 0) generationReportedCost.record(input.reportedCostUsd, attributes)
}
