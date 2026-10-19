# Performance task reviewer checklist

Check an item only when code or a repeatable run demonstrates it. Last verified: 20 October 2026.

## Corpus and retrieval

- [x] CBC corpus contains 10 mock documents across outcomes, schemes, assessments, and lead guidance.
- [x] Chunks keep stable document and chunk IDs; BGE-small vectors are cached and stored in pgvector.
- [x] Retrieval stays within selected subject and grade, pins the selected outcome, and returns source references.
- [ ] Define and test a relevance threshold for weak retrieval; no plan should appear grounded without enough evidence.

## Generation and lesson-plan invariants

- [x] Teacher selects a CBC outcome and duration; API and shared Zod schema validate plan content.
- [x] API supports deterministic mock generation without paid credentials.
- [x] Live provider output receives one bounded correction attempt; schema, outcome, duration, and source checks run before saving.
- [x] Citations must exist and come from the frozen candidate set; selected outcome citation is required.
- [x] Invalid provider output saves no plan and returns a stable error code and message.
- [x] Product flow matches the brief: AI drafts; teachers edit and submit; curriculum leads approve or return with a comment.
- [ ] Verify successful live DeepSeek generation after the bounded correction change. The smoke run before that change returned invalid output; no draft was saved.

## State machine and access

- [x] API enforces `Draft → Submitted → Returned → Draft` and `Submitted → Published`; Published is terminal.
- [x] Invalid transitions return `409 PLAN_TRANSITION_INVALID` without mutation.
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
- [ ] Review keyboard-only navigation and focus states.
- [ ] Capture one invalid-plan attempt in the walkthrough.

## Telemetry and demo

- [x] API and LiteLLM use OpenTelemetry; local stack includes Collector, Tempo, Prometheus, Loki, Grafana, and Langfuse.
- [x] Provider keys stay on the server/proxy; playground remains internal.
- [ ] Verify a successful provider trace, prompt version, model cost, and budget enforcement in Langfuse/LiteLLM.
- [ ] Show trace correlation across API, Collector, Tempo, and Langfuse; show API logs in Loki/Grafana.
- [x] Record a 3–5 minute walkthrough covering teacher flow, lead flow, design choices, and a generation failure. The video uses mock generation; live provider success is still unverified.

## Setup and handoff

- [x] Node 24 and pnpm workspace; Varlock validates `.env.schema`; secrets live in ignored `.env.local`.
- [x] Drizzle migrations and repeatable additive seed are included; local smoke used pgvector PostgreSQL.
- [x] README documents stack, accounts, mock/live configuration, and workflow.
- [x] Consolidate Compose to one PostgreSQL and one Redis service; preserve the previous source volumes. See the [migration record](local-state-migration.md).
- [ ] Final repository review and remaining verification.

## Reviewer questions

- Can a caller forge a role, owner, status, or curriculum citation?
- What happens when retrieval is weak or the provider returns invalid output?
- Which transitions are legal, and what data is immutable across revisions?
- Can the complete mock flow run without a provider key?
- Can a trace and cost be followed from API request through LiteLLM into the telemetry stack?
