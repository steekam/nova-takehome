# Performance task reviewer checklist

Check an item only when code or a repeatable run demonstrates it. Last verified: 20 October 2026.

## Corpus and retrieval

- [x] CBC corpus contains 10 mock documents across outcomes, schemes, assessments, and lead guidance.
- [x] Chunks keep stable document and chunk IDs; BGE-small vectors are cached and stored in pgvector.
- [x] Retrieval stays within selected subject and grade, pins the selected outcome, and returns source references.
- [x] Gate generation on the selected CBC target, lead guidance, lesson-focus, main-activity, and assessment evidence; fail with `RETRIEVAL_EVIDENCE_INSUFFICIENT` if any are missing. BGE scores overlap across relevant and irrelevant chunks, so no raw cosine cutoff is claimed. See [retrieval evaluation](playground/retrieval-evaluation.md).

## Generation and lesson-plan invariants

- [x] Teacher selects a CBC outcome and duration; API and shared Zod schema validate plan content.
- [x] API supports deterministic mock generation without paid credentials.
- [x] Live provider output receives one bounded correction attempt; schema, outcome, duration, and source checks run before saving.
- [x] Citations must exist and come from the frozen candidate set; selected outcome citation is required.
- [x] Invalid provider output saves no plan and returns a stable error code and message.
- [x] Product flow matches the brief: AI drafts; teachers edit and submit; curriculum leads approve or return with a comment.
- [x] Verify live DeepSeek generation after the bounded correction change: synthetic `changes` fixture passed all deterministic checks through the managed Langfuse prompt and LiteLLM alias in one attempt.

## State machine and access

- [x] API enforces `Draft → Submitted → Returned → Draft (edit) → Submitted`; direct resubmission from Returned is rejected. Published is terminal.
- [x] API and playground use the shared transition table; playground rejects saved status, version, event, and return-comment contradictions.
- [x] Invalid transitions return `409 PLAN_TRANSITION_INVALID` without mutation.
- [x] Transition guards preserve workflow invariants; failures name the correction and leave the plan unchanged.
- [x] Invalid request bodies return `400 VALIDATION_ERROR` with field-level correction details.
- [x] Return requires at least eight non-space feedback characters; missing feedback returns `REVIEW_COMMENT_REQUIRED`.
- [x] Submit checks schema, duration totals, real source IDs, and original retrieval candidates before transition.
- [x] Every teacher edit creates a new immutable version; transitions lock the plan row.
- [x] Server uses authenticated role and ownership checks; teachers read own and published plans; leads read submitted plans.
- [x] UI hides post-decision lead actions and clears the selected plan when it leaves the submitted queue.
- [x] Tests cover valid/invalid transitions, QA failures, grounding, role checks, and embedding cache behavior.

## End-to-end UI

- [x] Teacher and curriculum-lead sign-in works with seeded accounts.
- [x] Mock flow verified: generate, edit and submit, return with guidance, edit and resubmit, publish, read from teacher library.
- [x] UI shows quality checks, review feedback, loading/empty states, and server error messages.
- [x] Review keyboard-only navigation and focus states: skip link, form errors, submit success, and lead decision focus were checked with Tab and Enter.
- [x] Walkthrough captures an invalid-plan save, the actionable QA message, and the unchanged saved plan.

## Telemetry and demo

- [x] API and LiteLLM use OpenTelemetry; local stack includes Collector, Tempo, Prometheus, Loki, Grafana, and Langfuse.
- [x] Provider keys stay on the server/proxy; playground remains internal.
- [x] Verify a successful managed-prompt trace and deterministic score in Langfuse; LiteLLM returned model usage/cost. A temporary $0.000001 key was blocked after crossing its limit and deleted; the normal playground key was untouched.
- [x] Verify the playground generation trace in Langfuse and Tempo, its trace-correlated log in Loki, and a success counter in Prometheus.
- [x] Verify a live API generation in Langfuse with `nova-api` key alias, model, token usage, and cost; confirm its `trace_id` log in Loki, Prometheus outcome, and provisioned Grafana dashboard panel.
- [x] Create a 3–5 minute narrated personal preview covering live DeepSeek generation, teacher and lead state transitions, invalid-plan QA, Grafana/Langfuse traces, judge scores, and the labeled dataset. The internal playground stays out of the product walkthrough.
- [ ] Human records and uploads the submission Loom walkthrough, then adds its share link to the README.

## Setup and handoff

- [x] Node 24 and pnpm workspace; `.env.example` documents setup, Varlock validates `.env.schema`, and secrets live in ignored `.env.local`.
- [x] Drizzle migrations and repeatable additive seed are included; local smoke used pgvector PostgreSQL.
- [x] README documents stack, accounts, mock/live configuration, and workflow.
- [x] Consolidate Compose to one PostgreSQL and one Redis service; preserve the previous source volumes. See the [migration record](local-state-migration.md).
- [x] Final repository review and verification; typecheck, 70 tests, video stream/duration, and `git diff --check` pass.

## Reviewer questions

- Can a caller forge a role, owner, status, or curriculum citation?
- What happens when retrieval is weak or the provider returns invalid output?
- Which transitions are legal, and what data is immutable across revisions?
- Can the complete mock flow run without a provider key?
- Can a trace and cost be followed from API request through LiteLLM into the telemetry stack?
