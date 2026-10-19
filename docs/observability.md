# Observability and demo plan

## Local API telemetry

The API exports traces, metrics, and structured request/error logs over OTLP HTTP. Prepare local Langfuse credentials once with `node ops/langfuse/prepare-local-env.mjs`, then start services with `pnpm exec varlock run -- docker compose up -d`. Start the apps with `env DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nova_hub OTEL_ENABLED=true pnpm dev`. The Collector receives OTLP on `localhost:4318`, exports traces to Tempo and Langfuse v4, metrics to Prometheus, and logs to Loki. Open Langfuse at `http://localhost:3002` and Grafana at `http://localhost:3000`; Prometheus, Tempo, and Loki data sources are provisioned automatically. The API uses the NodeSDK W3C Trace Context propagator to extract incoming `traceparent` headers and inject context into instrumented outbound HTTP calls. Request and error logs include `request_id`, `trace_id`, and `span_id` when an active span exists. Playground spans use the same Collector path, avoiding duplicate Langfuse exports.

Keep the responsibilities distinct so the demo answers three different questions: what did the model call cost, why did it return this plan, and what happened across the request?

| Tool | Responsibility in this app | Demo evidence |
|---|---|---|
| LiteLLM Proxy | OpenAI-compatible provider gateway, model alias, usage/cost, spend budgets, and proxy spans | One request's model, token usage, provider latency, and spend record |
| Langfuse | LLM traces, generation prompt versions, deterministic scores, and LLM judge signals | Collector fan-out of API, playground, and LiteLLM spans; prompt publishing is explicit, and prompt content capture is opt-in |
| OpenTelemetry | API, playground, and proxy traces with shared trace context | Follow a playground call from retrieval through LiteLLM to Baseten |
| Tempo | Store and explore distributed traces | The end-to-end trace in Grafana Explore |
| Prometheus | Scrape app/proxy metrics | Request count, errors, latency, playground command counts, call cost, and eval scores |
| Loki | Store searchable structured API and playground logs | Filter generation, review, dataset, eval, and cost events by trace or run ID |
| Grafana | Local dashboard and Explore over Prometheus, Loki, and Tempo | Compare run cost and eval signals beside proxy spend and latency |

## Playground telemetry path

```text
Playground CLI → retrieval → LiteLLM Proxy → Baseten
       │                            │
       └────── W3C trace context ───┘
                      │
             OpenTelemetry Collector
               ├── Tempo (traces)
               ├── Langfuse (LLM traces)
               └── Prometheus (metrics)

Playground OTLP metrics → Collector → Prometheus → Grafana
LiteLLM metrics → Prometheus → Grafana
LiteLLM OTel spans → Collector → Tempo + Langfuse
```

Mock mode bypasses LiteLLM and provider credentials. Direct live mode calls Baseten. Add `--via-litellm` to route live generation or review through one of the configured model aliases. The proxy reads the Baseten key from Varlock's `.env.local`; the CLI uses a separate scoped virtual key. LiteLLM has a persistent PostgreSQL database and login role on the shared PG17 service, a $0.50/30-day playground key, and a $1/hour global spend cap. Database-backed spend is required for LiteLLM budget enforcement; its database remains isolated from Nova's application database. LiteLLM's OTel v2 callback exports spans to the Collector without prompt content. Its Prometheus callback exposes metrics through a dedicated private container listener on port 4001, leaving authentication enabled on the inference port.

Run an offline retrieval evaluation with `pnpm playground -- retrieval-eval --mock`; it writes per-query rankings, judged relevance, nDCG, Hit@1, Recall@3, top-k grounding coverage, and embedding cache counts to `.cache/playground/retrieval-evals/`. The mock embedder is a plumbing check only and its scores stay local. For embedding quality, run `pnpm playground -- retrieval-eval` to use local BGE-small. Each embedding operation has a child span with model, representation, dimensions, input count, cache hits/misses, model load time, and elapsed time; the model pipeline stays warm for the life of the CLI process. Prometheus and Grafana show BGE p95 operation/load duration and cache reuse. Retrieval evaluation creates a trace with per-representation metrics and sends nDCG, grade-2 Hit@1, and Recall@3 to Langfuse. Each live generation records deterministic verification as a Langfuse score when credentials are configured. Failed deterministic check codes appear on validation spans. `pnpm playground -- review <run-id> --live --via-litellm` runs the LLM judge against the frozen plan and source snapshot; validated advisory finding counts are attached to the generation observation. `pnpm playground -- review-eval --live --via-litellm` runs the DeepSeek judge through LiteLLM on clean and corrupted snapshots for both CBC targets. It reports accepted detections, expected evidence citations, rationale concept checks, clean-case false alarms, invalid judge outputs, usage/cost, and snapshot hashes; valid results send expected-behavior, expected-evidence, rationale, false-alarm, and schema-validity scores to the judge observation in Langfuse. Mock reviews never emit LLM-judge scores.

