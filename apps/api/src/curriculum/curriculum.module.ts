import { Module } from '@nestjs/common'
import { CurriculumController } from './curriculum.controller'
import { CurriculumLibraryController } from './curriculum-library.controller'
import { CurriculumLibraryService } from './curriculum-library.service'
import { CurriculumLibraryRepository } from './curriculum-library.repository'
import { CurriculumService } from './curriculum.service'
import { LessonPlanGenerator } from './lesson-plan-generator'
import { CurriculumRepository } from './curriculum.repository'
import { EmbeddingAdapter } from './embedding.service'
import { LESSON_PLAN_PROVIDER, OpenAiCompatibleLessonPlanProvider } from './llm-provider'
import { MockLessonPlanProvider } from './mock-lesson-plan-provider'
import { RuntimeLessonPlanProvider } from './runtime-lesson-plan-provider'
import { RuntimeLlmController } from './runtime-llm.controller'

@Module({ controllers: [CurriculumController, CurriculumLibraryController, RuntimeLlmController], providers: [
  CurriculumService, CurriculumLibraryService, CurriculumLibraryRepository, LessonPlanGenerator, CurriculumRepository, EmbeddingAdapter,
  OpenAiCompatibleLessonPlanProvider, MockLessonPlanProvider, RuntimeLessonPlanProvider,
  {
    provide: LESSON_PLAN_PROVIDER,
    useExisting: RuntimeLessonPlanProvider,
  },
] })
export class CurriculumModule {}
