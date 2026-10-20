# Lesson-generation playground

Use this CLI to inspect retrieval, schema-constrained generation and review, deterministic verification, and provider output before API work.

## Commands

```sh
# Defaults to the same offline, single-model generation
pnpm playground

# Offline deterministic generation; no provider key or embedding download needed
pnpm playground -- generate

# Single-model validation and prompt iteration with Baseten DeepSeek
pnpm playground -- generate --live

# Run one GLM 5.3 Flash generation
pnpm playground -- generate --live --model glm

# Route DeepSeek or GLM through the local budgeted LiteLLM gateway
pnpm playground -- generate --live --via-litellm
pnpm playground -- generate --live --via-litellm --model glm

# Review a successful generation run with the same frozen source context
pnpm playground -- review <generation-run-id>

# Import one successful generation as a teacher-owned Draft
pnpm playground -- plans import <generation-run-id> --owner teacher-demo

# Review with Baseten DeepSeek
pnpm playground -- review <generation-run-id> --live

# Review through the LiteLLM gateway
pnpm playground -- review <generation-run-id> --live --via-litellm

# Evaluate the DeepSeek reviewer against clean and corrupted CBC plans
pnpm playground -- review-eval
pnpm playground -- review-eval --live --via-litellm

# Publish the local generation template as a new Langfuse prompt version
pnpm playground -- prompts publish

# Export lesson, review, and corpus JSON Schemas
pnpm playground -- schema

# Evaluate local BGE retrieval against labeled CBC fixture queries
pnpm playground -- retrieval-eval
pnpm playground -- retrieval-eval --mock

# Select the second CBC target fixture
pnpm playground -- generate --target changes

# Create a teacher-authored plan without a provider call
pnpm playground -- plans author --target particles --owner teacher-demo --content apps/playground/fixtures/teacher-authored-particles.json

# Ask the advisory reviewer about the current version, then edit manually
pnpm playground -- plans review <plan-id> --live --via-litellm
pnpm playground -- plans edit <plan-id> --owner teacher-demo --content <revised-content.json>

# Inspect, submit, return, revise, resubmit, and publish a saved plan
pnpm playground -- plans list
pnpm playground -- plans show <plan-id>
pnpm playground -- plans submit <plan-id> --owner teacher-demo
pnpm playground -- plans return <plan-id> --lead lead-demo --comment "Clarify the evidence used for the liquid model."
pnpm playground -- plans edit <plan-id> --owner teacher-demo --content <revised-content.json>
pnpm playground -- plans submit <plan-id> --owner teacher-demo
pnpm playground -- plans publish <plan-id> --lead lead-demo

# Export run snapshots as Langfuse-ready JSONL and summarize saved costs
pnpm playground -- dataset export
pnpm playground -- costs --json

# Run offline regression checks for verification, retry/repair behavior, provider classification, and cache reuse
pnpm --filter @nova/playground test
```

`pnpm playground` defaults to offline mock generation. Select a CBC target with `--target particles|changes` and a 30-60 minute lesson duration in 5-minute increments with `--duration` (default 40). For example, `pnpm playground -- generate --target changes --duration 30`. The run report records the requested duration; the prompt and deterministic verifier use the same timing. `generate --live` uses Baseten DeepSeek V4.1 Flash; add `--model glm` to select Baseten GLM 5.3 Flash for one run. Add `--via-litellm` to route a live generation or review call through the local LiteLLM model alias and budgeted virtual key. Direct Baseten remains the default. Review uses DeepSeek. Runs support prompt and verification iteration; no model comparison workflow is provided. Local provider credentials in ignored `.env.local` are for developer runs. Tester-provided keys will be added after the working app exists.

The generation prompt lives locally at `src/prompt.ts`. Run `pnpm playground -- prompts publish` to publish a `production` version for each CBC fixture in Langfuse: `nova-lesson-generation` for particles and `nova-lesson-generation-changes` for changes. Set `LANGFUSE_USE_MANAGED_PROMPTS=true` to fetch the matching version for generation. Runs record the prompt source, name, and version; generation spans link to the managed version. Lookup failures use the local template and record a fallback reason. Review prompts remain local. Publishing is explicit, so ordinary runs never create prompt versions.

