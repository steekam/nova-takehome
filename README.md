# Curriculum Design Hub

Full-stack Kenya CBC lesson planning. Teachers create grounded drafts, edit and submit them; a Curriculum Lead returns a draft with feedback or publishes it to the shared lesson bank.

## Run the demo

Use Node 24, pnpm 12.11.2, and Docker. From the repository root:

```sh
pnpm install
pnpm demo:up
pnpm demo:check
```

`demo:up` creates `.env.local` from `.env.example` when needed, prepares local service secrets, builds and starts Compose, migrates and seeds PostgreSQL, waits for health, then prints URLs. Keep `.env.local` private. `demo:check` rechecks the running services and prints the current startup mode.

Sign in from the Teacher or Curriculum Lead demo button. Manual credentials:

| Role | Email | Password |
| --- | --- | --- |
| Teacher | `teacher@example.test` | `NovaLocal123!` |
| Curriculum Lead | `curriculum-lead@example.test` | `NovaLocal123!` |

The web app is at `http://localhost:5173/login`. `demo:check` also prints API readiness and local observability URLs.

Mock generation is the default and needs no provider key. To enable the server-configured live provider, set `LLM_PROVIDER=openai-compatible`, `LLM_API_KEY`, `LLM_GENERATOR_MODEL`, and `COMPOSE_LLM_BASE_URL` in `.env.local`, then start or restart the API. The default Compose URL is `http://litellm:4000/v1`. The app names missing settings when live mode is unavailable; provider credentials stay server-side. The app header switches between mock and configured live mode. See [model configuration](docs/tester-byok.md).

For host development, use `pnpm dev` or `pnpm dev:mock`. Node 24 is declared in `.nvmrc` and `mise.toml`; pnpm is pinned in `package.json`.

## Suggested click-through

1. Sign in as the Teacher. Open **Curriculum Library**, then inspect Grade 8 Integrated Science, July 2024, outcome `1.2(a)`.
2. Open **Create lesson plan**, select the source-backed outcome and a duration, then generate a mock draft. Inspect quality checks and source references.
3. Edit and save the draft, then submit it.
4. Sign in as the Curriculum Lead. Open the submitted plan, add a return comment, and return it.
5. Sign in as the Teacher, edit the returned plan, and resubmit it. The first edit creates a new Draft version.
6. Sign in as the Curriculum Lead and publish the resubmitted version. The plan is then visible in the shared lesson bank and its history records the reviewed version.

To show QA feedback, change activity minutes so they no longer sum to the lesson duration and save. The API rejects the update with the failed check and keeps the saved version unchanged.

## Curriculum and generation

The demo catalogue has five CBC grade/subject offerings. It seeds nine short source resources across six types: one official KICD curriculum excerpt and eight clearly labelled synthetic teaching supports. Grade 8 Integrated Science is the only generation-ready target; the other seeded paths are browse-only. The current library lets users browse hierarchy, revisions, references, and readiness. Source authoring and publishing are not available in the UI; seed/import data populates the catalogue. The proposed upload and review workflow is documented in [source ingestion extension](docs/source-ingestion-extension.md).

The API embeds the selected target's linked sources with BGE-small (384 dimensions) and stores vectors in pgvector. Retrieval pins the official target-defining excerpt and selects supporting material from that target. Generation returns a strict shared lesson schema: target and duration, objectives, materials, starter, timed activities, assessment check, and source IDs. Before saving, the API checks schema, selected target, exact duration, activity-time total, official target citation, and citation membership in the frozen retrieval set. Missing target sources, invalid model output, and failed QA return stable errors without creating or changing a plan.

The shared package owns transport schemas and the plan transition table. The API owns authorization, row-locked state changes, immutable versions, reviews, and persistence. See [architecture and invariants](docs/architecture.md), the [implemented domain model](docs/domain-model-and-grounding.md), and the [project glossary](GLOSSARY.md).

## Repository map

- `apps/web` — React, TypeScript, TanStack Router screens.
- `apps/api` — NestJS, Fastify, Drizzle, authentication, retrieval, generation, validation, and workflow.
- `apps/playground` — internal corpus, retrieval, prompt, provider, and evaluation CLI; not part of the product walkthrough.
- `packages/shared` — lesson schemas, transport types, and workflow transitions.
- `packages/model-runtime` — shared provider and embedding runtime primitives.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

The API database-backed HTTP workflow test also runs when `TEST_DATABASE_URL` points at a migrated and seeded disposable database:

```sh
env TEST_DATABASE_URL=postgresql://… pnpm --filter @nova/api test:e2e
```

See the [reviewer checklist](docs/performance-checklist.md), [embedding and corpus notes](docs/playground/embedding-corpus-guide.md), and [observability setup](docs/observability.md). The [data schema](docs/system-data-schema.html), [curriculum library walkthrough](docs/curriculum-library-walkthrough.html), and [work overview](docs/work-overview.html) are visual review aids.

## Submission walkthrough

The submission Loom remains for the human author to record and upload. Add its share link here after recording. Required walkthrough: teacher generation and QA, teacher edits and submission, lead return with feedback, teacher revision and resubmission, lead publication, and one generation or save failure with its visible error.
