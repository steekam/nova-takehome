import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import {
  CurriculumLibraryResponseSchema,
  CurriculumLibraryDesignResponseSchema,
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
  ValidateLessonPlanRequestSchema,
  LessonPlanRubricQaResponseSchema,
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
    .addCookieAuth(process.env.NODE_ENV === 'production' ? '__Host-nova_access' : 'nova_access')
    .addSecurityRequirements('cookie')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  for (const route of Object.values(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const) {
      const operation = route?.[method]
      if (!operation) continue
      if (
        operation.operationId?.startsWith('HealthController_') ||
        operation.operationId === 'AuthController_login' ||
        operation.operationId === 'AuthController_logout'
      )
        operation.security = []
    }
  }
  document.components ??= {}
  document.components.schemas = {
    ...document.components.schemas,
    CurriculumLibrary: toOpenApiSchema(CurriculumLibraryResponseSchema),
    CurriculumLibraryDesign: toOpenApiSchema(CurriculumLibraryDesignResponseSchema),
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
    ValidateLessonPlanRequest: toOpenApiSchema(ValidateLessonPlanRequestSchema),
    LessonPlanRubricQaResponse: toOpenApiSchema(LessonPlanRubricQaResponseSchema),
    ReviewLessonPlanRequest: toOpenApiSchema(ReviewLessonPlanRequestSchema),
    RuntimeLlmModeRequest: toOpenApiSchema(RuntimeLlmModeRequestSchema),
    RuntimeLlmModeStatus: toOpenApiSchema(RuntimeLlmModeStatusSchema),
    ValidationErrorResponse: toOpenApiSchema(ValidationErrorResponseSchema),
    ApiErrorResponse: toOpenApiSchema(ApiErrorResponseSchema),
  }
  return document
}
