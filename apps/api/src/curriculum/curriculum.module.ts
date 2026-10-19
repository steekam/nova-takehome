import { Module } from '@nestjs/common'
import { CurriculumController } from './curriculum.controller'
import { CurriculumService } from './curriculum.service'
import { LessonPlanGenerator } from './lesson-plan-generator'
import { CurriculumRepository } from './curriculum.repository'
import { EmbeddingAdapter } from './embedding.service'
import { ConfigService } from '@nestjs/config'
import { LESSON_PLAN_PROVIDER, OpenAiCompatibleLessonPlanProvider } from './llm-provider'
import { MockLessonPlanProvider } from './mock-lesson-plan-provider'

@Module({ controllers: [CurriculumController], providers: [
  CurriculumService, LessonPlanGenerator, CurriculumRepository, EmbeddingAdapter,
  OpenAiCompatibleLessonPlanProvider, MockLessonPlanProvider,
  {
    provide: LESSON_PLAN_PROVIDER,
    inject: [ConfigService, OpenAiCompatibleLessonPlanProvider, MockLessonPlanProvider],
    useFactory: (config: ConfigService, openAi: OpenAiCompatibleLessonPlanProvider, mock: MockLessonPlanProvider) => {
      const provider = config.get<string>('LLM_PROVIDER', 'mock')
      if (provider === 'openai-compatible') return openAi
      if (provider === 'mock') return mock
      throw new Error('LLM_PROVIDER must be mock or openai-compatible')
    },
  },
] })
export class CurriculumModule {}
