# Curriculum Design Hub

A CBC lesson-planning prototype. Teachers create source-backed drafts; Curriculum Leads review and publish them.

**[Watch the demo](https://www.loom.com/share/916db49d91a1469095cc6b8fbdc8dbe8)** · 3–5 minutes

## Start a tester environment

Requires Node 24, pnpm 12.15.0, and Docker Compose. From a fresh checkout:

```sh
pnpm install
pnpm demo:up
```

Startup builds the app, migrates the database, seeds the corpus, checks health, and prints URLs. The first run downloads the local embedding model and can take longer. No LLM key is needed for the workflow smoke test.

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

Choose Kenya CBC → Junior School → Grade 8 → Integrated Science → **July 2024 · Revision 1**. The edition has 37 generation-ready learning outcomes across all eight sub-strands, official KICD outcome excerpts, eight assessment packs, three schemes of work, and curriculum guidance. Each outcome links to relevant source chunks.

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

Replace the placeholders with your key and supported model IDs. OpenRouter model IDs use the `provider/model` form. You can use different models for generation and review; both must support JSON object output. These direct-provider examples disable managed prompts so the API uses the configured model IDs. The full demo's managed prompts use the `lesson-planner` LiteLLM alias by default. For `pnpm demo:full`, the endpoint must be reachable from the API container. If you run the API on your machine, set `LLM_BASE_URL` instead of `COMPOSE_LLM_BASE_URL`.

Then run `pnpm demo:full` and choose **Live** in the app header. If you change credentials while the stack is running, rerun the command so Compose recreates the API with the new values. Prompt capture defaults on; set `LANGFUSE_CAPTURE_PROMPTS=false` for sensitive content. See [observability](docs/observability.md), the [OpenAI API reference](https://platform.openai.com/docs/api-reference/chat), and [OpenRouter](https://openrouter.ai/developers).

## Verify

With the lite or full stack running, create a separate test database and run:

```sh
pnpm exec varlock run -- docker compose exec postgres createdb -U postgres nova_hub_test
env TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nova_hub_test pnpm test
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
