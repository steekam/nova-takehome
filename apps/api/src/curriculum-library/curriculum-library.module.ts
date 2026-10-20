import { Module } from '@nestjs/common'
import { EmbeddingModule } from '../embeddings/embedding.module'
import { CurriculumLibraryController } from './curriculum-library.controller'
import { CurriculumLibraryRepository } from './curriculum-library.repository'
import { CurriculumLibraryService } from './curriculum-library.service'

@Module({
  imports: [EmbeddingModule],
  controllers: [CurriculumLibraryController],
  providers: [CurriculumLibraryService, CurriculumLibraryRepository],
  exports: [CurriculumLibraryService],
})
export class CurriculumLibraryModule {}