Generation and advisory review use separate model aliases. Set `LITELLM_GENERATOR_MODEL` and `LITELLM_REVIEWER_MODEL` for proxy-routed calls, or `BASETEN_GENERATOR_MODEL` and `BASETEN_REVIEWER_MODEL` for the direct route. Each falls back to the existing single-model setting. The reviewer provides evidence-linked advice only; a human curriculum lead makes workflow decisions. See [tester BYOK design](../../docs/tester-byok.md).

Generation runs send deterministic verification scores to Langfuse when a valid traced attempt and credentials exist. Live review is an advisory LLM judge over a frozen plan and source snapshot; generation-run reviews attach finding counts to the generation observation, while saved-plan reviews attach them to the judge observation. `plans review <plan-id>` defaults to the current immutable version; `--version <version-id>` reviews an older one. Results are separate reports and never change content, versions, or workflow status. Each plan version freezes its CBC fixture evidence for repeatable review. Mock reviews never publish judge scores. `pnpm playground -- dataset export` writes stable JSONL replay inputs; historical outputs and repair attempts stay in metadata. Add `--sync` only when you want to create or update the Langfuse dataset. `pnpm playground -- costs --json` summarizes saved generation and review runs by provider and model; provider-reported and estimated costs are separate. The summary does not trigger new calls or a model comparison.

`pnpm playground -- review-eval --live --via-litellm` runs the DeepSeek judge through LiteLLM against four labelled examples: clean and deliberately corrupted plans for each CBC target. Omit `--via-litellm` to call Baseten directly. The report includes accepted defect detections, expected source citations, rationale concept checks, false alarms on clean plans, invalid review outputs, schema validity, usage, cost estimates, and evidence hashes. Accepted review results emit expected-behavior, expected-evidence, rationale, false-alarm, and schema-validity scores on their Langfuse review observations; failed or invalid reviews are not scored. Review-evaluation dataset exports deduplicate unchanged frozen cases across reruns, keep the latest judge observation in metadata, and create a new item ID when rubric or expected labels change. The current label set is `cbc-review-v3`; syncs to `nova-lesson-review-evaluation-v4`, preserving prior datasets. Langfuse sync does not delete stale items. The default mock judge is a plumbing check and cannot detect injected defects. This small synthetic set is an iteration signal, not a broad quality claim; see [review evaluation](../../docs/playground/review-evaluation.md).

Generation reports under `.cache/playground/runs` contain candidate/model IDs, retrieval ranking and cache counts, exact prompt and JSON Schema, prompt source/name/version, raw attempts, token usage when returned, estimated Baseten cost or LiteLLM's reported response cost, deterministic checks, and the selected content. Direct cost estimates use the current public token rates for the exact Baseten model ID, include cached-input discounts when the provider returns cached-token usage, and record the pricing source and check date. Estimates are omitted for unknown model IDs, missing input/output usage, or a redirected non-Baseten endpoint. Review reports bind an immutable content snapshot and frozen source context to a generation run or saved plan version with an input hash; they preserve the review prompt, rubric version, raw attempts, evidence-linked findings, schema and deterministic reference checks. Review findings are advisory and do not change content or workflow state. `pnpm playground -- schema` exports both JSON Schemas under `docs/playground`.

