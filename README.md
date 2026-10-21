# Curriculum Design Hub

Use this README to run the demo and review its teacher-to-lead workflow. The
app is a lesson-planning slice for Kenya's Competency-Based Curriculum (CBC):
teachers generate grounded drafts, edit and submit them; Curriculum Leads
return plans with feedback or publish them to a shared lesson bank.

## Run the demo

You need Node 24, pnpm 12.11.2, and Docker Compose. From the repository root,
run:

```sh
pnpm install
pnpm demo:up
pnpm demo:check
```

`demo:up` creates `.env.local` from `.env.example` when needed, prepares local
service secrets, builds and starts the services, migrates and seeds PostgreSQL,
waits for health checks, and prints service URLs. Keep `.env.local` private.
Mock generation is the default and does not need a provider key.

Sign in with a demo button or use these accounts:

| Role | Email | Password |
| --- | --- | --- |
| Teacher | `teacher@example.test` | `NovaLocal123!` |
| Curriculum Lead | `curriculum-lead@example.test` | `NovaLocal123!` |

Open the web app at `http://localhost:5173/login`. The demo buttons fill the
credentials for you.

### Use a live LLM

To use an OpenAI-compatible provider, set these values in `.env.local`, then
restart the API or Compose stack:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_API_KEY=PROVIDER_API_KEY
LLM_GENERATOR_MODEL=MODEL_NAME
COMPOSE_LLM_BASE_URL=https://PROVIDER_BASE_URL/v1
```

Replace `PROVIDER_API_KEY`, `MODEL_NAME`, and `PROVIDER_BASE_URL` with values
from your provider. Compose passes the base URL to the API as `LLM_BASE_URL`.
The configured reviewer model defaults to the generator model. Credentials
stay on the server. If required live settings are missing, the app reports
them and uses mock mode.

For host development, run `pnpm dev` or `pnpm dev:mock`. Node 24 is declared in
`.nvmrc` and `mise.toml`; `package.json` pins pnpm.

## Try the main flow

1. Sign in as the Teacher. Open **Curriculum Library** and select Grade 8
   Integrated Science, July 2024, outcome `1.2(a)`.
2. Open **Create lesson plan**, choose a duration, and generate a draft. Review
   its deterministic checks, rubric guidance, and source references.
3. Edit and save the draft, rerun validation if needed, then submit it.
4. Sign in as the Curriculum Lead. Return the submitted plan with a comment.
5. Sign in as the Teacher, edit the returned plan, and resubmit it.
6. Sign in as the Curriculum Lead and publish the submitted version. The plan
   then appears in the shared lesson bank.

To see a deterministic validation failure, edit activity durations so they no
longer sum to the lesson duration. The API rejects the save and keeps the
previous version.

**Loom walkthrough:** pending the author's 3–5 minute recording; add its link
before submission.

## System shape

`apps/web` contains the React and TanStack Router screens. `apps/api` contains
the NestJS HTTP layer, authorization, use cases, retrieval, model calls, and
Drizzle persistence. `packages/shared` owns the Zod request, response, and
lesson-plan schemas used by the API and web app. `packages/model-runtime`
contains shared provider adapters. The API owns embeddings. `apps/evals` is a
small internal CLI that exercises the running API and exports Langfuse evaluation
datasets. It has no separate plan lifecycle or provider implementation.

The API stores data in PostgreSQL with pgvector. Drizzle table definitions are
split by feature under `apps/api/src/database/schema`. The main flow is:

```text
Teacher request → resolve target → embed query → retrieve source chunks
 → generate JSON → deterministic validation → persist version and provenance
 → rubric QA
```

Generation validates the output schema, selected target, duration, activity
timings, unique citations, official target citation, and citation membership
in the frozen retrieval candidates. If deterministic checks fail, the API asks
the provider for one correction. If generation still fails, or the provider is
unavailable, it returns a clear error and saves no draft. Rubric QA scores the
saved version on six quality dimensions and offers evidence-linked suggestions;
it does not block submission or publication. Teachers can validate a saved
version again after editing.

The workflow is `Draft → Submitted → Returned → Draft` after a teacher edit,
or `Submitted → Published`. The API rejects invalid transitions. Each teacher
edit creates an immutable version, and each lead decision references the
version reviewed. See [architecture](docs/architecture.md) and
[domain model](docs/domain-model.md).

## Corpus and lesson schema

The demo seeds nine short resources for Grade 8 Integrated Science: one
official KICD curriculum excerpt and eight clearly labelled synthetic school
supports. The supports cover scheme-of-work, teaching-note, assessment,
curriculum-lead guidance, and exemplar material. The remaining four CBC
catalogue paths are browse-only.

The corpus uses relational records rather than one nested document: controlled
framework, programme, level, subject, offering, design-version, curriculum
node, and target-revision records define the catalogue. Library resources have
typed, attributed, immutable revisions. Each revision is split into chunks
with a source locator and a 384-dimensional BGE-small embedding. A typed source
link connects a curriculum target revision to a library resource revision.
See [domain model](docs/domain-model.md) and the Drizzle schemas in
`apps/api/src/database/schema`.

The shared `LessonPlanContentSchema` defines the generated and teacher-edited
content:

- Title, subject, grade, learning outcome, and duration.
- Objectives, materials, and starter.
- Timed activities with titles and descriptions.
- Check for understanding.
- Source references, each with a document ID and chunk ID.

The server validates both model output and teacher edits. Deterministic source
checks establish citation identity and provenance; they do not prove that each
instructional claim follows from its cited passage.

## Tests and scope

Run the automated unit and package tests with:

```sh
pnpm test
```

Role checks are covered in `apps/api/test/roles.e2e-spec.ts`. Lesson schema,
grounding, and invalid-output repair checks are in
`apps/api/test/curriculum.spec.ts`. The HTTP workflow test in
`apps/api/test/curriculum-flow.e2e-spec.ts` also checks generation, access,
editing, review, and publication. It needs a migrated, seeded disposable
database through `TEST_DATABASE_URL`; without it, the test is skipped.

The task brief asks for a small corpus and thin workflow. This implementation
keeps one CBC target source-backed for generation; other catalogue paths support
browsing only. It does not provide document upload, extraction, or a full
curriculum-source approval UI. Seed/import paths populate the demo corpus.
Useful next steps include adding approved source ingestion, grounding more CBC
targets, and expanding retrieval evaluations with independently reviewed
examples.

For AI workflow traces, prompt management, and telemetry destinations, see
[observability](docs/observability.md). The [glossary](GLOSSARY.md) records
project terminology and curriculum-source notes.
