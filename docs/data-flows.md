# Data flows

Follow the implemented source, generation, and review paths here. See the [data model](domain-model.md) for records and the [ingestion proposal](corpus-ingestion.md) for future file handling.

## Source intake and publication

A Curriculum Lead submits text and metadata through the API. Each update creates an immutable resource revision. Publishing its target link makes the source eligible for retrieval.

```mermaid
flowchart TD
  Lead[Curriculum Lead] -->|source text + metadata| API[NestJS API]
  API --> Check{Target belongs to a published design?}
  Check -->|No| Reject[Reject with reason]
  Check -->|Yes| Resource[Create or reuse library resource]
  Resource --> Revision[Create immutable resource revision + content hash]
  Revision --> Chunk[Split revision into ordered chunks + locators]
  Chunk --> Embed[Embed chunks with local BGE-small, 384 dimensions]
  Embed --> Store[(Persist revision, chunks, vectors)]
  Store --> Draft[Create draft curriculum source link]
  Draft -->|Lead publishes| Published[Record publisher + timestamp]
  Published --> Eligible[Published source becomes retrievable]
```

## Generate a grounded draft

The API retrieves published evidence for the selected target, requests schema-constrained lesson content, and runs deterministic checks before saving. Invalid output gets one repair attempt. Rubric QA runs after persistence and provides advisory guidance.

```mermaid
flowchart TD
  Teacher[Teacher selects target + duration] --> Resolve[Resolve target + eligible published sources]
  Resolve -->|No defining source or target| Fail[Return clear error; save no draft]
  Resolve --> Query[Embed target query with BGE-small]
  Query --> Search[pgvector search scoped to target source links]
  Search --> Context[Build evidence context; pin official target excerpt]
  Context --> Generate[Generator adapter: mock or OpenAI-compatible provider]
  Generate --> Parse[Parse JSON + shared lesson-plan schema]
  Parse --> QA[Deterministic target, timing, structure, citation checks]
  QA -->|Pass| Persist[Save plan, immutable version, retrieved candidates, citations]
  QA -->|First failure| Repair[One repair attempt with validation feedback]
  Repair --> QA2[Repeat deterministic checks]
  QA2 -->|Pass| Persist
  QA2 -->|Fail| Reject[Reject; save no draft]
  Persist --> Rubric[Reviewer model scores six rubric dimensions]
  Rubric --> SaveQA[Save version-linked advisory result when available]
  SaveQA --> Draft[Return draft + deterministic checks + rubric guidance]
  Generate -. transient errors: up to 3 retries .-> Generate
  Rubric -. AI workflow trace + prompt capture .-> LF[Langfuse]
```

The failure outcomes are distinct:

- **Invalid lesson content:** one repair, then a clear error; no draft is saved.
- **Retryable provider failure:** up to three provider retries, then a clear error; no draft is saved.
- **Rubric failure:** the persisted draft remains available.

Generation and rubric traces carry request correlation. See [observability](observability.md) to inspect them.

## Edit, validate, and review

Saving an edit appends an immutable version. Rubric QA can assess any saved version and does not change plan status. Submission and publication run deterministic checks; the Curriculum Lead makes the publication decision.

```mermaid
flowchart TD
  Draft[Draft at version N] --> Edit[Teacher edits and saves]
  Edit --> Version[Persist immutable version N+1]
  Version --> Validate[Optional rubric QA for selected version]
  Validate --> Validation[Save scores, evidence, suggestions, model + prompt versions]
  Version --> Submit[Teacher submits latest version]
  Submit --> Lead[Curriculum Lead reviews exact submitted version]
  Lead -->|Return with comment| Returned[Returned]
  Returned --> Edit
  Lead -->|Publish after deterministic checks| Published[Published; read-only]
  Version -. new edit makes prior rubric result stale .-> Stale[UI marks old version result stale]
```

Reviews and validations reference the exact version assessed. Later edits leave that history intact and make the prior rubric result stale in the UI.
