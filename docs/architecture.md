# Code organization

```text
apps/
  api/       NestJS HTTP boundary, auth, curriculum, generation, workflow, Drizzle
  web/       React screens and TanStack Router routes
packages/
  shared/    Lesson-plan schemas and types shared by the browser and API
docs/        Architecture notes, observability plan, and reviewer checklist
ops/         Local LiteLLM and telemetry stack configuration (to be added)
```

## Boundaries

- `apps/web` owns navigation, forms, and presentation. It never decides access or workflow permissions.
- `apps/api` owns authentication, role checks, data access, retrieval, generation, validation, versioning, and workflow transitions.
- `packages/shared` owns transport-safe schemas and types. The API validates generated and submitted lesson-plan content with the shared Zod schema.
- Drizzle schema lives in `apps/api/src/database/schema.ts`; migrations are generated into `apps/api/drizzle/`.
- The API is the only service that calls the model gateway. Provider credentials stay with LiteLLM; the browser never receives them.

## Generation path

Teacher request → API retrieves curriculum chunks → generation adapter calls the configured LLM or deterministic mock → API validates the plan and its source references → teacher reviews and edits. Review and publishing are human workflow steps; the brief does not ask AI to edit or approve plans.

Embeddings are represented as numeric arrays in PostgreSQL JSONB for the initial slice. Retrieval can compare them in the API without requiring a PostgreSQL vector extension. Keep the embedding and generation providers behind separate server-side adapters.

## Observability boundary

The Nest API and LiteLLM proxy emit OpenTelemetry signals. An OpenTelemetry Collector can fan out traces to Tempo and Langfuse; Prometheus scrapes metrics, and Loki stores structured logs. Langfuse owns prompt versions and evaluation scores. LiteLLM owns provider routing, usage, cost, and budget enforcement. See [observability.md](observability.md) for the proposed local/demo flow and its setup order.
