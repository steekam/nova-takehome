# Nova Curriculum Hub

Full-stack CBC lesson-planning task. Teachers generate a grounded draft, edit and submit it; a curriculum lead returns it with feedback or publishes it.

## Stack

- `apps/web`: React, TypeScript, TanStack Router.
- `apps/api`: NestJS, TypeScript, Fastify, Drizzle, PostgreSQL + pgvector.
- `packages/shared`: lesson-plan schemas and transport types.
- `apps/playground`: internal corpus, retrieval, generation, review, and evaluation CLI. It is not part of the product walkthrough.
- LiteLLM, Langfuse, OpenTelemetry, Collector, Grafana, Tempo, Prometheus, and Loki support local verification and telemetry.

See [architecture](docs/architecture.md), [observability setup](docs/observability.md), [the reviewer checklist](docs/performance-checklist.md), and the [shared data-service migration record](docs/local-state-migration.md).

## Run locally

Use Node 24 with `nvm install && nvm use` or `mise install`. Install packages with `pnpm install`. Varlock reads `.env.schema` plus ignored `.env.local`; `pnpm exec varlock load` validates the configuration without printing secrets.

Prepare local secrets and start PostgreSQL, Redis, LiteLLM, and observability services with `pnpm local:prepare` and `pnpm exec varlock run -- docker compose --profile litellm up -d`. Apply the schema and seed local accounts/corpus:

```sh
pnpm db:migrate
env NODE_ENV=development pnpm db:seed
```

The seed is additive and creates two demo accounts, both with password `NovaLocal123!`:

- `teacher@example.test`
- `curriculum-lead@example.test`

Run `pnpm dev`. Mock generation is the default, so no model key is needed. For LiteLLM-backed generation, set `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL=http://localhost:4000/v1`, `LLM_MODEL=lesson-planner`, and `LLM_API_KEY` in `.env.local`. Provider credentials stay server-side.

## Workflow rules

The API enforces these transitions:

```text
Draft --submit after QA--> Submitted --lead returns with feedback--> Returned --teacher edit--> Draft
                                      `--lead publishes------------> Published
```

Returned plans require resubmission after an edit. Published plans are read-only. Each teacher edit creates an immutable version. Submit checks the shared lesson schema, activity-time totals, and citations against existing curriculum chunks and the plan's original retrieval candidates. Invalid transitions return `409 PLAN_TRANSITION_INVALID`; QA failures return `422 LESSON_PLAN_QA_FAILED` with the failed checks. See [the full state and error rules](docs/architecture.md#lesson-plan-workflow).

## Internal playground

The internal playground supports corpus, retrieval, generation, review, and evaluation work. It is excluded from the product walkthrough. See [apps/playground/README.md](apps/playground/README.md).

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` covers playground behavior and API workflow/role invariants. Verified behavior and remaining work are tracked in [performance-checklist.md](docs/performance-checklist.md).
