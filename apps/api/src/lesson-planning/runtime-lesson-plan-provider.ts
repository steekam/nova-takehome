import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { LlmMode, RuntimeLlmModeStatus } from '@nova/shared'
import type { LessonPlanCompletionRequest, LessonPlanCompletionResult, LessonPlanProvider } from './llm-provider'
import { OpenAiCompatibleLessonPlanProvider } from './llm-provider'
import { MockLessonPlanProvider } from './mock-lesson-plan-provider'

@Injectable()
export class RuntimeLessonPlanProvider implements LessonPlanProvider {
  private mode: LlmMode

  constructor(
    private readonly config: ConfigService,
    private readonly live: OpenAiCompatibleLessonPlanProvider,
    private readonly mock: MockLessonPlanProvider,
  ) {
    this.mode = config.get<string>('LLM_PROVIDER', 'mock') === 'openai-compatible' && this.missingLiveSettings().length === 0 ? 'live' : 'mock'
  }

  status(): RuntimeLlmModeStatus {
    const missing = this.missingLiveSettings()
    return { mode: this.mode, liveAvailable: missing.length === 0, missing }
  }

  setMode(mode: LlmMode): RuntimeLlmModeStatus {
    const missing = mode === 'live' ? this.missingLiveSettings() : []
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'LLM_CREDENTIALS_MISSING',
        message: `Live mode is unavailable. Set ${missing.join(', ')} in .env.local and restart the API. Nova remains in mock mode.`,
      })
    }
    this.mode = mode
    return this.status()
  }

  complete(request: LessonPlanCompletionRequest): Promise<LessonPlanCompletionResult> {
    return (this.mode === 'live' ? this.live : this.mock).complete(request)
  }

  private missingLiveSettings(): string[] {
    return [
      ...(!this.config.get<string>('LLM_BASE_URL') ? ['LLM_BASE_URL'] : []),
      ...(!this.config.get<string>('LLM_GENERATOR_MODEL') && !this.config.get<string>('LLM_MODEL') ? ['LLM_GENERATOR_MODEL'] : []),
      ...(!this.config.get<string>('LLM_API_KEY') ? ['LLM_API_KEY'] : []),
    ]
  }
}
