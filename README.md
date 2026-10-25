# Curriculum Design Hub

A CBC lesson-planning prototype. Teachers create source-backed drafts; Curriculum Leads review and publish them.

**[Watch the demo](https://www.loom.com/share/916db49d91a1469095cc6b8fbdc8dbe8)** · 3–5 minutes

## What the demo demonstrates

The demo follows a lesson plan from a CBC outcome to human publication. Each stage leaves evidence a reviewer can inspect.

- **Grounding:** The teacher selects an outcome. Retrieval uses sources published for that target, and the saved plan keeps its target, citations, and retrieved evidence.
- **Correctness:** Shared schemas shape the output. Deterministic checks enforce the target, requested duration, and citation provenance. The generator gets one repair attempt; if checks still fail, the API returns an error and saves no draft. Activity-time totals produce a warning, not a block.
- **Human review:** Rubric QA returns scores, evidence, and suggestions after the draft is saved. A failed review does not discard the draft. Teachers edit; Curriculum Leads decide whether to publish.
- **Operational evidence:** Langfuse traces retrieval, provider calls, checks, repairs, and rubric QA. With prompt capture enabled, traces also include prompt versions, source context, and model inputs and outputs; request IDs connect them to API calls. LiteLLM routes model aliases and reports usage and spend. OpenTelemetry auto-instrumentation exports API signals through the collector; Prometheus, Tempo, and Loki feed Grafana dashboards.

The Grade 8 seed contains 37 source-linked outcomes. Bootstrap checks the expected count. This curriculum corpus grounds lesson generation; a separate, versioned benchmark set for repeatable AI comparisons remains an extension.

## Start a tester environment

Requires Node 24, pnpm 12.15.0, and Docker Compose. From a fresh checkout:

```sh
pnpm install
pnpm demo:up
```

Startup builds the app, migrates the database, seeds the corpus, checks health, and prints URLs. The first run downloads the local embedding model and can take longer. No LLM key is needed for the workflow smoke test.

To run a second clone beside another stack, set `COMPOSE_POSTGRES_PORT`, `COMPOSE_API_PORT`, and `COMPOSE_WEB_PORT` in `.env.local`; keep `DATABASE_URL`, `CORS_ORIGIN`, and `VITE_API_URL` aligned. `pnpm demo:check` prints the active app and API URLs.

Open [localhost:5173/login](http://localhost:5173/login) and sign in with either account:

| Role | Email | Password |
| --- | --- | --- |
| Teacher | `teacher@example.test` | `NovaLocal123!` |
| Curriculum Lead | `curriculum-lead@example.test` | `NovaLocal123!` |

Use the Teacher demo login for generation. Sign out and use the Curriculum Lead demo login for review. `pnpm demo:down` stops the services but keeps database contents and saved plans.

Use these commands to manage the stack:

| Command | Purpose |
| --- | --- |
| `pnpm demo:full` | Start the app with Langfuse, LiteLLM, and Grafana. |
| `pnpm demo:check` | Check the lite profile and print URLs. |
| `pnpm demo:check:full` | Check the full profile and print URLs. |
| `pnpm demo:down` | Stop services and keep data. |

## Curriculum sample

Choose Kenya CBC → Junior School → Grade 8 → Integrated Science → **July 2024 · Revision 1**. The seeded edition has 37 generation-ready outcomes across eight sub-strands, official KICD outcome excerpts, eight assessment packs, three schemes of work, and curriculum guidance. The bootstrap checks the outcome count; each outcome links to source chunks used for retrieval and citation.

## Try the review workflow

1. Start the local app with `pnpm demo:up`, open [localhost:5173/login](http://localhost:5173/login), and choose the Teacher demo login.
2. Create a plan for outcome `1.1(a)` and generate in Mock mode. Check the exact curriculum outcome, KICD defining source, and relevant assessment or scheme sources. The title starts with **Mock plan**.
3. Edit and save the draft, run deterministic QA, then submit it for review.
4. Sign out and choose the Curriculum Lead demo login. Return the plan with feedback.
5. Sign back in as Teacher, revise, rerun QA, and resubmit; then sign in as Curriculum Lead and publish it.

Edits append immutable versions. Reviews and rubric results retain the assessed version. Teachers can delete unreviewed drafts; reviewed plans stay auditable.

This checks setup, target selection, source links, editing, QA, and review transitions. Mock generation is deterministic and does not assess lesson quality.

## Mock mode and content quality

`pnpm demo:up` uses deterministic mock AI. It is for checking the workflow, source links, validation, and review states. Its output is labelled “Mock plan” and is not evidence of lesson-plan quality. Use a configured live provider to assess generated content.

Mock scenarios:

| Scenario | Expected result |
| --- | --- |
| Happy path | A valid draft is saved. |
| Invalid output | One repair, then `LLM_INVALID_RESPONSE`; no draft is saved. |
| Provider unavailable | `LLM_PROVIDER_UNAVAILABLE`; no draft is saved. |

The mock uses outcome-specific lesson scaffolds, but it remains deterministic. For a content-quality pass, use Live mode and test one outcome from each sub-strand:

| Outcome | What it covers |
| --- | --- |
| `1.1(c)` | Word equations for compound formation |
| `1.2(c)` | Physical and chemical changes |
| `1.3(c)` | Safe control of different fire classes |
| `2.1(a)` | Cell observation and structure |
| `2.2(b)` | Demonstrating diffusion and osmosis |
| `2.3(b)` | A menstrual-cycle support plan using fictional scenarios |
| `3.1(c)` | Energy transformations |
| `3.2(a)` | Demonstrating pressure in solids and liquids |

For each plan, check that objectives, activities, and evidence match the outcome and that source passages support the claims. The plan duration must match your request. Activity times are suggestions: the app warns when their total differs from the lesson duration but does not block the draft. Check safety and age-appropriate handling, especially for fire, practical activities, and reproductive health. Confirm the selected outcome stays unchanged in the saved draft.

## Configure Live mode

Live mode uses an OpenAI-compatible chat API. Choose one provider example and add its endpoint, key, and model IDs to `.env.local`.

For OpenAI directly:

```dotenv
LLM_PROVIDER=openai-compatible
COMPOSE_LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=YOUR_OPENAI_API_KEY
LLM_GENERATOR_MODEL=YOUR_GENERATOR_MODEL_ID
LLM_REVIEWER_MODEL=YOUR_REVIEWER_MODEL_ID
LANGFUSE_USE_MANAGED_PROMPTS=false
```

For OpenRouter, use its OpenAI-compatible endpoint and a model ID from its catalog, in `provider/model` form:

```dotenv
LLM_PROVIDER=openai-compatible
COMPOSE_LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=YOUR_OPENROUTER_API_KEY
LLM_GENERATOR_MODEL=PROVIDER/MODEL_ID
LLM_REVIEWER_MODEL=PROVIDER/MODEL_ID
LANGFUSE_USE_MANAGED_PROMPTS=false
```

To reuse an existing local LiteLLM and Langfuse stack from the lite profile, point the API container to the host services. Set `LLM_API_KEY` to your LiteLLM virtual key and keep the model aliases configured in LiteLLM:

```dotenv
LLM_PROVIDER=openai-compatible
COMPOSE_LLM_BASE_URL=http://host.docker.internal:4000/v1
LLM_API_KEY=YOUR_LITELLM_API_KEY
LLM_GENERATOR_MODEL=lesson-planner
LLM_REVIEWER_MODEL=lesson-planner
COMPOSE_LANGFUSE_BASE_URL=http://host.docker.internal:3002
LANGFUSE_PUBLIC_KEY=YOUR_LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY=YOUR_LANGFUSE_SECRET_KEY
LANGFUSE_USE_MANAGED_PROMPTS=true
```

Start with `pnpm demo:up`; the app header should show **Live · configured provider**. The LiteLLM API key is passed as `LLM_API_KEY` regardless of which compatible proxy issued it. Generation and rubric QA are separate calls: an invalid rubric response does not discard a valid draft. Deterministic checks remain available; use **Run again** to retry the advisory review.

For the OpenAI and OpenRouter examples, replace the placeholders with your key and supported model IDs, then run `pnpm demo:full` and choose **Live** in the app header. OpenRouter model IDs use the `provider/model` form. You can use different models for generation and review; both must support JSON object output. These direct-provider examples disable managed prompts so the API uses the configured model IDs. The full demo's managed prompts use the `lesson-planner` LiteLLM alias by default. For Compose, the endpoint must be reachable from the API container. If you run the API on your machine, set `LLM_BASE_URL` instead of `COMPOSE_LLM_BASE_URL`.

If you change credentials while the stack is running, rerun its startup command so Compose recreates the API with the new values. Prompt capture defaults on; set `LANGFUSE_CAPTURE_PROMPTS=false` for sensitive content. See [observability](docs/observability.md), the [OpenAI API reference](https://platform.openai.com/docs/api-reference/chat), and [OpenRouter](https://openrouter.ai/developers).

## Verify

With the lite or full stack running, create a separate test database and run:

```sh
pnpm exec varlock run -- docker compose exec postgres createdb -U postgres nova_hub_test
env TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nova_hub_test pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

If you changed `COMPOSE_POSTGRES_PORT`, use that port in `TEST_DATABASE_URL`.

`pnpm test` covers API unit, web authentication, and database-backed HTTP tests. `pnpm test:web` needs no database.

## Scope and extensions

**Curriculum file ingestion.** Extend the current text intake into an authority-document pipeline: extract and review curriculum records, publish immutable revisions, chunk and embed them, then evaluate retrieval before activating an index. See the [corpus ingestion design](docs/corpus-ingestion.md).

**Evaluation and model iteration.** Turn representative traces into a versioned Langfuse dataset, then run each case against candidate prompts and models. Compare grounding, rubric scores, latency, token use, and cost to see which variants preserve quality at lower cost or latency. Trace capture, prompt management, model aliases, and usage reporting supply the data and controls; evaluation runs and release gates still need to be built.

**Durable AI jobs.** Generation and rubric QA run synchronously with pending/error states, timeouts, and limited retries. A queue was cut for scope; it would need a worker, persistent job state, owner-checked polling, idempotent stages, and request/trace propagation.

## Read the design

Use these references for implementation details:

| Topic | Document |
| --- | --- |
| Entities, attributes, and relationships | [Data model](docs/domain-model.md) |
| Services and code boundaries | [Architecture](docs/architecture.md) |
| Source intake, generation, and review | [Data flows](docs/data-flows.md) |
| Prompts, traces, and telemetry | [Observability](docs/observability.md) |
