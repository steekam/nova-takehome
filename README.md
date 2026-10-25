# Curriculum Design Hub

A CBC lesson-planning demo. Teachers generate source-backed drafts, edit them, and submit them for Curriculum Lead review.

## Run the demo

Requires Node 24, pnpm 12.11.2, and Docker Compose. Install dependencies and start the lite profile:

```sh
pnpm install
pnpm demo:up
```

Startup migrates, seeds, checks health, and prints URLs. Lite runs PostgreSQL, API, and web with mock AI. The first run downloads the embedding model.

Open [localhost:5173/login](http://localhost:5173/login) and sign in with either account:

| Role | Email | Password |
| --- | --- | --- |
| Teacher | `teacher@example.test` | `NovaLocal123!` |
| Curriculum Lead | `curriculum-lead@example.test` | `NovaLocal123!` |

Sign out to switch roles. Use these commands to manage the stack:

| Command | Purpose |
| --- | --- |
| `pnpm demo:full` | Start the app with Langfuse, LiteLLM, and Grafana. |
| `pnpm demo:check` | Check the lite profile and print URLs. |
| `pnpm demo:check:full` | Check the full profile and print URLs. |
| `pnpm demo:down` | Stop services and keep data. |

## Try the workflow

Use CBC → Junior School → Grade 8 → Integrated Science → July 2024 to generate from any `1.1(a)`–`1.1(e)` outcome or the existing `1.2(a)` particle target. Other catalogue paths are browse-only.

1. As Teacher, select the target and generate a draft.
2. Inspect its sources and QA, edit it, save, and submit.
3. As Curriculum Lead, return it with feedback.
4. As Teacher, revise, rerun QA, and resubmit.
5. As Curriculum Lead, publish it to the lesson bank.

Edits append immutable versions. Reviews and rubric results retain the assessed version. Teachers can delete unreviewed drafts; reviewed plans stay auditable.

## Use mock or live AI

Mock mode is the default. Select a scenario before generation:

| Scenario | Expected result |
| --- | --- |
| Happy path | A valid draft is saved. |
| Invalid output | One repair, then `LLM_INVALID_RESPONSE`; no draft is saved. |
| Provider unavailable | `LLM_PROVIDER_UNAVAILABLE`; no draft is saved. |

Switch to Live mode in the header without restarting. Missing credentials keep mock mode active and show an error. Keys stay on the server.

To configure an OpenAI-compatible provider, add these values to `.env.local`:

```dotenv
LLM_PROVIDER=openai-compatible
COMPOSE_LLM_BASE_URL=https://api.example.com/v1
LLM_API_KEY=PROVIDER_API_KEY
LLM_GENERATOR_MODEL=GENERATOR_MODEL_ID
LLM_REVIEWER_MODEL=REVIEWER_MODEL_ID
LANGFUSE_USE_MANAGED_PROMPTS=false
```

Replace the endpoint, key, and model IDs, then run `pnpm demo:full`. Prompt capture defaults on; set `LANGFUSE_CAPTURE_PROMPTS=false` for sensitive content. See [observability](docs/observability.md).

## Verify

Set `TEST_DATABASE_URL` to a disposable local PostgreSQL database ending in `_test`, then run:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

`pnpm test` covers API unit, web authentication, and database-backed HTTP tests. `pnpm test:web` needs no database.

## Scope and extensions

**Curriculum file ingestion.** Text intake could grow into reviewed file extraction, versioned content, and evaluated indexes. See the [corpus ingestion design](docs/corpus-ingestion.md).

**Durable AI jobs.** Generation and rubric QA run synchronously with pending/error states, timeouts, and limited retries. A queue was cut for scope; it would need a worker, persistent job state, owner-checked polling, idempotent stages, and request/trace propagation.

## Read the design

Use these references for implementation details:

| Topic | Document |
| --- | --- |
| Entities, attributes, and relationships | [Data model](docs/domain-model.md) |
| Services and code boundaries | [Architecture](docs/architecture.md) |
| Source intake, generation, and review | [Data flows](docs/data-flows.md) |
| Prompts, traces, and telemetry | [Observability](docs/observability.md) |

**Walkthrough:** The task asks for a 3–5 minute recording. Add the final Loom or Drive link before submission.
