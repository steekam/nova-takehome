# Observability

Use Langfuse to inspect AI workflow runs. Use OpenTelemetry and Grafana to inspect service health. LiteLLM shows model routing, spend, and budgets.

## Open the tools

Start the full profile and print service URLs and health:

```sh
pnpm demo:full
pnpm demo:check:full
```

The check command prints the Langfuse login. The account is `admin@example.test`; its generated password is in `.env.local`. Lite mode (`pnpm demo:up`) skips telemetry services. `pnpm demo:down` stops services and keeps their data.

| Tool | URL | Use it for |
| --- | --- | --- |
| Langfuse | [localhost:3002](http://localhost:3002) | AI traces, captured prompts, model inputs/outputs, rubric results |
| LiteLLM | [localhost:4000/ui](http://localhost:4000/ui) | Provider routing, usage, spend, budgets |
| Grafana | [localhost:3000](http://localhost:3000) | Request volume, latency, generation outcomes, QA checks, tokens, reported cost |
| Prometheus | [localhost:9091](http://localhost:9091) | API and provider metrics |
| Tempo | [localhost:3200](http://localhost:3200) | OpenTelemetry traces |
| Loki | [localhost:3100/ready](http://localhost:3100/ready) | Log service readiness |

## Signal routing

| Signal | Route |
| --- | --- |
| AI workflow observations | API → Langfuse SDK → Langfuse |
| API and proxy traces | API/LiteLLM → OpenTelemetry Collector → Tempo |
| API metrics and logs | API → Collector → Prometheus/Grafana and Loki |
| Proxy metrics | LiteLLM → Prometheus → Grafana |

## Follow a generation run

The API sends AI workflow observations directly to Langfuse. Ordinary API and infrastructure telemetry goes through the OpenTelemetry Collector.

The API registers Langfuse's span processor when Langfuse credentials are present. Its allowlist is the `langfuse-sdk` instrumentation scope; the OTLP exporter sends API traces to the Collector independently.

```text
curriculum.lesson_plan.workflow.generate
├── curriculum.lesson_plan.target.resolve
├── curriculum.lesson_plan.embedding.query
├── curriculum.lesson_plan.retrieval
├── curriculum.lesson_plan.generate
│   ├── nova.llm.provider.call (per model attempt)
│   └── curriculum.lesson_plan.validation (per output check)
├── curriculum.lesson_plan.persistence
└── curriculum.lesson_plan.qa.rubric
    └── nova.llm.provider.call (per model attempt)
```

The root records the target, duration, request ID, and workflow result. With prompt capture on, the generation observation includes retrieved context, model input/output, and deterministic check results. It also records repair attempts, token usage, and reported cost. Rubric QA records the plan version, rubric and prompt versions, reviewer model, and status; captured output includes scores, evidence, and suggestions. Standalone validation starts its own rubric trace.

Request IDs are searchable in Langfuse and reach the provider as `X-Request-Id`. W3C trace context correlates service spans. High-cardinality IDs stay on traces; metrics use bounded labels.

## Prompts and capture

The API uses Langfuse prompts `nova-lesson-plan-generate` and `nova-lesson-plan-rubric-review`. `LANGFUSE_PROMPT_LABEL` selects the label; the default is `production`. A prompt's model config can select a LiteLLM alias; the synced prompts use `lesson-planner`. Otherwise, the API uses its configured generator or reviewer model. For a direct provider endpoint, disable managed prompts or set each prompt's model config to a valid provider model. If managed prompts are unavailable, the API falls back to source-controlled prompts.

The full demo creates missing prompts without replacing edits. Sync missing prompts or publish code-defined changes with:

```sh
pnpm langfuse:prompts:sync
pnpm langfuse:prompts:publish
```

Prompt input/output capture defaults to `LANGFUSE_CAPTURE_PROMPTS=true`. Captured values can contain curriculum excerpts and lesson content. Turn capture off in `.env.local` when needed:

```dotenv
LANGFUSE_CAPTURE_PROMPTS=false
```

Deterministic QA checks schema, requested duration, target, and citation provenance. Activity-time totals are advisory warnings. Rubric QA also gives advisory feedback; the Curriculum Lead decides whether to publish.
