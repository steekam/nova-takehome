import { Global, Module } from '@nestjs/common'
import { ApiExceptionFilter } from './api-exception.filter'
import { RequestIdService } from './request-id.service'
import { RequestLoggingInterceptor } from './request-logging.interceptor'

@Global()
@Module({
  providers: [ApiExceptionFilter, RequestIdService, RequestLoggingInterceptor],
  exports: [ApiExceptionFilter, RequestIdService, RequestLoggingInterceptor],
})
export class CommonModule {}
