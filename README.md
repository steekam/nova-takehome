# Curriculum Design Hub

A lesson-planning app for Kenya's Competency-Based Curriculum (CBC). Teachers
generate a draft from curriculum sources, edit it, and submit it. A Curriculum
Lead returns it with feedback or publishes it to the shared lesson bank.

## Run locally

Use **Node 24**, **pnpm 12.11.2**, and a running **Docker** engine with Compose:

```sh
pnpm install
pnpm demo:up
```

The default Compose configuration is the lite stack: PostgreSQL, a one-shot API
bootstrap container, API, and web. `pnpm demo:up` builds and starts these
services, migrates and seeds the database, checks health, and prints app URLs.
It uses mock generation and skips Langfuse and OpenTelemetry services. The
first start also downloads the local embedding model. Switching from full to
lite stops the telemetry services and keeps their data volumes.

For Langfuse traces, LiteLLM, and the Grafana telemetry stack, start the full
demo instead:

```sh
pnpm demo:full
```

The full stack captures prompt inputs and outputs in Langfuse by default. Set
`LANGFUSE_CAPTURE_PROMPTS=false` in `.env.local` to turn capture off. Stop
either stack with this volume-preserving command:

```sh
pnpm demo:down
```

The `full` Compose profile adds LiteLLM, Langfuse, and telemetry services.
Profiles select services to start; they do not stop services from a previous
profile. `pnpm demo:up` handles switching back to lite, and `pnpm demo:down`
stops the whole stack without deleting volumes.

