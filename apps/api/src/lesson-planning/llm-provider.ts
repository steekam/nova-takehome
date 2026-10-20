import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SpanStatusCode } from '@opentelemetry/api'
import { updateActiveObservation } from '@langfuse/tracing'
import { callModel, ModelRuntimeError } from '@nova/model-runtime'
import { recordProviderAttempt, setLangfuseInput, setLangfuseOutput, startLangfuseSpan } from './generation-telemetry'
import { RequestIdService } from '../common/request-id.service'
import type { LangfusePromptReference } from './langfuse-prompts'

export interface LessonPlanCompletionRequest {
  system: string
  user: string
  prompt?: LangfusePromptReference
}

export interface LessonPlanCompletionResult {
  content?: string
  provider: string
  model: string
  responseModel?: string
  finishReason?: string
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  reportedCostUsd?: number
  durationMs: number
  providerAttempts: number
}

export interface LessonPlanProvider {
  complete(request: LessonPlanCompletionRequest, modelOverride?: string): Promise<LessonPlanCompletionResult>
}

export class LessonPlanProviderFailure extends ServiceUnavailableException {
  constructor(
    readonly provider: string,
    readonly model: string,
    readonly providerAttempts: number,
    response: { code: string; message: string },
  ) {
    super(response)
  }
}

export const LESSON_PLAN_PROVIDER = Symbol('LESSON_PLAN_PROVIDER')
const MAX_PROVIDER_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500
const RETRY_MAX_DELAY_MS = 8_000

@Injectable()
export class OpenAiCompatibleLessonPlanProvider implements LessonPlanProvider {
  constructor(private readonly config: ConfigService, private readonly requestIds: RequestIdService) {}

