import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { logs } from '@opentelemetry/api-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { isDefaultExportSpan, LangfuseSpanProcessor } from '@langfuse/otel'

const enabled = process.env.OTEL_ENABLED === 'true'
const langfuseCredentials = Boolean(
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY,
)
const resource = resourceFromAttributes({
  'service.name': process.env.OTEL_SERVICE_NAME ?? 'nova-api',
})
const spanProcessors = [
  ...(enabled ? [new BatchSpanProcessor(new OTLPTraceExporter())] : []),
  ...(langfuseCredentials
    ? [
        new LangfuseSpanProcessor({
          baseUrl: process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST,
          shouldExportSpan: ({ otelSpan }) =>
            isDefaultExportSpan(otelSpan) ||
            (otelSpan.instrumentationScope.name === 'nova-api-curriculum' &&
              otelSpan.name.startsWith('curriculum.lesson_plan.')),
        }),
      ]
    : []),
]
const sdk =
  enabled || langfuseCredentials
    ? new NodeSDK({
        resource,
        spanProcessors,
        metricReaders: enabled
          ? [
              new PeriodicExportingMetricReader({
                exporter: new OTLPMetricExporter(),
                exportIntervalMillis: 10_000,
              }),
            ]
          : [],
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
            '@opentelemetry/instrumentation-dns': { enabled: false },
            '@opentelemetry/instrumentation-net': { enabled: false },
          }),
        ],
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
