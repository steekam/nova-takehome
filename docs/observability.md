# Observability

This page explains where to inspect lesson-plan AI runs and system health. Run
`pnpm demo:up` to start the local stack and `pnpm demo:check` to print its
health and URLs.

## Where signals go

```mermaid
flowchart LR
  API[API] -->|AI workflow spans| Langfuse[Langfuse SDK → Langfuse]
  API -->|traces| Collector[OpenTelemetry Collector]
  API -->|metrics and logs| Collector
  Collector --> Tempo[Tempo: traces]
  Collector --> Prom[Prometheus: metrics]
  Collector --> Loki[Loki: logs]
  Prom --> Grafana[Grafana dashboards]
  Proxy[LiteLLM] --> Prom
```

Langfuse receives lesson-plan generation and rubric-QA traces through its SDK.
The Collector sends distributed traces to Tempo, metrics to Prometheus, and
structured logs to Loki. Grafana displays metrics. LiteLLM reports provider
usage, cost, and budgets for proxied calls.

`pnpm demo:check` prints service URLs. The default local endpoints include
Grafana at `http://localhost:3000`, Langfuse at `http://localhost:3002`,
LiteLLM at `http://localhost:4000/ui`, Prometheus at
`http://localhost:9091`, Tempo at `http://localhost:3200`, and Loki at
`http://localhost:3100/ready`.

## AI workflow trace

Generation creates a `curriculum.lesson_plan.generate` Langfuse trace. It
records the selected target, retrieved source context, model request and
response, deterministic checks, correction attempt, usage, reported cost, and
final result. Rubric validation uses a separate
`curriculum.lesson_plan.qa.rubric` trace and records the exact plan version,
rubric/prompt versions, reviewer model, structured result, and status.

Request IDs propagate as searchable Langfuse metadata and to the provider as
`X-Request-Id`. W3C trace context preserves distributed trace correlation.
Provider attempts, retry outcomes, latency, token counts, and reported cost
also feed bounded-cardinality metrics. Plan IDs, target IDs, and request IDs
stay on traces rather than metric labels.

Prompt input/output capture is controlled by `LANGFUSE_CAPTURE_PROMPTS`.
Prompt bodies can contain curriculum excerpts and generated lesson content;
enable capture only in a suitable development environment. The default
`.env.schema` setting is off.

## Prompt management

The API uses Langfuse prompts named `nova-lesson-plan-generate` and
`nova-lesson-plan-rubric-review`. `LANGFUSE_PROMPT_LABEL` selects the label,
which defaults to `production`. The prompt's Langfuse model config can select
the LiteLLM model alias; otherwise the API uses its configured generator or
reviewer model.

`pnpm demo:up` creates missing prompts without overwriting existing edits. Use
`pnpm langfuse:prompts:sync` to add missing prompts. Use
`pnpm langfuse:prompts:publish` to publish code-defined prompt changes. If
managed prompts are disabled or unavailable, the API uses its source prompt
fallback.

## Reading the signals

- Use Langfuse to inspect prompt versions, model inputs and outputs, rubric
  results, and workflow failures.
- Use LiteLLM to inspect proxy spend, model routing, and budgets.
- Use Grafana to compare request volume, latency, generation outcomes, QA
  failures, correction attempts, tokens, and reported cost.
- Use Tempo for API and infrastructure spans outside the AI-specific Langfuse
  view; use Loki for correlated service logs.

Deterministic QA verifies structure, target, timing, and citation provenance.
Rubric QA offers model-generated guidance; it does not decide whether a plan
can be submitted or published. Human Curriculum Lead review remains the
publication decision.
