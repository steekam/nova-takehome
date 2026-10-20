import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { callModel, ModelRuntimeError } from '@nova/model-runtime'

export interface LessonPlanCompletionRequest {
  system: string
  user: string
}

export interface LessonPlanProvider {
  complete(request: LessonPlanCompletionRequest): Promise<string | undefined>
}

export const LESSON_PLAN_PROVIDER = Symbol('LESSON_PLAN_PROVIDER')

@Injectable()
export class OpenAiCompatibleLessonPlanProvider implements LessonPlanProvider {
  constructor(private readonly config: ConfigService) {}

  async complete(request: LessonPlanCompletionRequest): Promise<string | undefined> {
    const baseUrl = this.config.get<string>('LLM_BASE_URL')
    const model = this.config.get<string>('LLM_GENERATOR_MODEL') ?? this.config.get<string>('LLM_MODEL')
    if (!baseUrl || !model) throw new Error('LLM_BASE_URL and LLM_GENERATOR_MODEL are required for openai-compatible provider')

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await callModel({
          connection: { id: 'api', baseUrl, apiKey: this.config.get<string>('LLM_API_KEY') },
          model,
          system: request.system,
          prompt: request.user,
          output: { type: 'json-object' },
          timeoutMs: 20_000,
          temperature: 0,
        })
        return response.content || undefined
      } catch (error) {
        if (!(error instanceof ModelRuntimeError)) throw error
        if (error.retryable && attempt === 0) continue
        throw providerException(error)
      }
    }
    throw new ServiceUnavailableException({ code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan service did not respond after one retry. No draft was saved; try again.' })
  }
}

function providerException(error: ModelRuntimeError): ServiceUnavailableException {
  const messages: Record<ModelRuntimeError['code'], { code: string; message: string }> = {
    PROVIDER_AUTH_ERROR: { code: 'LLM_PROVIDER_AUTH_FAILED', message: 'The lesson plan provider rejected its credentials or model access. No draft was saved; check provider access.' },
    PROVIDER_RATE_LIMITED: { code: 'LLM_PROVIDER_RATE_LIMITED', message: 'The lesson plan provider is rate limited. No draft was saved; wait briefly and try again.' },
    PROVIDER_UNAVAILABLE: { code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan provider did not respond after one retry. No draft was saved; try again later.' },
    PROVIDER_TIMEOUT: { code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan provider timed out after one retry. No draft was saved; try again later.' },
    PROVIDER_REQUEST_REJECTED: { code: 'LLM_PROVIDER_REJECTED', message: 'The lesson plan provider rejected the request. No draft was saved; check provider configuration.' },
    PROVIDER_INVALID_RESPONSE: { code: 'LLM_PROVIDER_INVALID_RESPONSE', message: 'The lesson plan provider returned an invalid response after one retry. No draft was saved; try again.' },
  }
  const detail = messages[error.code]
  return new ServiceUnavailableException({ code: detail.code, message: detail.message })
}
