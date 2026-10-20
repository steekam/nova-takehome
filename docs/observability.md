# Observability

## Local stack

Run `pnpm demo:up`. It starts the web app, API, PostgreSQL, Redis, LiteLLM, Langfuse, and the telemetry services. `pnpm demo:check` reports health and URLs.

| Tool | URL | What to inspect |
| --- | --- | --- |
| Grafana | `http://localhost:3000` | **Nova API and model telemetry** dashboard: HTTP traffic, generation outcomes and latency, deterministic QA failures, correction turns, reported cost. |
| Langfuse | `http://localhost:3002` | API and LiteLLM traces; prompt and response content capture is off by default. |
| LiteLLM | `http://localhost:4000/ui` | Proxy requests, model usage, spend and budget. |
| Prometheus | `http://localhost:9091` | API, playground and LiteLLM metrics. |
| Tempo | `http://localhost:3200` | Distributed traces. |
| Loki | `http://localhost:3100/ready` | Structured API and playground logs. |

## Product generation signals

```text
Teacher request
    │
    ▼
API generation span ── provider call span ── LiteLLM
    │                         │                 ├── traces ──┐
    ├── traces ───────────────┴──────────────────────────────┤
    ├── metrics ────────────────────────────────────────────┤
    └── logs ────────────────────────────────────────────────┤
                                                            ▼
                                                     OTEL Collector
                                                     ├── traces ── Tempo + Langfuse
                                                     ├── metrics ─ Prometheus ─ Grafana
                                                     └── logs ──── Loki
```

The API records provider attempts, failures, duration, generation outcome, total duration, correction turns, token usage when returned, and reported cost when the proxy returns `x-litellm-response-cost`. Deterministic generation checks emit pass/fail counts by stable check code. Traces include configured and response model names and usage details. Metrics use bounded labels; model, target, and request IDs stay on traces.

The QA checks verify schema, selected curriculum fields, duration, activity timing, official target citation, and citation provenance. They do not prove that each claim follows from its cited passage. A Curriculum Lead still reviews lesson quality. Lead review makes no model call, so it creates no LLM trace.

Langfuse receives API and LiteLLM traces through OTEL. API check results appear in Grafana metrics; the internal playground emits Langfuse evaluation scores and dataset records. The playground is a developer tool, not part of the teacher or Curriculum Lead workflow. LiteLLM remains the source for proxy spend; Nova's cost metric appears only when the gateway reports a cost header.

## Internal evaluation

The playground records retrieval rankings, embedding cache behavior, generation reports, advisory review results, labelled evaluations, and dataset exports. Use its [README](../apps/playground/README.md) for commands and the [telemetry runbook](playground/telemetry-runbook.md) to populate Langfuse and Grafana during development. Its evaluation results describe the small synthetic fixture; they are not broad CBC quality claims.

The system uses BGE-small with 384-dimensional pgvector embeddings. See [embedding and corpus notes](playground/embedding-corpus-guide.md) for retrieval signals and tuning.
