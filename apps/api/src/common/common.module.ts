import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { ApiExceptionFilter } from './api-exception.filter'
import { RequestIdService } from './request-id.service'
import { RequestLoggingInterceptor } from './request-logging.interceptor'
import {
  CurriculumSourcePolicy,
  LessonPlanPolicy,
  RoutePolicy,
  RuntimeLlmPolicy,
} from './auth/policies'
import { PolicyAuditService } from './security/policy-audit.service'

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    PolicyAuditService,
    ApiExceptionFilter,
    RequestIdService,
    RequestLoggingInterceptor,
    CurriculumSourcePolicy,
    LessonPlanPolicy,
    RoutePolicy,
    RuntimeLlmPolicy,
  ],
  exports: [
    ApiExceptionFilter,
    RequestIdService,
    RequestLoggingInterceptor,
    CurriculumSourcePolicy,
    LessonPlanPolicy,
    RoutePolicy,
    RuntimeLlmPolicy,
  ],
})
export class CommonModule {}
