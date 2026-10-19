import { Global, Module } from '@nestjs/common'
import { ApiExceptionFilter } from './api-exception.filter'
import { RequestIdService } from './request-id.service'
import { RequestLoggingInterceptor } from './request-logging.interceptor'
import { RolesGuard } from './auth/roles.guard'
import { PermissionsGuard } from './auth/permissions.guard'

@Global()
@Module({
  providers: [ApiExceptionFilter, RequestIdService, RequestLoggingInterceptor, RolesGuard, PermissionsGuard],
  exports: [ApiExceptionFilter, RequestIdService, RequestLoggingInterceptor, RolesGuard, PermissionsGuard],
})
export class CommonModule {}
