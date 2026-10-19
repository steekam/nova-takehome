# Performance task reviewer checklist

Track each invariant from implementation through verification. Check an item only when the behavior is demonstrated by code or a repeatable manual/test path.

## Curriculum corpus and retrieval

- [ ] Seed 8–12 short mock curriculum documents for one subject.
- [ ] Include at least two documented document types (for example, scheme of work, learning outcome, assessment item).
- [ ] Document the corpus format and chunking rule.
- [ ] Ingest chunks with stable document and chunk references.
- [ ] Generate and persist an embedding for every chunk.
- [ ] Retrieve relevant chunks for a selected learning outcome and preserve source references.
- [ ] Handle an empty or weak retrieval result explicitly; never present an ungrounded plan as grounded.

## Grounded generation

- [ ] Teacher can select a learning outcome and lesson duration.
- [ ] Backend supplies retrieved curriculum material to the LLM.
- [ ] Define the lesson-plan schema and validate generated output on the server.
- [ ] Reject malformed, incomplete, or source-free model output with a clear response; retry/repair only if bounded and explained.
- [ ] Every accepted plan cites corpus chunks that exist in the database.
- [ ] Deterministic mock mode works without an API key or paid service.
- [ ] LLM timeout, unavailability, and invalid output fail safely and leave no misleading saved plan.
- [ ] AI is used for the generation step; editing, submission, review, and approval remain human-controlled.

## Authentication and access invariants

- [ ] Seed demo Teacher and Curriculum Lead users.
- [ ] Authenticate requests in the API; do not trust a client-supplied role or owner ID.
- [ ] Teacher can create and edit only their own drafts.
- [ ] Teacher cannot read another teacher's draft or publish a plan.
- [ ] Curriculum Lead can access submitted plans for review.
- [ ] Published plans are readable by all teachers.
- [ ] Automated tests cover role-based access and owner isolation.

## Workflow and version history

- [ ] Define allowed transitions for Draft, Submitted, Returned, and Published.
- [ ] Enforce transitions in the API and reject invalid transitions.
- [ ] Lead can return a submission with a comment or approve it for publication.
- [ ] Returned work can be edited and resubmitted.
- [ ] Save a new version for each teacher edit; preserve prior versions and their source citations.
- [ ] Published plans appear in the shared lesson bank.

## UI and usability

- [ ] Sign-in works for both seeded roles.
- [ ] Teacher can generate, edit, save, and submit a plan.
- [ ] Curriculum Lead can inspect a queue, return a plan with feedback, and publish it.
- [ ] Teacher can browse published plans.
- [ ] Loading, empty, validation, and generation-error states are understandable.
- [ ] Forms and navigation work with keyboard and have visible labels/focus states.
- [ ] Keep the UI to 2–4 clear screens; prioritize behavior over polish.

## Observability and demo

- [ ] Route real model calls through a LiteLLM model alias; mock mode bypasses the proxy and needs no provider key.
- [ ] Keep provider and proxy credentials on the server/proxy, never in browser code.
- [ ] Give LiteLLM a persistent database and demonstrate usage/cost tracking; verify the configured budget is enforced.
- [ ] Load or identify a versioned generation prompt in Langfuse and attach its version to the trace.
- [ ] Capture a Langfuse trace for a successful grounded plan and a failed/invalid generation; evaluate grounding on a small fixed fixture set.
- [ ] Initialize OpenTelemetry before Nest starts; confirm inbound HTTP, PostgreSQL, and outbound model-gateway spans where supported.
- [ ] Propagate trace context through LiteLLM and correlate the request in Tempo.
- [ ] Export traces through one Collector route to Tempo and Langfuse; avoid duplicate trace exporters.
- [ ] Expose request, error, latency, generation, and cost metrics to Prometheus.
- [ ] Send structured API/proxy logs to Loki with trace IDs; locate a failed request in Grafana.
- [ ] Keep prompt capture explicit and avoid user email or real learner data in telemetry.
- [ ] Include one Grafana dashboard or Explore walkthrough; defer dashboard polish and broad eval coverage if core requirements need time.

## Local setup and documentation

- [ ] App runs locally with a real database using a short, documented setup.
- [ ] Schema or migration files are included; seed users and corpus are repeatable.
- [ ] `.env.example` lists required configuration; secrets stay out of source control.
- [ ] README explains install/run in mock mode and with a real LLM key.
- [ ] README lists demo accounts and a suggested click-through.
- [ ] README explains backend boundaries, data model, corpus format, lesson-plan schema, grounding, and failure behavior.
- [ ] README records assumptions, tradeoffs, cuts, and sensible extensions.
- [ ] Automated tests cover role checks and LLM output validation.
- [ ] `AI_LOG.md` names tools and use, one caught/fixed AI mistake, and one independent engineering decision.
- [ ] Record and link a 3–5 minute Loom covering teacher flow, lead flow, design choices, and a generation failure.
- [ ] Final repo is ready to share by Monday, October 26, 2026 at 09:00 EAT.

## Reviewer's likely walkthrough questions

- [ ] Can a teacher forge a role, owner ID, source ID, or status in a request?
- [ ] What happens when retrieval finds no relevant source?
- [ ] How does the API prove each citation belongs to the retrieved corpus?
- [ ] What happens when the LLM returns invalid JSON, omits citations, or times out?
- [ ] Can someone explain the schema, transition rules, and each persisted version?
- [ ] Can the app run and demonstrate its main flow with no model credentials?
