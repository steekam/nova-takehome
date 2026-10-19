import { randomUUID } from 'node:crypto'
import { metrics, trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

const enabled = process.env.OTEL_ENABLED === 'true'
const serviceName = process.env.PLAYGROUND_OTEL_SERVICE_NAME ?? process.env.OTEL_SERVICE_NAME ?? 'nova-playground'
process.env.OTEL_SERVICE_NAME = serviceName
const spanProcessors = [new BatchSpanProcessor(new OTLPTraceExporter())]
const resource = resourceFromAttributes({
  'service.name': serviceName,
  'service.instance.id': randomUUID(),
})

const sdk = enabled
  ? new NodeSDK({
      resource,
      spanProcessors,
      metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: 10_000 })],
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      })],
    })
  : undefined
const logProvider = enabled
  ? new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    })
  : undefined

sdk?.start()

const tracer = trace.getTracer('nova-playground')
const meter = metrics.getMeter('nova-playground')
const logger = logProvider?.getLogger('nova-playground') ?? logs.getLogger('nova-playground')
const commandCount = meter.createCounter('playground.command.count')
const failureCount = meter.createCounter('playground.failure.count')
const commandDuration = meter.createHistogram('playground.command.duration', { unit: 'ms' })
const evaluationScore = meter.createHistogram('playground.evaluation.score')
const costUsd = meter.createHistogram('playground.cost.usd', { unit: 'USD' })
const datasetItemCount = meter.createHistogram('playground.dataset.item_count')
const embeddingDuration = meter.createHistogram('playground.embedding.duration', { unit: 'ms' })
const embeddingModelLoadDuration = meter.createHistogram('playground.embedding.model_load.duration', { unit: 'ms' })
const embeddingCacheOperations = meter.createCounter('playground.embedding.cache.operations')
const embeddingFailures = meter.createCounter('playground.embedding.failure.count')

const commandLabels = new Set(['generate', 'review', 'plans', 'retrieval-eval', 'review-eval', 'dataset', 'costs', 'prompts', 'schema'])

export function commandMetricLabel(command: string): string {
  return commandLabels.has(command) ? command : 'unknown'
}

export function recordPlaygroundCommand(command: string, outcome: 'success' | 'failure', elapsedMs: number): void {
  const attributes = { command: commandMetricLabel(command), outcome }
  commandCount.add(1, attributes)
  commandDuration.record(elapsedMs, attributes)
}

export function recordPlaygroundFailure(input: { command: string; stage: string; errorCode: string; retryable: boolean }): void {
  failureCount.add(1, {
    command: commandMetricLabel(input.command),
    stage: input.stage,
    error_code: input.errorCode,
    retryable: input.retryable,
  })
}

export function recordEvaluationScores(scores: Array<{ name: string; value: number; attributes: Attributes }>): void {
  for (const score of scores) evaluationScore.record(score.value, { 'evaluation.metric': score.name, ...score.attributes })
}

export function recordPlaygroundCost(value: number, attributes: Attributes): void {
  costUsd.record(value, attributes)
}

export function recordDatasetItemCount(value: number, attributes: Attributes): void {
  datasetItemCount.record(value, attributes)
}

export function recordEmbeddingWork(input: {
  model: string
  modelRevision: string
  provider: string
  durationMs: number
  modelLoadDurationMs: number
  cacheHits: number
  cacheMisses: number
}): void {
  const attributes = { model: input.model, model_revision: input.modelRevision, provider: input.provider }
  embeddingDuration.record(input.durationMs, attributes)
  if (input.modelLoadDurationMs > 0) embeddingModelLoadDuration.record(input.modelLoadDurationMs, attributes)
  if (input.cacheHits > 0) embeddingCacheOperations.add(input.cacheHits, { ...attributes, result: 'hit' })
  if (input.cacheMisses > 0) embeddingCacheOperations.add(input.cacheMisses, { ...attributes, result: 'miss' })
}

export function recordEmbeddingFailure(input: {
  model: string
  modelRevision: string
  provider: string
  errorCode: string
  durationMs: number
}): void {
  embeddingDuration.record(input.durationMs, {
    model: input.model,
    model_revision: input.modelRevision,
    provider: input.provider,
    outcome: 'failure',
  })
  embeddingFailures.add(1, {
    model: input.model,
    model_revision: input.modelRevision,
    provider: input.provider,
    error_code: input.errorCode,
  })
}

export function emitTelemetryLog(body: string, severityNumber: SeverityNumber, attributes: Attributes): void {
  logger.emit({ body, severityNumber, attributes })
}

export async function withSpan<T>(name: string, attributes: Attributes, operation: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await operation(span)
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error))
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw error
    } finally {
      span.end()
    }
  })
}

