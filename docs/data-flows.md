# Data flows

These diagrams follow the implemented source, generation, authoring, and review
paths. The [domain model](domain-model.md) lists the persisted entities and
attributes; the [architecture](architecture.md) shows the runtime services.

Zoomable workflow diagrams: [system diagram board](https://www.tldraw.com/f/bmp8NfBjhONWbeWKxZ7M9).

## Source intake and publication

Curriculum Leads submit source text and metadata through the API. Each update
creates a new immutable resource revision; publishing its target link makes the
source eligible for retrieval.

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

The API retrieves published evidence for the selected target, asks the configured
provider for schema-constrained lesson content, and runs deterministic checks
before saving. One repair call follows a failed first response. Rubric QA runs
after draft persistence and is advisory.

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

Transport retries happen inside each provider completion call and respect
`Retry-After` with jitter. Generation and rubric QA have separate Langfuse
traces; each trace carries request correlation. Rubric failure does not undo the
persisted draft.

## Edit, validate, and review

Teacher edits create new immutable versions. Rubric validation can run against
any saved version. Submission and publication use deterministic checks; the
Curriculum Lead's decision remains the publication gate.

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

Review decisions and validation rows reference the exact lesson-plan version.
Rubric validation does not change plan status; submission and publication do.
