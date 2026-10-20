import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import { callModel, ModelRuntimeError } from '@nova/model-runtime'
import { recordProviderAttempt } from './generation-telemetry'

export interface LessonPlanCompletionRequest {
  system: string
  user: string
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
  complete(request: LessonPlanCompletionRequest): Promise<LessonPlanCompletionResult>
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

@Injectable()
export class OpenAiCompatibleLessonPlanProvider implements LessonPlanProvider {
  constructor(private readonly config: ConfigService) {}

  async complete(request: LessonPlanCompletionRequest): Promise<LessonPlanCompletionResult> {
    const baseUrl = this.config.get<string>('LLM_BASE_URL')
    const model = this.config.get<string>('LLM_GENERATOR_MODEL') ?? this.config.get<string>('LLM_MODEL')
    if (!baseUrl || !model) {
      throw new LessonPlanProviderFailure('openai-compatible', model ?? 'unknown', 0, {
        code: 'LLM_PROVIDER_UNAVAILABLE',
        message: 'LLM_BASE_URL and LLM_GENERATOR_MODEL are required for openai-compatible provider.',
      })
    }

    const startedAt = Date.now()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Awaited<ReturnType<typeof callModel>>
      try {
        response = await trace.getTracer('nova-api-curriculum').startActiveSpan('nova.llm.provider.call', async (span) => {
          span.setAttribute('llm.provider', 'openai-compatible')
          span.setAttribute('gen_ai.operation.name', 'chat')
          span.setAttribute('gen_ai.request.model', model)
          span.setAttribute('llm.provider.attempt', attempt + 1)
          const callStartedAt = Date.now()
          let outcome: 'success' | 'failure' = 'failure'
          let errorCode: string | undefined
          try {
            const response = await callModel({
              connection: { id: 'api', baseUrl, apiKey: this.config.get<string>('LLM_API_KEY') },
              model,
              system: request.system,
              prompt: request.user,
              output: { type: 'json-object' },
              timeoutMs: 20_000,
              temperature: 0,
              maxOutputTokens: 2200,
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
            return response
          } catch (error) {
            span.setAttribute('llm.provider.outcome', 'failure')
            if (error instanceof ModelRuntimeError) {
              errorCode = error.code
              span.setAttribute('error.type', error.code)
              span.setStatus({ code: SpanStatusCode.ERROR, message: error.code })
            } else {
              span.setStatus({ code: SpanStatusCode.ERROR })
            }
            throw error
          } finally {
            const durationMs = Date.now() - callStartedAt
            span.setAttribute('llm.provider.duration_ms', durationMs)
            recordProviderAttempt({ provider: 'openai-compatible', outcome, durationMs, ...(errorCode ? { errorCode } : {}) })
            span.end()
          }
        })
      } catch (error) {
        if (error instanceof ModelRuntimeError) {
          if (error.retryable && attempt === 0) continue
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
    throw new ServiceUnavailableException({ code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan service did not respond after one retry. No draft was saved; try again.' })
  }
}

function providerErrorResponse(error: ModelRuntimeError): { code: string; message: string } {
  const messages: Record<ModelRuntimeError['code'], { code: string; message: string }> = {
    PROVIDER_AUTH_ERROR: { code: 'LLM_PROVIDER_AUTH_FAILED', message: 'The lesson plan provider rejected its credentials or model access. No draft was saved; check provider access.' },
    PROVIDER_RATE_LIMITED: { code: 'LLM_PROVIDER_RATE_LIMITED', message: 'The lesson plan provider is rate limited. No draft was saved; wait briefly and try again.' },
    PROVIDER_UNAVAILABLE: { code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan provider did not respond after one retry. No draft was saved; try again later.' },
    PROVIDER_TIMEOUT: { code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan provider timed out after one retry. No draft was saved; try again later.' },
    PROVIDER_REQUEST_REJECTED: { code: 'LLM_PROVIDER_REJECTED', message: 'The lesson plan provider rejected the request. No draft was saved; check provider configuration.' },
    PROVIDER_INVALID_RESPONSE: { code: 'LLM_PROVIDER_INVALID_RESPONSE', message: 'The lesson plan provider returned an invalid response after one retry. No draft was saved; try again.' },
  }
  return messages[error.code]
}
