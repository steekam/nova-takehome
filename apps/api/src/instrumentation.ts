import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { type MetricReader, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { logs } from '@opentelemetry/api-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { LangfuseSpanProcessor } from '@langfuse/otel'

const otelEnabled = process.env.OTEL_ENABLED === 'true'
const langfuseEnabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
const resource = resourceFromAttributes({
  'service.name': process.env.OTEL_SERVICE_NAME ?? 'nova-api',
})
const spanProcessors: SpanProcessor[] = []
const metricReaders: MetricReader[] = []

if (otelEnabled) {
  spanProcessors.push(new BatchSpanProcessor(new OTLPTraceExporter()))
  metricReaders.push(
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 10_000,
    }),
  )
}

if (langfuseEnabled) {
  spanProcessors.push(
    new LangfuseSpanProcessor({
      baseUrl: process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST,
      shouldExportSpan: ({ otelSpan }) => otelSpan.instrumentationScope.name === 'langfuse-sdk',
    }),
  )
}

let sdk: NodeSDK | undefined
if (otelEnabled || langfuseEnabled) {
  sdk = new NodeSDK({
    resource,
    spanProcessors,
    metricReaders,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  })
}

let logProvider: LoggerProvider | undefined
if (otelEnabled) {
  logProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
  })
}

sdk?.start()
if (logProvider) logs.setGlobalLoggerProvider(logProvider)

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown()
  await logProvider?.shutdown()
}
