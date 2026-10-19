import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import { Observable, tap } from 'rxjs'
import { performance } from 'node:perf_hooks'
import { metrics } from '@opentelemetry/api'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { RequestIdService } from './request-id.service'
import { emitTelemetryLog } from '../telemetry-logger'

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name)
  private readonly requests = metrics.getMeter('nova-api').createCounter('api.http.requests')
  private readonly duration = metrics.getMeter('nova-api').createHistogram('api.http.request.duration', { unit: 'ms' })

  constructor(private readonly requestIds: RequestIdService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<FastifyRequest>()
    const reply = http.getResponse<FastifyReply>()
    const startedAt = performance.now()
    const log = (outcome: string, statusCode = reply.statusCode) => {
      const requestId = this.requestIds.getOrCreate(request.headers['x-request-id'])
      const durationMs = Math.round(performance.now() - startedAt)
      const route = request.routeOptions.url ?? 'unmatched'
      const attributes = { method: request.method, route, status_code: statusCode }
      this.logger.log(`${request.method} ${route} ${statusCode} ${durationMs}ms requestId=${requestId} ${outcome}`)
      emitTelemetryLog(`HTTP request ${outcome}`, SeverityNumber.INFO, { ...attributes, request_id: requestId, duration_ms: durationMs })
      this.requests.add(1, attributes)
      this.duration.record(durationMs, attributes)
    }

    return next.handle().pipe(tap({
      complete: () => log('completed'),
      error: (error: unknown) => log('failed', error instanceof HttpException ? error.getStatus() : 500),
    }))
  }
}