  async complete(request: LessonPlanCompletionRequest, modelOverride?: string): Promise<LessonPlanCompletionResult> {
    const baseUrl = this.config.get<string>('LLM_BASE_URL')
    const model = modelOverride ?? this.config.get<string>('LLM_GENERATOR_MODEL') ?? this.config.get<string>('LLM_MODEL')
    if (!baseUrl || !model) {
      throw new LessonPlanProviderFailure('openai-compatible', model ?? 'unknown', 0, {
        code: 'LLM_PROVIDER_UNAVAILABLE',
        message: 'LLM_BASE_URL and LLM_GENERATOR_MODEL are required for openai-compatible provider.',
      })
    }

    const startedAt = Date.now()
    const requestId = this.requestIds.current()
    for (let attempt = 0; attempt <= MAX_PROVIDER_RETRIES; attempt += 1) {
      let response: Awaited<ReturnType<typeof callModel>>
      let retryDelayMs: number | undefined
      let retryAfterMs: number | undefined
      try {
        response = await startLangfuseSpan('nova.llm.provider.call', async (span) => {
          span.setAttribute('llm.provider', 'openai-compatible')
          span.setAttribute('gen_ai.operation.name', 'chat')
          span.setAttribute('gen_ai.request.model', model)
          span.setAttribute('llm.provider.attempt', attempt + 1)
          if (request.prompt) {
            span.setAttribute('langfuse.observation.prompt.name', request.prompt.name)
            span.setAttribute('langfuse.observation.prompt.version', request.prompt.version)
            updateActiveObservation({ prompt: request.prompt }, { asType: 'generation' })
          }
          setLangfuseInput(span, { system: request.system, user: request.user })
          const callStartedAt = Date.now()
          let outcome: 'success' | 'failure' = 'failure'
          let errorCode: string | undefined
          try {
            const response = await callModel({
              connection: {
                id: 'api',
                baseUrl,
                apiKey: this.config.get<string>('LLM_API_KEY'),
                ...(requestId ? { headers: { 'x-request-id': requestId } } : {}),
              },
              model,
              system: request.system,
              prompt: request.user,
              output: { type: 'json-object' },
              timeoutMs: 20_000,
              temperature: 0,
              maxOutputTokens: configuredMaxOutputTokens(this.config.get<string>('LLM_MAX_OUTPUT_TOKENS')),
              disableThinking: true,
              reportedCostHeader: 'x-litellm-response-cost',
            })
            outcome = 'success'
            span.setAttribute('llm.provider.outcome', 'success')
            if (response.responseModel) span.setAttribute('gen_ai.response.model', response.responseModel)
            if (response.finishReason) span.setAttribute('gen_ai.response.finish_reason', response.finishReason)
            if (response.usage?.inputTokens !== undefined) span.setAttribute('gen_ai.usage.input_tokens', response.usage.inputTokens)
            if (response.usage?.outputTokens !== undefined) span.setAttribute('gen_ai.usage.output_tokens', response.usage.outputTokens)
            if (response.usage?.totalTokens !== undefined) span.setAttribute('gen_ai.usage.total_tokens', response.usage.totalTokens)
            if (response.reportedCostUsd !== undefined) span.setAttribute('gen_ai.usage.cost', response.reportedCostUsd)
            setLangfuseOutput(span, {
              content: parseProviderContent(response.content),
              responseModel: response.responseModel,
              finishReason: response.finishReason,
            })
            return response
          } catch (error) {
            span.setAttribute('llm.provider.outcome', 'failure')
            if (error instanceof ModelRuntimeError) {
              errorCode = error.code
              retryAfterMs = error.retryAfterMs
              span.setAttribute('error.type', error.code)
              span.setAttribute('llm.provider.retryable', error.retryable)
              setLangfuseOutput(span, { errorCode: error.code, retryable: error.retryable, retryAfterMs: error.retryAfterMs })
              if (error.retryAfterMs !== undefined) span.setAttribute('llm.provider.retry_after_ms', error.retryAfterMs)
              if (error.retryable && attempt < MAX_PROVIDER_RETRIES) {
                retryDelayMs = providerRetryDelayMs(error.retryAfterMs, attempt + 1)
                span.setAttribute('llm.provider.retry_scheduled', true)
                span.setAttribute('llm.provider.retry_delay_ms', retryDelayMs)
              } else {
                span.setAttribute('llm.provider.retry_scheduled', false)
              }
              span.setStatus({ code: SpanStatusCode.ERROR, message: error.code })
            } else {
              span.setStatus({ code: SpanStatusCode.ERROR })
            }
            throw error
          } finally {
            const durationMs = Date.now() - callStartedAt
            span.setAttribute('llm.provider.duration_ms', durationMs)
            recordProviderAttempt({
              provider: 'openai-compatible',
              outcome,
              durationMs,
              ...(errorCode ? { errorCode } : {}),
              ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
            })
            span.end()
          }
        })
      } catch (error) {
        if (error instanceof ModelRuntimeError) {
          if (error.retryable && attempt < MAX_PROVIDER_RETRIES) {
            await wait(retryDelayMs ?? providerRetryDelayMs(error.retryAfterMs, attempt + 1))
            continue
          }
          const response = providerErrorResponse(error)
          throw new LessonPlanProviderFailure('openai-compatible', model, attempt + 1, response)
        }
        throw error
      }
      return {
        content: response.content || undefined,
        provider: 'openai-compatible',
        model,
        responseModel: response.responseModel,
        finishReason: response.finishReason,
        usage: response.usage ? {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.totalTokens,
        } : undefined,
        reportedCostUsd: response.reportedCostUsd,
        durationMs: Date.now() - startedAt,
        providerAttempts: attempt + 1,
      }
    }
    throw new ServiceUnavailableException({ code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan service did not respond after retries. No draft was saved; try again.' })
  }
}

function configuredMaxOutputTokens(value: string | undefined): number {
  const parsed = value === undefined ? 8192 : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16384) {
    throw new Error('LLM_MAX_OUTPUT_TOKENS must be an integer from 1 to 16384.')
  }
  return parsed
}

function parseProviderContent(content: string | undefined): unknown {
  if (!content) return null
  try { return JSON.parse(content) as unknown } catch { return content }
}

function providerRetryDelayMs(retryAfterMs: number | undefined, retryNumber: number): number {
  const exponentialCap = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (retryNumber - 1))
  const jitteredBackoff = Math.floor(Math.random() * (exponentialCap + 1))
  if (retryAfterMs === undefined) return jitteredBackoff
  const jitterCap = Math.min(1_000, Math.max(100, Math.ceil(retryAfterMs * 0.1)))
  return Math.max(retryAfterMs, jitteredBackoff) + Math.floor(Math.random() * (jitterCap + 1))
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function providerErrorResponse(error: ModelRuntimeError): { code: string; message: string } {
  const messages: Record<ModelRuntimeError['code'], { code: string; message: string }> = {
    PROVIDER_AUTH_ERROR: { code: 'LLM_PROVIDER_AUTH_FAILED', message: 'The lesson plan provider rejected its credentials or model access. No draft was saved; check provider access.' },
    PROVIDER_RATE_LIMITED: { code: 'LLM_PROVIDER_RATE_LIMITED', message: 'The lesson plan provider is rate limited. No draft was saved; wait briefly and try again.' },
    PROVIDER_UNAVAILABLE: { code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan provider did not respond after retries. No draft was saved; try again later.' },
    PROVIDER_TIMEOUT: { code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan provider timed out after retries. No draft was saved; try again later.' },
    PROVIDER_REQUEST_REJECTED: { code: 'LLM_PROVIDER_REJECTED', message: 'The lesson plan provider rejected the request. No draft was saved; check provider configuration.' },
    PROVIDER_INVALID_RESPONSE: { code: 'LLM_PROVIDER_INVALID_RESPONSE', message: 'The lesson plan provider returned an invalid response. No draft was saved; try again.' },
  }
  return messages[error.code]
}
