# Performance task reviewer checklist

Evidence for the implemented CBC slice, checked 20 October 2026. Keep the playground's evaluation corpus separate from the product seed.

## Product corpus and generation

- [x] Seed has nine short source resources across six types: one official KICD outcome excerpt and eight synthetic supports. Only Grade 8 Integrated Science `1.2(a)` is generation-ready; other seeded CBC paths are browse-only.
- [x] Source records keep curriculum path, edition, authority, locator, revision, source URL, role, and synthetic status. Nine short chunks have stable IDs and 384-dimensional BGE-small vectors in pgvector.
- [x] Retrieval pins the target-defining official excerpt and selects supporting chunks linked to the selected target.
- [x] Generation validates the shared lesson schema, selected curriculum target, exact duration, activity-time total, official target citation, and citation membership in the frozen candidate set.
- [x] A source-less target fails before generation with `CURRICULUM_SOURCES_MISSING`. Invalid model output gets one correction attempt; exhausted attempts return `LLM_INVALID_RESPONSE` without saving a draft.
- [x] The internal playground has a separate nine-document fixture and labeled retrieval evaluation. Its evidence-coverage gate and ranking scores are engineering signals for those fixtures, not claims about general CBC coverage.

## Plan workflow and access

- [x] Server-enforced roles and ownership; teachers read their plans and published plans, Curriculum Leads review submitted plans, and both roles can read published plans.
- [x] Legal transitions: Draft → Submitted → Returned → Draft on edit → Submitted → Published. Published plans are terminal.
- [x] Each teacher edit creates an immutable version. Review records point to the exact version reviewed; writes and state changes share a row-locked database transaction.
- [x] Invalid transitions, short return comments, invalid lesson content, duration mismatches, missing source references, and forged/non-candidate citations return stable errors without mutating saved plans.
- [x] Database-backed HTTP workflow coverage exercises generation, no-source failure, role restrictions, edit, submit, return, resubmit, publish, history, and terminal-state enforcement.

## UI and scope

- [x] Teacher and Curriculum Lead sign-in, plan creation/editor, review queue, published lesson bank, and curriculum library are present.
- [x] Browser walkthrough completed: teacher generation, edit, submit; lead return with feedback; teacher edit and resubmit; lead publish; history and QA visible.
- [x] Curriculum library is browse-and-inspect only. It shows hierarchy, revisions, source provenance, references, and readiness. Source authoring and publication remain seed/import capabilities; the upload/extraction/approval flow is documented as a future extension.
- [x] UI failure feedback shows API validation details; failed saves keep the saved version unchanged.

## Setup, observability, and verification

- [x] Node 24 and pnpm workspace; Varlock validates `.env.schema`; secrets stay in ignored `.env.local`.
- [x] Migrations enable pgvector. Compose uses one shared PostgreSQL service and one Redis service; migrated data and volumes were preserved. See [migration record](local-state-migration.md).
- [x] `pnpm demo:check` verified all eight app and observability endpoints and printed URLs plus the active LLM mode.
- [x] `pnpm typecheck` and `pnpm build` pass across the workspace. Build emits upstream Zod annotation notices and a Vite main-chunk warning (~553 kB, 170 kB gzip).
- [x] `pnpm test`: 52 playground, 19 API unit, and 4 API HTTP tests passed; one unit test and the database workflow test were skipped because no test DB was set in that command.
- [x] `TEST_DATABASE_URL=… pnpm --filter @nova/api test:e2e`: all five API e2e tests passed against the disposable migrated/seeded database, including the full HTTP workflow.
- [x] Full seeded browser workflow completed against a disposable database. The existing Compose volumes and `nova_hub` data were left intact.
- [ ] Human records and uploads the submission Loom, then adds its share link to the README.

## Known limits

- One official curriculum target is source-backed. Other CBC paths are catalogue examples, not curriculum coverage claims.
- Deterministic checks enforce structure, scope, duration, source identity, and citation membership. They do not prove that every lesson claim is semantically entailed by its cited passage.
- The library has no user-facing source authoring or upload workflow. The proposed pipeline is in [source ingestion extension](source-ingestion-extension.md).
- The local retrieval labels are synthetic and small. Do not interpret their scores as a general embedding-quality guarantee.
- The production web bundle still has a >500 kB Vite chunk warning.

## Reviewer questions

- Can a caller forge a role, owner, workflow state, or curriculum citation?
- What happens when the selected target has no approved defining source or a provider returns invalid output?
- Which transitions are legal, and which version did the Curriculum Lead review?
- Can the complete mock flow run without an LLM provider key?
- Can a reviewer trace a source reference to its curriculum revision and locator?
- Which parts are real curriculum evidence, and which are synthetic demo supports?
