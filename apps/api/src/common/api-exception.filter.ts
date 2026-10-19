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
    const message = status >= 500 ? 'Internal server error' : this.getMessage(exception)
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
      if (response.code === 'VALIDATION_ERROR' && 'errors' in response && this.isValidationIssues(response.errors)) {
        body.code = response.code
        body.errors = response.errors
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

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string')
  }
}
