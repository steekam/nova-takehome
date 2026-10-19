# Observability and demo plan

## Local API telemetry

The API exports traces, metrics, and structured request/error logs over OTLP HTTP. Start the local backends with `docker compose up -d`, then start the apps with `env DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nova_hub OTEL_ENABLED=true pnpm dev`. The Collector receives OTLP on `localhost:4318`, exports traces to Tempo, metrics to Prometheus, and logs to Loki. Open Grafana at `http://localhost:3000`; Prometheus, Tempo, and Loki data sources are provisioned automatically. The API currently emits HTTP request counters, duration histograms, request logs, and exception logs. LLM traces and spend metrics remain part of the later LiteLLM integration.

Keep the responsibilities distinct so the demo answers three different questions: what did the model call cost, why did it return this plan, and what happened across the request?

| Tool | Responsibility in this app | Demo evidence |
|---|---|---|
| LiteLLM Proxy | OpenAI-compatible provider gateway, model alias, request usage/cost, and configured spend budgets | One request's model, token usage, and spend record |
| Langfuse | Versioned generation prompt, LLM trace details, and quality/grounding scores | Prompt version and trace for a generated plan; score the grounded-output fixture |
| OpenTelemetry | API and proxy traces/metrics with shared trace context | Follow one request from Nest through LiteLLM |
| Tempo | Store and explore distributed traces | The end-to-end trace in Grafana Explore |
| Prometheus | Scrape app/proxy metrics | Request count, errors, latency, and generation duration |
| Loki | Store searchable structured API/proxy logs | Filter logs by trace ID and inspect a failed generation |
| Grafana | One local dashboard and the Explore view over Prometheus, Loki, and Tempo | A short operational view during the walkthrough |

## Request path

```text
React → Nest API → retrieval → LiteLLM Proxy → model provider
          │              │             │
          └──── OpenTelemetry trace context ────┘
                         │
                OpenTelemetry Collector
                  ├── Tempo (traces)
                  ├── Langfuse (LLM traces)
                  └── Prometheus (metrics)

Nest/LiteLLM structured logs → Loki → Grafana
```

Mock mode bypasses LiteLLM and provider credentials. Real mode sends a model alias to LiteLLM; provider keys live in the proxy environment. Give LiteLLM a persistent database for spend-based budgets. Its documented budget checks rely on database spend, so a DB-less proxy cannot enforce those caps. Use a separate database for LiteLLM state, even if both databases run in the same local PostgreSQL service.

## Instrumentation rules

- Initialize Node OpenTelemetry before importing or booting Nest so HTTP/Express, PostgreSQL, and outbound HTTP instrumentations can patch their libraries.
- Use auto-instrumentation for framework and network spans where supported; add small manual spans around retrieval, prompt loading, validation, and the generation adapter.
- Propagate W3C `traceparent` from the Nest request to LiteLLM so its spans join the API trace.
- Export through one Collector pipeline, then fan out to Tempo and Langfuse. Avoid a second direct LiteLLM-to-Langfuse exporter when the Collector already exports that trace; duplicate export makes demo traces harder to read.
- Keep prompt content capture explicit. The demo uses mock curriculum and synthetic users; omit user email and other personal data from traces. Include prompt name/version, model alias, source IDs, outcome, and timing.
- Keep browser instrumentation out of this slice. The API trace covers the consequential work, while browser OpenTelemetry support is still experimental.

## Build order

1. Add LiteLLM config with one model alias, proxy key, provider key, persistent database, and a low demo budget.
2. Add Nest autoinstrumentation and confirm an API request produces an OTLP trace before wiring the LLM.
3. Add the Collector and export one trace to Tempo; attach a Grafana datasource.
4. Add the proxy to the same trace and verify context propagation.
5. Export LLM spans to Langfuse, load a versioned prompt, and score a small fixed set of grounded and ungrounded mock examples.
6. Add Prometheus metrics and Loki log collection, then make one dashboard showing latency, errors, spend, and trace links.

This is a demo layer after the core generation and access-control path. If time is tight, keep auto-instrumented API traces, LiteLLM usage/cost, and one Langfuse prompt trace; defer a polished dashboard and broader eval suite.