export type ScoreDelivery = {
  status: 'sent' | 'failed' | 'skipped'
  id?: string
  message?: string
}

export async function reportNumericScores(input: {
  traceId?: string
  observationId?: string
  scores: Array<{ name: string; value: number; comment: string }>
}): Promise<ScoreDelivery> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!input.traceId || /^0+$/.test(input.traceId) || !input.observationId || /^0+$/.test(input.observationId) || !publicKey || !secretKey) {
    return { status: 'skipped', message: 'Trace IDs or Langfuse credentials unavailable.' }
  }
  if (input.scores.length === 0) return { status: 'skipped', message: 'No evaluation scores were provided.' }

  const host = (process.env.LANGFUSE_HOST ?? 'http://localhost:3002').replace(/\/$/, '')
  try {
    const response = await fetch(`${host}/api/public/scores`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input.scores.map((score) => ({
        id: randomUUID(), traceId: input.traceId, observationId: input.observationId,
        name: score.name, value: score.value, dataType: 'NUMERIC', comment: score.comment,
      }))),
      signal: AbortSignal.timeout(3000),
    })
    if (response.status === 207) {
      const result: unknown = await response.json()
      if (typeof result === 'object' && result !== null && 'rejected' in result && typeof result.rejected === 'number') {
        return result.rejected === 0
          ? { status: 'sent', message: 'Evaluation scores delivered.' }
          : { status: 'failed', message: `Langfuse rejected ${result.rejected} evaluation score(s).` }
      }
      return { status: 'failed', message: 'Langfuse returned an unreadable partial score result.' }
    }
    return response.ok
      ? { status: 'sent', message: 'Evaluation scores delivered.' }
      : { status: 'failed', message: `Langfuse evaluation score API returned HTTP ${response.status}.` }
  } catch {
    return { status: 'failed', message: 'Langfuse evaluation score delivery failed; the local report is available.' }
  }
}

export async function reportVerificationScore(input: {
  id: string
  traceId?: string
  observationId?: string
  passed: boolean
  comment: string
}): Promise<ScoreDelivery> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!input.traceId || /^0+$/.test(input.traceId) || !input.observationId || /^0+$/.test(input.observationId) || !publicKey || !secretKey) {
    return { status: 'skipped', message: 'Trace IDs or Langfuse credentials unavailable.' }
  }

  const host = (process.env.LANGFUSE_HOST ?? 'http://localhost:3002').replace(/\/$/, '')
  try {
    const response = await fetch(`${host}/api/public/scores`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        id: input.id,
        traceId: input.traceId,
        observationId: input.observationId,
        name: 'deterministic_verification',
        value: input.passed ? 1 : 0,
        dataType: 'BOOLEAN',
        comment: input.comment,
      }]),
      signal: AbortSignal.timeout(3000),
    })
    if (response.status === 207) {
      const result: unknown = await response.json()
      if (typeof result === 'object' && result !== null && 'rejected' in result && typeof result.rejected === 'number') {
        return result.rejected === 0
          ? { status: 'sent', id: input.id }
          : { status: 'failed', id: input.id, message: `Langfuse rejected ${result.rejected} score(s) in the batch.` }
      }
      return { status: 'failed', id: input.id, message: 'Langfuse returned an unreadable partial score result.' }
    }
    return response.ok
      ? { status: 'sent', id: input.id }
      : { status: 'failed', id: input.id, message: `Langfuse score API returned HTTP ${response.status}.` }
  } catch {
    return { status: 'failed', id: input.id, message: 'Langfuse score delivery failed; the local run report is available.' }
  }
}

export async function reportReviewFindingScores(input: {
  traceId?: string
  observationId?: string
  rubricVersion: string
  inputHash: string
  counts: { total: number; blocker: number; warning: number; info: number }
}): Promise<ScoreDelivery> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!input.traceId || /^0+$/.test(input.traceId) || !input.observationId || /^0+$/.test(input.observationId) || !publicKey || !secretKey) {
    return { status: 'skipped', message: 'Source generation trace, observation, or Langfuse credentials unavailable.' }
  }

  const host = (process.env.LANGFUSE_HOST ?? 'http://localhost:3002').replace(/\/$/, '')
  const dimensions = [
    ['llm_judge_finding_count', input.counts.total],
    ['llm_judge_blocker_count', input.counts.blocker],
    ['llm_judge_warning_count', input.counts.warning],
    ['llm_judge_info_count', input.counts.info],
  ] as const
  const rubric = `${input.rubricVersion}; input_sha256=${input.inputHash}; counts are advisory finding counts, not pass scores.`
  try {
    const response = await fetch(`${host}/api/public/scores`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dimensions.map(([name, value]) => ({
        id: randomUUID(),
        traceId: input.traceId,
        observationId: input.observationId,
        name,
        value,
        dataType: 'NUMERIC',
        comment: rubric,
      }))),
      signal: AbortSignal.timeout(3000),
    })
    if (response.status === 207) {
      const result: unknown = await response.json()
      if (typeof result === 'object' && result !== null && 'rejected' in result && typeof result.rejected === 'number') {
        return result.rejected === 0
          ? { status: 'sent', message: 'LLM judge finding counts delivered.' }
          : { status: 'failed', message: `Langfuse rejected ${result.rejected} judge score(s).` }
      }
      return { status: 'failed', message: 'Langfuse returned an unreadable partial judge score result.' }
    }
    return response.ok
      ? { status: 'sent', message: 'LLM judge finding counts delivered.' }
      : { status: 'failed', message: `Langfuse judge score API returned HTTP ${response.status}.` }
  } catch {
    return { status: 'failed', message: 'Langfuse judge score delivery failed; the local review report is available.' }
  }
}

