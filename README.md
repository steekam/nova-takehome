# Nova Curriculum Hub

Initial pnpm workspace for the full-stack performance task. Use [the reviewer checklist](docs/performance-checklist.md) to track the brief from scaffold to submission.

## Workspace

- `apps/web`: React + TypeScript + TanStack Router.
- `apps/api`: NestJS + TypeScript + Drizzle + PostgreSQL.
- `packages/shared`: Zod lesson-plan schema and shared types.
- `docs/architecture.md`: package boundaries and request flow.
- `docs/observability.md`: proposed LiteLLM, Langfuse, OpenTelemetry, and Grafana flow.
- `docs/performance-checklist.md`: reviewer-focused requirements and invariants.

## Current scaffold

The web app has role-aware teacher and curriculum-lead shells, a sign-in route, and a typed API client generated from the API OpenAPI document. shadcn components use Base UI primitives. Varlock validates environment values against the root `.env.schema`; use `.env.local` for machine-specific overrides. Run `pnpm exec varlock load` to inspect validation. The root `pnpm dev` command loads validated values for both apps.

The API uses NestJS with Fastify. `/api/health` checks liveness and `/api/health/ready` checks database readiness. OpenAPI JSON is available at `/api/docs-json` and generated into `apps/api/openapi.json` with `pnpm openapi:generate`; the web client types come from that document. DTO validation uses Nest's global `ValidationPipe` with `class-validator` decorators. Authentication uses 12-hour signed sessions in HttpOnly cookies; `/api/auth/login` and `/api/auth/logout` are public, while other API handlers require a valid session unless marked `@Public()`. Set `AUTH_SECRET` to a random value of at least 32 characters outside local development/test. Use `@Roles()` and `@Permissions()` to restrict handlers. Shared Drizzle CRUD operations live under `apps/api/src/database/crud`. Domain services must enforce authorization and workflow rules instead of exposing generic table CRUD routes. Multipart uploads have size and file-count limits. OpenTelemetry exports traces, metrics, and request/error logs to the configured OTLP endpoint when `OTEL_ENABLED=true`.

Run `pnpm db:generate` to generate migrations from the Drizzle schema and `pnpm db:migrate` to apply them. For local auth flows, run `env NODE_ENV=development pnpm db:seed`; credentials are documented in [SEED_ACCOUNTS.md](apps/api/SEED_ACCOUNTS.md). Do not run the seed command against production data. Validation failures return `code: "VALIDATION_ERROR"` with field-keyed constraint identifiers and omit submitted values.

Start the Compose PostgreSQL service with `docker compose up -d postgres`. It binds to `127.0.0.1:5433` so it can run alongside a host PostgreSQL server on port 5432. To use it, set `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nova_hub` in `.env.local`, then run `pnpm db:migrate` and `env NODE_ENV=development pnpm db:seed`. `docker compose down` stops the service and preserves its volume; `docker compose down -v` also deletes its data.

Run the API smoke test with `pnpm --filter @nova/api test:e2e`; typecheck it with `pnpm --filter @nova/api typecheck:e2e`.

Reusable API plumbing and CRUD concepts were adapted from [MarkNjunge/nest-boilerplate](https://github.com/MarkNjunge/nest-boilerplate); see [AI_LOG.md](AI_LOG.md) for the attribution and adaptation notes.

## Node version

Use Node 24. The root `.nvmrc` pins `24.22.0`; `mise.toml` enables mise to read that same file. With nvm, run `nvm install && nvm use`. With mise, run `mise install`. `package.json` declares Node 24 as the supported major line.
