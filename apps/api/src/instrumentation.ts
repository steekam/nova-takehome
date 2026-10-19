import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { logs } from '@opentelemetry/api-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'

const enabled = process.env.OTEL_ENABLED === 'true'
const resource = resourceFromAttributes({
  'service.name': process.env.OTEL_SERVICE_NAME ?? 'nova-api',
})
const sdk = enabled
  ? new NodeSDK({
      resource,
      traceExporter: new OTLPTraceExporter(),
      metricReaders: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
          exportIntervalMillis: 10_000,
        }),
      ],
      instrumentations: [getNodeAutoInstrumentations()],
    })
  : undefined
const logProvider = enabled
  ? new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    })
  : undefined

sdk?.start()
if (logProvider) logs.setGlobalLoggerProvider(logProvider)

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown()
  await logProvider?.shutdown()
}
