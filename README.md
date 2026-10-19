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

The web app has a starter route. The API has a health endpoint and an initial Drizzle schema. Copy `.env.example` to `.env` when wiring local services. The root scripts assume dependencies are installed with `pnpm`; database startup, migrations, seed data, authentication, generation, and workflow are still to be implemented.

## Node version

Use Node 24. The root `.nvmrc` pins `24.22.0`; `mise.toml` enables mise to read that same file. With nvm, run `nvm install && nvm use`. With mise, run `mise install`. `package.json` declares Node 24 as the supported major line.
