import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { context, isSpanContextValid, trace } from '@opentelemetry/api'

const logger = logs.getLogger('nova-api')

export function getTraceCorrelation(): Record<string, string> {
  const spanContext = trace.getSpan(context.active())?.spanContext()
  if (!spanContext || !isSpanContextValid(spanContext)) return {}
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId }
}

export function emitTelemetryLog(
  message: string,
  severityNumber: SeverityNumber,
  attributes: Record<string, string | number>,
): void {
  logger.emit({
    body: message,
    severityNumber,
    attributes: { ...getTraceCorrelation(), ...attributes },
  })
}
