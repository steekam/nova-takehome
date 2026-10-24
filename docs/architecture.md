# Architecture

This page maps the running application for reviewers and contributors. The root
[README](../README.md) covers local setup and the demo flow.

See [authentication and security](security.md) for opaque cookie sessions,
capability checks, deployment requirements, and third-party source provenance.

See the [system diagram board](https://www.tldraw.com/f/bmp8NfBjhONWbeWKxZ7M9)
for zoomable entity, workflow, and service diagrams.

## Product request path

```mermaid
flowchart TB
  Teacher[Teacher] --> Browser[Browser]
  Lead[Curriculum Lead] --> Browser
  Browser --> Web[React + TanStack Router]
  Web -->|HTTP + cookie auth| API[NestJS API]
  API -->|Drizzle| PG[(PostgreSQL + pgvector)]
```

## Provider routing

```mermaid
flowchart LR
  API[NestJS API] --> Runtime[Model runtime]
  Runtime -->|mock| Mock[Deterministic mock adapter]
  Runtime -->|live| Adapter[OpenAI-compatible adapter]
  Adapter --> LiteLLM[LiteLLM proxy · full profile]
  LiteLLM -->|model alias routing| Provider[Baseten or configured provider]
```

## Embedding and retrieval

```mermaid
flowchart LR
  API[NestJS API] -->|source chunks or target query| BGE[BGE-small · local, 384 dimensions]
  BGE --> Cache[Local embedding cache]
  Cache --> PG[(PostgreSQL + pgvector)]
  PG --> Evidence[Target-scoped retrieved evidence]
  Evidence --> API
```

## Telemetry paths

```mermaid
flowchart LR
  API[NestJS AI workflows] -->|AI traces and captured prompts| SDK[Langfuse SDK]
  SDK --> LF[Langfuse · traces and prompts]
  Evals[Evaluation runner] -->|dataset export| LF
  API -->|system telemetry| Collector[OpenTelemetry Collector]
  LiteLLM[LiteLLM] -->|OpenTelemetry| Collector
  Collector --> Tempo[Tempo · traces]
  Collector --> Prom[Prometheus · metrics]
  Collector --> Loki[Loki · logs]
  Tempo --> Grafana[Grafana]
  Prom --> Grafana
  Loki --> Grafana
```

The Langfuse web and worker use shared backing services; they exchange work
through Redis queues rather than a direct web-to-worker call. The zoomable
[system diagram board](https://www.tldraw.com/f/bmp8NfBjhONWbeWKxZ7M9) shows
those services and the three database connections separately.

The default Compose configuration runs the product services and PostgreSQL.
The `full` profile adds LiteLLM, Langfuse, Redis, ClickHouse, MinIO, and the
OpenTelemetry/Grafana stack. One PostgreSQL service hosts separate Nova,
LiteLLM, and Langfuse databases. Redis serves Langfuse; the API does not use it
as an application cache. AI workflow traces go directly to Langfuse; system
telemetry goes through the Collector.

## Code boundaries

- `apps/web` owns screens, forms, routing, and typed HTTP calls.
- `apps/api` owns authentication, authorization, HTTP validation, use cases,
  database access, retrieval, model calls, and workflow transitions.
- `packages/shared` owns Zod contracts shared across the API and web app.
- `packages/model-runtime` owns provider adapters used by the API. The API owns
  embedding and retrieval behavior.
- `apps/evals` calls the API for generation and validation, then exports
  evaluation run snapshots to Langfuse. It has no duplicate product workflow.

Database table definitions live in feature-oriented files under
`apps/api/src/database/schema`. Feature repositories use Drizzle. HTTP request
and response contracts live in `packages/shared` and are used to generate the
OpenAPI description and web client types.

## Workflows

See [workflow state charts](workflow-state-charts.md) for the implemented
lesson-plan lifecycle, generation and repair path, provider retries, standalone
rubric validation, and source revision publication. The shared package defines
allowed lesson-plan transitions; review decisions reference the exact immutable
version reviewed.

See [data flows](data-flows.md) for source ingestion, grounded generation,
versioned editing, rubric validation, and human review.

## Access policy

Protected API routes require authentication and capability checks. The API
checks ownership and workflow state before it reads or changes a lesson plan.
The web app also uses role guards to route users to their workspace; those
guards do not replace API authorization.

| Action | Teacher | Curriculum Lead |
| --- | --- | --- |
| List plans | Own plans and published plans | Submitted and published plans |
| Read a plan | Own plans and published plans | Submitted and published plans |
| Generate, edit, submit | Generate plans; edit own drafts or returned plans; submit own drafts | — |
| Delete a plan | Own unreviewed drafts | — |
| Run rubric QA | Any plan the user may read | Any plan the user may read |
| Return or publish | — | Submitted plans |
| Browse curriculum library | Published catalogue and sources | Published catalogue plus draft designs and source revisions/links |
| Add and publish curriculum sources | — | Yes |
| Read runtime LLM mode | Yes | Yes |
| Change runtime LLM mode | Yes | Yes |

Source intake accepts text and metadata through the API. It creates a resource
or a draft revision of an existing resource, chunks, and target link; a
separate action publishes the link. The web library does not expose source
management. Any authenticated user can read published plans.

## Change guide

When adding a workflow, define its contract in `packages/shared`, add the API
use case and persistence path, expose it through the controller, then connect
the web screen. Keep state changes and their version/review records in one
database transaction. Add telemetry at the AI workflow boundary only for
AI-related traces; ordinary HTTP and database traces remain in OpenTelemetry.
