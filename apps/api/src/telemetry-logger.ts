import { logs, SeverityNumber } from '@opentelemetry/api-logs'

const logger = logs.getLogger('nova-api')

export function emitTelemetryLog(
  message: string,
  severityNumber: SeverityNumber,
  attributes: Record<string, string | number>,
): void {
  logger.emit({ body: message, severityNumber, attributes })
}
