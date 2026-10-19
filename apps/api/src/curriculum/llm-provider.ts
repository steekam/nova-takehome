import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

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
    const model = this.config.get<string>('LLM_MODEL')
    if (!baseUrl || !model) throw new Error('LLM_BASE_URL and LLM_MODEL are required for openai-compatible provider')

    let response: Response
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        signal: AbortSignal.timeout(20_000), method: 'POST', headers: {
          'content-type': 'application/json',
          ...(this.config.get<string>('LLM_API_KEY') ? { authorization: `Bearer ${this.config.get<string>('LLM_API_KEY')}` } : {}),
        }, body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ] }),
      })
    } catch {
      throw new ServiceUnavailableException({ code: 'LLM_PROVIDER_UNAVAILABLE', message: 'The lesson plan service did not respond. No draft was saved; try again.' })
    }
    if (!response.ok) throw new ServiceUnavailableException({ code: 'LLM_PROVIDER_REJECTED', message: 'The lesson plan provider rejected the request. No draft was saved; try again later.' })
    let payload: unknown
    try { payload = await response.json() } catch { payload = undefined }
    return responseContent(payload)
  }
}

function responseContent(payload: unknown): string | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return undefined
  const first = payload.choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return undefined
  const content = first.message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.flatMap((part) => isRecord(part) && typeof part.text === 'string' ? [part.text] : []).join('\n') || undefined
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
