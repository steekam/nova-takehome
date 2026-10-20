import { Module } from '@nestjs/common'
import { CurriculumLibraryModule } from '../curriculum-library/curriculum-library.module'
import { EmbeddingModule } from '../embeddings/embedding.module'
import { LessonPlanningController } from './lesson-planning.controller'
import { LessonPlanningRepository } from './lesson-planning.repository'
import { LessonPlanningService } from './lesson-planning.service'
import { LessonPlanGenerator } from './lesson-plan-generator'
import { OpenAiCompatibleLessonPlanProvider, LESSON_PLAN_PROVIDER } from './llm-provider'
import { MockLessonPlanProvider } from './mock-lesson-plan-provider'
import { RuntimeLessonPlanProvider } from './runtime-lesson-plan-provider'
import { RuntimeLlmController } from './runtime-llm.controller'
import { LessonPlanRubric } from './lesson-plan-rubric'
import { LangfusePrompts } from './langfuse-prompts'

@Module({
  imports: [CurriculumLibraryModule, EmbeddingModule],
  controllers: [LessonPlanningController, RuntimeLlmController],
  providers: [
    LessonPlanningService,
    LessonPlanningRepository,
    LessonPlanGenerator,
    LessonPlanRubric,
    LangfusePrompts,
    OpenAiCompatibleLessonPlanProvider,
    MockLessonPlanProvider,
    RuntimeLessonPlanProvider,
    { provide: LESSON_PLAN_PROVIDER, useExisting: RuntimeLessonPlanProvider },
  ],
})
export class LessonPlanningModule {}
