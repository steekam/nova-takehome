import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import {
  CurriculumLibraryResponseSchema,
  CurriculumLibrarySourceInputSchema,
  CurriculumLibraryTargetResponseSchema,
  CurriculumOutcomesResponseSchema,
  CurriculumSourcesResponseSchema,
  CurriculumSourceLinkResultSchema,
  ApiErrorResponseSchema,
  EditLessonPlanRequestSchema,
  GenerateLessonPlanRequestSchema,
  LessonPlanContentSchema,
  LessonPlanDetailsResponseSchema,
  LessonPlanListResponseSchema,
  LessonPlanResponseSchema,
  LessonPlanReviewResponseSchema,
  LessonPlanVersionDtoSchema,
  ReviewLessonPlanRequestSchema,
  RuntimeLlmModeRequestSchema,
  RuntimeLlmModeStatusSchema,
  ValidationErrorResponseSchema,
} from '@nova/shared'
import { toOpenApiSchema } from './common/validation/openapi-schema'

export function createApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Nova Curriculum Hub API')
    .setDescription('API for grounded lesson planning and curriculum review.')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  document.components ??= {}
  document.components.schemas = {
    ...document.components.schemas,
    CurriculumLibrary: toOpenApiSchema(CurriculumLibraryResponseSchema),
    CurriculumLibraryTarget: toOpenApiSchema(CurriculumLibraryTargetResponseSchema),
    CurriculumOutcomesResponse: toOpenApiSchema(CurriculumOutcomesResponseSchema),
    CurriculumSourcesResponse: toOpenApiSchema(CurriculumSourcesResponseSchema),
    CurriculumSourceInput: toOpenApiSchema(CurriculumLibrarySourceInputSchema),
    CurriculumSourceLinkResult: toOpenApiSchema(CurriculumSourceLinkResultSchema),
    EditLessonPlanRequest: toOpenApiSchema(EditLessonPlanRequestSchema),
    GenerateLessonPlanRequest: toOpenApiSchema(GenerateLessonPlanRequestSchema),
    LessonPlanContent: toOpenApiSchema(LessonPlanContentSchema),
    LessonPlanDetailsResponse: toOpenApiSchema(LessonPlanDetailsResponseSchema),
    LessonPlanListResponse: toOpenApiSchema(LessonPlanListResponseSchema),
    LessonPlanResponse: toOpenApiSchema(LessonPlanResponseSchema),
    LessonPlanReviewResponse: toOpenApiSchema(LessonPlanReviewResponseSchema),
    LessonPlanVersion: toOpenApiSchema(LessonPlanVersionDtoSchema),
    ReviewLessonPlanRequest: toOpenApiSchema(ReviewLessonPlanRequestSchema),
    RuntimeLlmModeRequest: toOpenApiSchema(RuntimeLlmModeRequestSchema),
    RuntimeLlmModeStatus: toOpenApiSchema(RuntimeLlmModeStatusSchema),
    ValidationErrorResponse: toOpenApiSchema(ValidationErrorResponseSchema),
    ApiErrorResponse: toOpenApiSchema(ApiErrorResponseSchema),
  }
  return document
}