Export generation snapshots with `pnpm playground -- dataset export`. Replay input includes the frozen scenario, retrieved chunks, initial prompt, and schema; historical generated output and repair attempts stay in metadata. Expected output contains deterministic verification checks, not invented semantic gold labels. Export judge-evaluation cases separately with `pnpm playground -- dataset export --review-evals`; inputs contain frozen lesson/source snapshots, while expected defect, citation, and rationale labels stay in expected output. Observed judge results stay in metadata, never in the gold labels. Identical cases deduplicate across reruns; IDs include the frozen content, source snapshot, rubric, and expected labels, so revised labels remain separate items. When duplicate cases have new judge observations, export retains the latest run in metadata. Add `--sync` to create/update that dataset in Langfuse. Export and sync counts are visible on a dedicated span and in Loki. Review-eval scores in Langfuse carry case, eval-run, label-set, judge-model, provider-route, and input-hash metadata, so a trace can be tied to its labelled case. The playground invokes the judge through LiteLLM and posts its scores; Langfuse stores and displays the traces, datasets, and scores. It does not create a Langfuse experiment run through the CLI.

`pnpm playground -- costs --json` summarizes saved generation, standalone review, and per-case judge-evaluation costs by stage, provider, and model, separating provider-reported, locally estimated, missing, and non-billable calls. The same grouped summary appears in the cost command's trace and Loki event. Grafana compares review-judge detection, evidence citation, rationale, clean false-positive, and invalid-review rates by model and route beside judge-evaluation spend. Estimates are not provider invoices. This is an internal engineering report, not a user-facing feature or walkthrough step.

Unrecoverable command failures also write a classified JSON artifact under `.cache/playground/errors/`. It records command, trace ID, stage, error code, and whether retry may help. The command span and Loki event carry the same classification; Prometheus counts failures by command, stage, code, and retryability. Embedding configuration, model load, inference, invalid output, and cache persistence have separate codes. Transient model-load or inference failures get one retry; spans record retry events and total attempts. The local report remains available when Langfuse or OTLP delivery fails.

The Nest API is not routed through LiteLLM yet. After the playground workflow is accepted, the API adapter should call the same aliases and propagate W3C trace context.

## Instrumentation rules

- Initialize Node OpenTelemetry before importing or booting Nest so HTTP/Express, PostgreSQL, and outbound HTTP instrumentations can patch their libraries.
- Use auto-instrumentation for framework and network spans where supported; add small manual spans around retrieval, prompt loading, validation, and the generation adapter.
- Keep W3C `traceparent` propagation enabled so LiteLLM spans join the playground or API trace.
- The Collector fans out playground, API, and LiteLLM traces to Tempo and Langfuse, avoiding duplicate Langfuse ingestion.
- The Collector sends API and playground structured logs to Loki. Playground logs contain IDs, status, counts, timing, and cost metadata; they omit prompts and lesson content. Playground counters and histograms cover command outcomes/duration, evaluation scores, dataset item counts, call costs, and embedding latency/cache operations.
- Playground commands are short-lived processes with distinct `service.instance.id` values. Grafana uses `last_over_time` on their cumulative samples and aggregates the per-process results, so one-shot runs appear without requiring `rate()` or `increase()` samples.
- Keep prompt content capture explicit. The demo uses mock curriculum and synthetic users; omit user email and other personal data from traces. Include managed prompt name/version when used, model alias, source IDs, outcome, and timing.
- Keep browser instrumentation out of this slice. The API trace covers the consequential work, while browser OpenTelemetry support is still experimental.

## Build order

1. ✅ Configure LiteLLM with DeepSeek and GLM aliases, a scoped playground key, persistent spend storage, and demo budgets.
2. ✅ Add playground spans for retrieval, generation, review, and validation; configure LiteLLM OTEL and Prometheus callbacks.
3. ✅ Add retrieval evaluation, deterministic verification scores, labelled LLM-judge review evaluation, dataset JSONL export, and saved-run cost summaries.
4. [ ] Verify live traces, judge evaluation scores, dataset sync, Loki events, and Grafana/Prometheus signals locally before using those views as supporting evidence in the product walkthrough.

This is a demo layer after the core generation and access-control path. If time is tight, keep auto-instrumented API traces, LiteLLM usage/cost, and one Langfuse prompt trace; defer a polished dashboard and broader eval suite.

The playground commands and reports are internal validation tools. The product walkthrough should demonstrate the API-backed teacher and curriculum-lead workflows; use Langfuse, Grafana, and LiteLLM views as supporting evidence for traces, judge scores, dataset snapshots, and cost. Use the [internal telemetry runbook](playground/telemetry-runbook.md) to populate those views during development. Each new API generation/review slice should add span/log/metric fields and saved evaluation evidence. Keep aggregate costs grouped by stage/provider/model.
