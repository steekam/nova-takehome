# Nova Curriculum Hub

Initial pnpm workspace for the full-stack performance task. The app flow and database integration are not implemented yet; use [the reviewer checklist](docs/performance-checklist.md) to track the brief from scaffold to submission.

## Workspace

- `apps/web`: React + TypeScript + TanStack Router.
- `apps/api`: NestJS + TypeScript + Drizzle + PostgreSQL.
- `packages/shared`: Zod lesson-plan schema and shared types.
- `docs/architecture.md`: package boundaries and request flow.
- `docs/observability.md`: proposed LiteLLM, Langfuse, OpenTelemetry, and Grafana flow.
- `docs/performance-checklist.md`: reviewer-focused requirements and invariants.

## Current scaffold

The web app has a starter route. The API has a health endpoint and an initial Drizzle schema. Varlock validates environment values against the root `.env.schema`; use `.env.local` for machine-specific overrides. Run `pnpm exec varlock load` to inspect validation. The root `pnpm dev` command loads validated values for both apps. The root scripts assume dependencies are installed with `pnpm`; database startup, migrations, seed data, authentication, generation, and workflow are still to be implemented.

The API uses NestJS with Fastify. `/api/health` checks liveness and `/api/health/ready` checks database readiness. Swagger is available at `/api/docs`; DTO validation uses Nest's global `ValidationPipe` with `class-validator` decorators. Shared Drizzle CRUD operations live under `apps/api/src/database/crud`. Domain services must enforce authorization and workflow rules instead of exposing generic table CRUD routes. Multipart uploads have size and file-count limits. OpenTelemetry exports traces, metrics, and request/error logs to the configured OTLP endpoint when `OTEL_ENABLED=true`.

Run the API smoke test with `pnpm --filter @nova/api test:e2e`; typecheck it with `pnpm --filter @nova/api typecheck:e2e`.

Reusable API plumbing and CRUD concepts were adapted from [MarkNjunge/nest-boilerplate](https://github.com/MarkNjunge/nest-boilerplate); see [AI_LOG.md](AI_LOG.md) for the attribution and adaptation notes.

## Node version

Use Node 24. The root `.nvmrc` pins `24.22.0`; `mise.toml` enables mise to read that same file. With nvm, run `nvm install && nvm use`. With mise, run `mise install`. `package.json` declares Node 24 as the supported major line.
