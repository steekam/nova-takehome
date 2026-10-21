import { Module } from '@nestjs/common'
import { LessonPlanningRepository } from '../lesson-planning.repository'
import { LessonPlanGenerator } from './lesson-plan-generator'
import { LessonPlanRubric } from './lesson-plan-rubric'
import { LangfusePrompts } from './langfuse-prompts'
import { OpenAiCompatibleLessonPlanProvider, LESSON_PLAN_PROVIDER } from './llm-provider'
import { MockLessonPlanProvider } from './mock-lesson-plan-provider'
import { RuntimeLessonPlanProvider } from './runtime-lesson-plan-provider'
import { RuntimeLlmController } from './runtime-llm.controller'

@Module({
  controllers: [RuntimeLlmController],
  providers: [
    LessonPlanningRepository,
    LessonPlanGenerator,
    LessonPlanRubric,
    LangfusePrompts,
    OpenAiCompatibleLessonPlanProvider,
    MockLessonPlanProvider,
    RuntimeLessonPlanProvider,
    { provide: LESSON_PLAN_PROVIDER, useExisting: RuntimeLessonPlanProvider },
  ],
  exports: [LessonPlanningRepository, LessonPlanGenerator, LessonPlanRubric],
})
export class LlmWorkflowsModule {}
