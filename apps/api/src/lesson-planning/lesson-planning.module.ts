import { Module } from '@nestjs/common'
import { CurriculumLibraryModule } from '../curriculum-library/curriculum-library.module'
import { EmbeddingModule } from '../embeddings/embedding.module'
import { LessonPlanningController } from './lesson-planning.controller'
import { LessonPlanningService } from './lesson-planning.service'
import { LlmWorkflowsModule } from './llm-workflows/llm-workflows.module'

@Module({
  imports: [CurriculumLibraryModule, EmbeddingModule, LlmWorkflowsModule],
  controllers: [LessonPlanningController],
  providers: [LessonPlanningService],
})
export class LessonPlanningModule {}
