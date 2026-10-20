import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { RequestIdService } from './request-id.service'
import { emitTelemetryLog, getTraceCorrelation } from '../telemetry-logger'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { ValidationIssue } from './validation-errors'

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  constructor(private readonly requestIds: RequestIdService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<FastifyRequest>()
    const reply = context.getResponse<FastifyReply>()
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const message = status >= 500 && !this.hasStableErrorCode(exception) ? 'Internal server error' : this.getMessage(exception)
    const requestId = this.requestIds.getOrCreate(request.headers['x-request-id'])

    if (status >= 500) {
      const trace = getTraceCorrelation()
      const traceFields = trace.trace_id ? ` traceId=${trace.trace_id} spanId=${trace.span_id}` : ''
      this.logger.error(`${request.method} ${request.url} failed requestId=${requestId}${traceFields}`, exception instanceof Error ? exception.stack : undefined)
    }
    emitTelemetryLog('HTTP request failed', status >= 500 ? SeverityNumber.ERROR : SeverityNumber.WARN, {
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched',
      status_code: status,
      request_id: requestId,
    })

    const body: Record<string, unknown> = { statusCode: status, message, requestId }
    const response = exception instanceof HttpException ? exception.getResponse() : undefined
    if (status < 500 && typeof response === 'object' && response !== null && 'code' in response) {
      if (typeof response.code === 'string' && this.isClientErrorCode(response.code)) body.code = response.code
      if (response.code === 'VALIDATION_ERROR' && 'errors' in response && this.isValidationIssues(response.errors)) {
        body.errors = response.errors
      } else if (response.code === 'LESSON_PLAN_QA_FAILED' && 'errors' in response && this.isLessonPlanIssues(response.errors)) {
        body.errors = response.errors
      }
    }
    if (this.hasStableErrorCode(exception)) {
      const providerResponse = exception.getResponse()
      if (typeof providerResponse === 'object' && providerResponse !== null && 'code' in providerResponse && typeof providerResponse.code === 'string') {
        body.code = providerResponse.code
      }
    }

    reply.status(status).send(body)
  }

  private getMessage(exception: unknown): string | string[] {
    if (!(exception instanceof HttpException)) return 'Request failed'
    const response = exception.getResponse()
    if (typeof response === 'string') return response
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = response.message
      if (typeof message === 'string' || Array.isArray(message)) return message as string | string[]
    }
    return exception.message
  }

  private hasStableErrorCode(exception: unknown): exception is HttpException {
    if (!(exception instanceof HttpException)) return false
    const response = exception.getResponse()
    return typeof response === 'object' && response !== null && 'code' in response &&
      typeof response.code === 'string' && /^(LLM_(PROVIDER_|INVALID_RESPONSE|CREDENTIALS_MISSING)|EMBEDDING_)/.test(response.code)
  }

  private isClientErrorCode(code: string) {
    return /^[A-Z][A-Z0-9_]{2,63}$/.test(code)
  }

  private isValidationIssues(value: unknown): value is ValidationIssue[] {
    return Array.isArray(value) && value.every((issue) =>
      typeof issue === 'object' &&
      issue !== null &&
      'field' in issue &&
      typeof issue.field === 'string' &&
      'constraints' in issue &&
      this.isStringArray(issue.constraints),
    )
  }

  private isLessonPlanIssues(value: unknown): value is { field: string; message: string }[] {
    return Array.isArray(value) && value.every((issue) => typeof issue === 'object' && issue !== null &&
      'field' in issue && typeof issue.field === 'string' && 'message' in issue && typeof issue.message === 'string')
  }

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string')
  }
}
