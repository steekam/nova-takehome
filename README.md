# Curriculum Design Hub

Full-stack CBC lesson-planning task. Teachers generate a grounded draft, edit and submit it; a curriculum lead returns it with feedback or publishes it.

## Stack

- `apps/web`: React, TypeScript, TanStack Router.
- `apps/api`: NestJS, TypeScript, Fastify, Drizzle, PostgreSQL + pgvector.
- `packages/shared`: lesson-plan schemas and transport types.
- `apps/playground`: internal corpus, retrieval, generation, review, and evaluation CLI. It is not part of the product walkthrough.
- LiteLLM, Langfuse, OpenTelemetry, Collector, Grafana, Tempo, Prometheus, and Loki support local verification and telemetry.

See [architecture](docs/architecture.md), [observability setup](docs/observability.md), [the reviewer checklist](docs/performance-checklist.md), and the [shared data-service migration record](docs/local-state-migration.md).

## Run locally

For the tester run, install Node 24 and pnpm, run `pnpm install`, then start the full demo with:

```sh
pnpm demo:up
```

This creates `.env.local` from `.env.example` if needed, generates local service secrets, builds the web and API containers, migrates and seeds PostgreSQL, starts Compose services, checks their health, and prints the URLs. Run `pnpm demo:check` later to recheck services and print the summary. The first build may take a few minutes.

The seed is additive and creates two demo accounts, both with password `NovaLocal123!`:

- `teacher@example.test`
- `curriculum-lead@example.test`

Mock generation is the default and needs no model key. Change the **LLM mode** selector in the app header to switch between mock and the server-configured live provider without restarting. For live mode, set `LLM_PROVIDER=openai-compatible`, `LLM_API_KEY`, `LLM_GENERATOR_MODEL`, and `COMPOSE_LLM_BASE_URL` in `.env.local`, then start or restart the API. The default Compose URL is `http://litellm:4000/v1`. If credentials are missing, the app lists the required variable names and stays in mock mode. Provider credentials stay server-side. See [tester BYOK design](docs/tester-byok.md).

For host-based development, install packages and use `pnpm dev`; `pnpm dev:mock` forces mock generation. See the [tester BYOK design](docs/tester-byok.md) for model configuration details.

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

## Walkthrough

The 4:13 narrated local video is a personal preview, not the submission recording. Record and upload the Loom walkthrough yourself, then add its share link here.