Open **[localhost:5173/login](http://localhost:5173/login)**. Use the demo buttons
or sign in manually; both accounts use `NovaLocal123!`.

| Role | Email |
| --- | --- |
| Teacher | `teacher@example.test` |
| Curriculum Lead | `curriculum-lead@example.test` |

Check the lite stack with `pnpm demo:check`, or the full stack with
`pnpm demo:check:full`.

### Use your own LLM

For a direct OpenAI-compatible provider, edit `.env.local`:

```dotenv
LLM_PROVIDER=openai-compatible
COMPOSE_LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=your-key
LLM_GENERATOR_MODEL=your-model
LLM_REVIEWER_MODEL=your-model
LANGFUSE_USE_MANAGED_PROMPTS=false
```

Use your provider's actual URL and model IDs, then run `pnpm demo:full` again.
Disabling managed prompts makes these environment model settings authoritative.
Langfuse tracing still requires Langfuse credentials. To manage prompts or route
through LiteLLM, see [observability](docs/observability.md).

The app header switches between **Mock** and **Live** without restarting. The
switch applies to the API instance and resets to its configured default on
restart. Missing live settings are shown in the UI and leave mock mode active.
Keys stay on the server.

## Try the workflow

1. **Teacher:** open Curriculum Library → Grade 8 Integrated Science → July
   2024 → outcome `1.2(a)`. Select **Create a lesson plan** on the target page;
   it carries that target into the generation form. This is the demo's only
   generation-ready target; other catalogue entries are browse-only. Choose a
   duration and generate a plan.
2. Read the sources and QA guidance. Edit, save, and submit. To try a rejected
   edit, make the activity timings differ from the lesson duration.
3. **Curriculum Lead:** open the review queue and return the plan with a comment.
4. **Teacher:** edit the returned plan, rerun rubric QA, and resubmit.
5. **Curriculum Lead:** publish it. Both roles can now find it in the lesson bank.

The server enforces roles, ownership, and state transitions. Each edit creates
an immutable version; review decisions and rubric results reference the exact
version reviewed. Teachers can remove unreviewed drafts from their workspace.
Soft deletion keeps saved versions; plans with review history, in review, or
published remain available for audit. See the
[workflow state charts](docs/workflow-state-charts.md) for all transitions.

## How it works

```text
Select target + duration → retrieve sources → generate JSON → validate
                         → repair once if needed → save draft → rubric QA
```

Retrieval scopes sources to the chosen curriculum target, includes its official
definition, and ranks supporting chunks by vector similarity. The API validates
schema, target, duration, activity totals, and citations against the retrieved
set before saving a draft and its provenance.

Invalid output gets one correction attempt. If that fails, the API returns a
clear error and saves no draft. Transient provider failures get up to three
retries with jitter and `Retry-After` support. Generation calls time out after
20 seconds; rubric review allows 90 seconds by default, adjustable with
`LLM_REVIEW_TIMEOUT_MS` (20–180 seconds).

Rubric QA runs **after the draft is saved** and provides advisory scores and
suggestions. Reviewer model or output failures are recorded without blocking
the publishing workflow. The separate validation action reruns rubric QA on a
saved version; deterministic checks run on generation, edits, submission, and
publication. Mock rubric scores are labelled placeholders.

### Code and data

| Location | Responsibility |
| --- | --- |
| `apps/web` | React, TanStack Router, forms, typed API calls |
| `apps/api` | NestJS authentication, use cases, retrieval, QA, Drizzle repositories |
| `packages/shared` | Zod request, response, and lesson-plan contracts |
| `packages/model-runtime` | Provider adapters |
| `apps/evals` | API evaluation runs and Langfuse dataset export |

PostgreSQL with pgvector stores the catalogue, source revisions, embeddings,
plans, versions, and reviews. Table definitions are split by feature under
`apps/api/src/database/schema`. The [architecture](docs/architecture.md) covers
module boundaries and access rules; the [domain model](docs/domain-model.md)
covers relationships. [Data flows](docs/data-flows.md) document source intake,
generation, validation, and review. For a zoomable presentation view, open the
[system diagram board](https://www.tldraw.com/f/bmp8NfBjhONWbeWKxZ7M9).

### Corpus and lesson content

The [seed corpus](apps/api/src/database/seed.ts) contains nine short documents:
one official KICD excerpt and eight labelled synthetic supports, including a
scheme of work, teaching notes, assessments, lead guidance, and an exemplar.
Support records have `type`, `title`, `locator`, `role`, and `content`. Seeding
adds authority and edition metadata, creates immutable resource revisions and
chunks, embeds them with BGE-small (384 dimensions), and links them to the target.
It also adds one clearly labelled demo draft linked to the Grade 8 outcome and
its official and teaching-note citations. Seed records use stable IDs and are
insert-only; reseeding does not overwrite edits or remove existing plans.

[LessonPlanContentSchema](packages/shared/src/contracts/lesson-planning.ts)
validates generated and edited content: title, subject, grade, learning outcome,
duration, objectives, materials, starter, timed activities, check for
understanding, and source references (`documentId` + `chunkId`).

Citation checks establish source identity and provenance. They cannot prove
that every claim is supported by its cited passage; rubric QA and human review
address that limitation.

## Checks and scope

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

`pnpm test` runs API unit and end-to-end suites, including server role checks,
lesson schema validation, grounding, and repair. The full HTTP workflow test
requires `TEST_DATABASE_URL` pointing to a migrated, seeded, disposable
PostgreSQL database; it is skipped when that variable is absent. Unit and role
checks run without a database. See [evals](apps/evals/README.md) for live runs,
controlled failure cases, and report export.

The demo supports generation for **one CBC target**: Grade 8 Integrated Science,
July 2024, outcome `1.2(a)`. Other catalogue paths are browse-only. Leads can
ingest source text and publish revisions through the API. File upload,
extraction, and source-management screens are omitted to keep the slice focused
on planning and review. Next steps are broader source coverage
and retrieval evaluations with independently reviewed examples.

[Observability](docs/observability.md) explains Langfuse traces and prompts,
LiteLLM routing and costs, and system metrics. [AI_LOG.md](AI_LOG.md) records AI
assistance and decisions made during development.

Use the [presentation walkthrough](docs/presentation.html) for a slide-by-slide
view of the catalogue, evidence path, workflows, and system architecture.
