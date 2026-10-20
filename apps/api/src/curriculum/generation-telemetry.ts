import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('nova-api-curriculum')
const providerCallCount = meter.createCounter('llm.provider.attempts')
const providerCallDuration = meter.createHistogram('llm.provider.duration', { unit: 'ms' })
const generationCount = meter.createCounter('lesson_plan.generation.count')
const generationDuration = meter.createHistogram('lesson_plan.generation.duration', { unit: 'ms' })
const generationProviderAttempts = meter.createHistogram('lesson_plan.generation.provider_attempts')
const generationRepairAttempts = meter.createHistogram('lesson_plan.generation.repair_attempts')
const generationValidationChecks = meter.createCounter('lesson_plan.generation.validation_checks')
const generationInputTokens = meter.createHistogram('lesson_plan.generation.input_tokens', { unit: 'token' })
const generationOutputTokens = meter.createHistogram('lesson_plan.generation.output_tokens', { unit: 'token' })
const generationReportedCost = meter.createHistogram('lesson_plan.generation.reported_cost', { unit: 'USD' })

export type ProviderAttemptOutcome = 'success' | 'failure'
export type GenerationOutcome = 'success' | 'invalid_output' | 'provider_error'

export function recordProviderAttempt(input: {
  provider: string
  outcome: ProviderAttemptOutcome
  durationMs: number
  errorCode?: string
}): void {
  const attributes = { provider: input.provider, outcome: input.outcome, ...(input.errorCode ? { error_code: input.errorCode } : {}) }
  providerCallCount.add(1, attributes)
  providerCallDuration.record(input.durationMs, attributes)
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