export async function reportReviewEvaluationScores(input: {
  traceId?: string
  observationId?: string
  evalRunId: string
  caseId: string
  inputHash: string
  labelSet: string
  judgeProvider: string
  judgeModel: string
  route: 'direct' | 'litellm'
  expectedDefect: boolean
  expectedDefectDetected: boolean
  expectedBehaviorPassed: boolean
  expectedEvidenceCited?: boolean
  expectedExplanationPassed?: boolean
  noUnexpectedFindings?: boolean
  schemaValid: boolean
}): Promise<ScoreDelivery> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!input.traceId || /^0+$/.test(input.traceId) || !input.observationId || /^0+$/.test(input.observationId) || !publicKey || !secretKey) {
    return { status: 'skipped', message: 'Review observation or Langfuse credentials unavailable.' }
  }

  const host = (process.env.LANGFUSE_HOST ?? 'http://localhost:3002').replace(/\/$/, '')
  const scores: Array<[string, boolean]> = [
    ['review_eval_expected_behavior_passed', input.expectedBehaviorPassed],
    ['review_eval_expected_defect_detected', input.expectedDefectDetected],
    ['review_eval_schema_valid', input.schemaValid],
  ]
  if (input.expectedEvidenceCited !== undefined) scores.push(['review_eval_expected_evidence_cited', input.expectedEvidenceCited])
  if (input.expectedExplanationPassed !== undefined) scores.push(['review_eval_expected_rationale_concepts_passed', input.expectedExplanationPassed])
  if (input.noUnexpectedFindings !== undefined) scores.push(['review_eval_no_unexpected_findings', input.noUnexpectedFindings])
  try {
    const response = await fetch(`${host}/api/public/scores`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scores.map(([name, value]) => ({
        id: randomUUID(),
        traceId: input.traceId,
        observationId: input.observationId,
        name,
        value: value ? 1 : 0,
        dataType: 'BOOLEAN',
        comment: `${input.caseId}; eval_run=${input.evalRunId}; label_set=${input.labelSet}; input_sha256=${input.inputHash}`,
        metadata: {
          suite: 'review_judge',
          evalRunId: input.evalRunId,
          caseId: input.caseId,
          labelSet: input.labelSet,
          judgeProvider: input.judgeProvider,
          judgeModel: input.judgeModel,
          route: input.route,
          expectedDefect: input.expectedDefect,
          inputSha256: input.inputHash,
        },
      }))),
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 207) {
      const result: unknown = await response.json()
      if (typeof result === 'object' && result !== null && 'rejected' in result && typeof result.rejected === 'number') {
        return result.rejected === 0
          ? { status: 'sent', message: 'Review evaluation scores delivered.' }
          : { status: 'failed', message: `Langfuse rejected ${result.rejected} review evaluation score(s).` }
      }
      return { status: 'failed', message: 'Langfuse returned an unreadable partial score result.' }
    }
    return response.ok
      ? { status: 'sent', message: 'Review evaluation scores delivered.' }
      : { status: 'failed', message: `Langfuse review evaluation score API returned HTTP ${response.status}.` }
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? 'Langfuse review evaluation score delivery timed out; the local report is available.'
      : 'Langfuse review evaluation score delivery failed; the local report is available.'
    return { status: 'failed', message }
  }
}

export function currentTraceId(): string | undefined {
  const traceId = trace.getActiveSpan()?.spanContext().traceId
  return traceId && !/^0+$/.test(traceId) ? traceId : undefined
}

export async function shutdownTelemetry(): Promise<void> {
  const shutdownResults = await Promise.allSettled([
    ...(sdk ? [sdk.shutdown()] : []),
    ...(logProvider ? [logProvider.shutdown()] : []),
  ])
  if (shutdownResults.some((result) => result.status === 'rejected')) {
    process.stderr.write('OpenTelemetry export failed during shutdown; the playground report is still available.\n')
  }
}
