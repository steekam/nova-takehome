# AI log

## How I used AI

I used Codex to explore the domain model, implement the API and web app, and
write tests and documentation. Parallel agents reviewed architecture,
correctness, and cleanup. Web research helped with provider, Langfuse, and
OpenTelemetry integrations. I reviewed the proposals and checked the result
through tests and live workflow runs.

## A schema proposal I corrected

The early design kept curriculum hierarchy inside source documents. I asked
how it would handle another grade, subject, curriculum edition, or source
update. Working through those examples exposed the coupling between the
curriculum catalogue and its supporting material.

I directed a separate, structured catalogue with versioned curriculum targets
and explicit links to source revisions. Publisher outcome locators are scoped
to a curriculum design version; internal IDs identify records. This makes
curriculum selection and validation explicit while preserving which sources
supported a lesson.

## A scope decision I made

I narrowed source ingestion to text and metadata: create a draft revision,
chunk and embed it, and link it to a curriculum target. A separate Curriculum
Lead action publishes it. File upload, extraction, and source-management
screens remain outside this slice.

That preserves source history and publication control while keeping the work
focused on the required CBC flow: generate, edit, submit, review, and publish.
