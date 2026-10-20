# Observability

## Local stack

Run `pnpm demo:up`. It starts the web app, API, PostgreSQL, Redis, LiteLLM, Langfuse, and the telemetry services. `pnpm demo:check` reports health and URLs.

| Tool | URL | What to inspect |
| --- | --- | --- |
| Grafana | `http://localhost:3000` | **Nova API and model telemetry** dashboard: HTTP traffic, generation outcomes and latency, deterministic QA failures, correction turns, reported cost. |
| Langfuse | `http://localhost:3002` | Lesson-plan AI workflow and model-call traces; prompt and response capture is off by default. |
| LiteLLM | `http://localhost:4000/ui` | Proxy requests, model usage, spend and budget. |
| Prometheus | `http://localhost:9091` | API, playground and LiteLLM metrics. |
| Tempo | `http://localhost:3200` | Distributed traces. |
| Loki | `http://localhost:3100/ready` | Structured API and playground logs. |

## Prompt management

`pnpm demo:up` creates the generation and rubric prompts in Langfuse when they are missing, using their initial source in [prompt-definitions.ts](../apps/api/src/lesson-planning/prompt-definitions.ts). Startup leaves existing Langfuse prompts alone so UI edits remain in control. Run `pnpm langfuse:prompts:sync` to add any missing prompt. To publish code-defined prompt changes deliberately, run `pnpm langfuse:prompts:publish`.

The API fetches each prompt by `LANGFUSE_PROMPT_LABEL` (default `production`), with SDK caching. Langfuse shows the prompt name and version on the matching model generation, so prompt metrics and evals can be grouped by version. Each prompt's Langfuse config can set its LiteLLM model alias; this takes precedence over `LLM_GENERATOR_MODEL` or `LLM_REVIEWER_MODEL`. Change `model` to `lesson-planner` (DeepSeek) or `lesson-planner-glm` (GLM) to compare models, then publish a prompt edit to a separate Langfuse label to compare versions without changing code. The initial prompts ship with the `production` label and use `lesson-planner`.

If prompt management is disabled or credentials are missing, the API uses the source prompts. If Langfuse cannot serve a prompt, its SDK fallback serves the source text; fallback use is marked on the trace. Prompt bodies in traces still depend on `LANGFUSE_CAPTURE_PROMPTS`.

## Product generation signals

```text
Teacher request
    │
    ▼
API generation span ── provider call span ── LiteLLM
    │                         │
    ├── AI workflow ── Langfuse SDK ── Langfuse
    ├── all traces ──┐
    ├── metrics ─────┤
    └── logs ────────┤
                     ▼
              OTEL Collector
              ├── traces ── Tempo
              ├── metrics ─ Prometheus ─ Grafana
              └── logs ──── Loki
```

The API records provider attempts, failures, duration, generation outcome, total duration, correction turns, token usage when returned, and reported cost when the proxy returns `x-litellm-response-cost`. Deterministic generation checks emit pass/fail counts by stable check code. Traces include configured and response model names and usage details. Metrics use bounded labels; model, target, and request IDs stay on traces.

The API generation trace contains the `curriculum.lesson_plan.workflow.generate` span with target resolution, query embedding, retrieval, model generation, deterministic QA results, and persistence. When `LANGFUSE_CAPTURE_PROMPTS=true`, the workflow and model spans set separate Langfuse input/output fields: request parameters, curriculum target and retrieved excerpts, model messages, generated plan, and deterministic QA results. The local `.env.local` enables capture for this development stack; `.env.schema` keeps it off by default. Restart the API after changing it.

The QA checks verify schema, selected curriculum fields, duration, activity timing, official target citation, and citation provenance. They do not prove that each claim follows from its cited passage. A Curriculum Lead still reviews lesson quality. Lead review makes no model call, so it creates no LLM trace.

Langfuse receives lesson-plan AI workflow and model-call spans through its SDK. Generation and rubric prompts are Langfuse-managed and linked to their model generation observations. API check results appear in Grafana metrics; the internal playground emits Langfuse evaluation scores and dataset records. The playground is a developer tool, not part of the teacher or Curriculum Lead workflow. LiteLLM remains the source for proxy spend; Nova's cost metric appears only when the gateway reports a cost header.

## Internal evaluation

The playground records retrieval rankings, embedding cache behavior, generation reports, advisory review results, labelled evaluations, and dataset exports. Use its [README](../apps/playground/README.md) for commands and the [telemetry runbook](playground/telemetry-runbook.md) to populate Langfuse and Grafana during development. Its evaluation results describe the small synthetic fixture; they are not broad CBC quality claims.

The system uses BGE-small with 384-dimensional pgvector embeddings. See [embedding and corpus notes](playground/embedding-corpus-guide.md) for retrieval signals and tuning.
## Telemetry routing

The API's Langfuse SDK processor exports its own observations, GenAI spans, and the named `curriculum.lesson_plan.*` workflow spans directly to Langfuse. The OpenTelemetry Collector sends the full trace stream to Tempo. HTTP, Nest, database, and unrelated service spans stay in Tempo. Metrics still go to Prometheus; logs still go to Loki.

API request IDs are accepted from `X-Request-Id` (or generated), returned in the response header, attached to Langfuse observations as `metadata.requestId`, and forwarded to the model endpoint as `X-Request-Id`. Langfuse metadata and baggage propagate within the workflow and outbound call. Incoming W3C trace context remains the trace ID, linking API, AI spans, and provider calls across services. Look up the Langfuse trace by request ID metadata or its W3C trace ID.

This follows Langfuse's [TypeScript SDK instrumentation guidance](https://langfuse.com/docs/observability/sdk/instrumentation) and [trace ID guidance](https://langfuse.com/docs/observability/features/trace-ids-and-distributed-tracing). The SDK's default span filter is extended only for this API's named lesson-plan workflow spans. A valid incoming W3C trace ID remains the distributed trace ID; the external request ID is propagated as searchable metadata and baggage.

`LLM_MAX_OUTPUT_TOKENS` controls the requested model output limit. It defaults to 8192 and accepts integers from 1 to 16384. The 1M-token DeepSeek context window describes input context, not response output; this setting controls the response ceiling.