Set `OTEL_ENABLED=true` in `.env.local` to emit a CLI command trace to the local Collector. Generation traces include retrieval and model-call spans; review traces include model-call spans. The Collector sends each trace to Tempo and the local Langfuse v4 service. The run report and CLI output carry the trace ID for lookup in Grafana Explore using Tempo or Langfuse. Set `LANGFUSE_CAPTURE_PROMPTS=true` to include synthetic prompt and response content on LLM spans; it defaults to false. The CLI uses the `nova-playground` service name and honors `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Fixture and invariants

The first slice is Grade 8 Integrated Science under Kenya CBC. It has two target fixtures: KICD specific learning outcome 1.2(a) on particle characteristics, and 1.2(c) on distinguishing physical and chemical changes. Each internal target ID is separate from its curriculum locator. Teaching, scheme, assessment and lead-guidance choices are explicitly synthetic. The particle-size emphasis comes from a synthetic teaching note, not the KICD outcome. See each source locator in the run's frozen retrieval snapshot.

The fixture records live in `src/corpus-data.json` and are parsed against strict runtime schemas when the CLI loads them. Run `pnpm playground -- schema` to export the corpus shape alongside lesson and review schemas. Startup invariants check unique fixture/chunk/target/objective IDs, the 8–12 document scope, one matching CBC target with KICD provenance per fixture, and evidence references with the required chunk types. Cross-record rules also run at startup because JSON Schema cannot express every relationship. The two CBC fixtures contain 14 chunks across nine source documents: one KICD curriculum document and eight synthetic school documents. The particle fixture has nine chunks: one KICD outcome plus eight synthetic support chunks. Local BGE-small-en-v1.5 defaults to revision `main`; set `EMBEDDING_MODEL` and `EMBEDDING_MODEL_REVISION` together when changing models, and use an immutable commit ID to pin artifacts. Vector cache keys include provider, model revision, pipeline, dimensions, role, and text; run and retrieval-evaluation reports record the revision. Retrieval always includes the selected curriculum target and applicable lead guidance, then adds the three highest-ranked remaining chunks. Mock commands select a deterministic token-hash embedder automatically, so they do not download model weights. Run reports freeze the selected chunk records and source locators; review reads that snapshot rather than the current corpus.

`retrieval-eval` currently ranks the nine particle-fixture chunks against eight queries with graded synthetic relevance labels, including direct questions about lead constraints and accessible participation before mandatory-source pinning. It reports nDCG@3, Hit@1, Recall@3, and grade-2 selection coverage after mandatory-source pinning, and saves each full report with corpus and label hashes. `--mock` checks evaluation plumbing, not embedding quality. These labels are a first diagnostic for the fixture, not evidence that the corpus covers CBC broadly; review the label set and add independently grounded targets before tuning the embedding layer. See [retrieval evaluation](../../docs/playground/retrieval-evaluation.md).

`plans import` turns a generation report with schema-valid lesson content into a teacher-owned Draft, even when deterministic QA found gaps. It freezes the report's exact retrieved chunks and records generation run/candidate provenance. Content-less and blocked candidates cannot be imported. If a report has multiple importable candidates, pass `--candidate <candidate-id>`. `plans author` accepts a teacher-authored `LessonContent` JSON file and makes no model call. Both paths run deterministic QA and store immutable versions under `.cache/playground/plans/`. A schema-valid plan with QA gaps can remain Draft, but submission is blocked until checks pass. Teacher edits preserve each version's source snapshot; editing a Returned plan resets it to Draft and requires resubmission. Lead return decisions need a comment; publish records the exact submitted version. These CLI actor IDs simulate the workflow and do not provide authentication. Each write emits a trace, structured log, and Langfuse/Prometheus deterministic QA score. See [plan workflow](../../docs/playground/plan-workflow.md).

The output contract in `src/domain.ts` requires objectives, materials, timed teacher and learner actions, checks for understanding, and source IDs. `pnpm playground -- schema` exports lesson and review contracts plus the CBC corpus data shape into `docs/playground/`. Baseten receives strict JSON Schema response formats for both calls; local checks still validate every response. The provider schema constrains source IDs to retrieved chunks; citation uniqueness is enforced locally because Baseten returned HTTP 500 when the schema included `uniqueItems`, while the same request without that keyword succeeded. Deterministic generation checks cover exact timing, unique section IDs and citations, retrieved-source membership, target citation, instructional evidence in every activity, fixture-designated teaching evidence in the main activity and assessment evidence in checks, objective links, accessibility, and safety. These citation checks require the expected source IDs in key sections; the review judge and human lead assess whether cited text supports each claim. Retrieval pins those fixture-designated evidence chunks so generation can cite them. Review checks verify the exact snapshot ID, section paths, evidence IDs, and rubric version. One repair attempt is allowed. Provider failures carry stable codes such as `PROVIDER_AUTH_ERROR`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_INVALID_RESPONSE`, `OUTPUT_SCHEMA_INVALID`, and `VERIFICATION_FAILED`.

The performance brief calls for grounded AI generation, teacher editing, and lead review. Optional AI guidance is a playground experiment: it cannot edit, submit, or approve a plan. Jev remains a future classifier comparison.
