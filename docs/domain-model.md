# Domain model

This reference describes the implemented Kenya CBC slice. The database schema
files under `apps/api/src/database/schema` and contracts under
`packages/shared/src/contracts` are authoritative.
The diagrams highlight key fields; the schema files define every column and
constraint.

Zoomable entity diagrams: [system diagram board](https://www.tldraw.com/f/bmp8NfBjhONWbeWKxZ7M9).

## Curriculum catalogue

```text
Framework → Programme → Level + Subject → Offering → Design version
                                                   ├→ Curriculum nodes
                                                   └→ Target revisions
```

Frameworks, programmes, levels, subjects, offerings, and design versions are
separate records. A design version owns its hierarchy and target revisions.
Publisher locators such as `1.2(a)` are meaningful within that version; Nova
UUIDs identify records but do not replace source codes or locators.

Curriculum nodes represent hierarchy such as strands, sub-strands, topics, and
sections. A target revision stores the teachable statement, kind, and locator.
The selected target revision is attached to each lesson plan version.

The demo catalogue includes multiple CBC paths. Grade 8 Integrated Science,
July 2024, target `1.2(a)` is the source-backed generation path. Other seeded
paths demonstrate catalogue browsing.

### Catalogue and source tables

The catalogue separates reusable framework, programme, level, and subject
records from each edition's hierarchy and teachable target revisions.

```mermaid
erDiagram
  CURRICULUM_FRAMEWORKS {
    uuid id PK
    string code UK
    string name
    string authority
  }
  CURRICULUM_PROGRAMMES {
    uuid id PK
    uuid framework_id FK
    string code
    string name
    int sort_order
  }
  CURRICULUM_LEVELS {
    uuid id PK
    uuid programme_id FK
    enum kind
    string code
    string label
  }
  CURRICULUM_SUBJECTS {
    uuid id PK
    uuid framework_id FK
    string code
    string name
  }
  CURRICULUM_OFFERINGS {
    uuid id PK
    uuid programme_id FK
    uuid level_id FK
    uuid subject_id FK
    string external_code
  }
  CURRICULUM_DESIGN_VERSIONS {
    uuid id PK
    uuid offering_id FK
    uuid source_resource_revision_id FK
    string edition_label
    int revision_number
    enum origin
    enum status
    uuid supersedes_id FK
  }
  CURRICULUM_NODES {
    uuid id PK
    uuid design_version_id FK
    uuid parent_node_id FK
    enum kind
    string code
    string label
    string source_locator
  }
  CURRICULUM_TARGET_REVISIONS {
    uuid id PK
    uuid design_version_id FK
    uuid node_id FK
    enum kind
    string source_locator
    string title
    string statement
  }
  LIBRARY_RESOURCES {
    uuid id PK
    enum resource_type
    string title
    enum authority
  }
  LIBRARY_RESOURCE_REVISIONS {
    uuid id PK
    uuid resource_id FK
    int revision_number
    string edition_label
    string source_url
    string content_hash
    text content
    enum status
    uuid created_by FK
  }
  LIBRARY_RESOURCE_CHUNKS {
    uuid id PK
    uuid resource_revision_id FK
    int ordinal
    string locator
    text content
    vector embedding_384
  }
  CURRICULUM_SOURCE_LINKS {
    uuid id PK
    uuid target_revision_id FK
    uuid resource_revision_id FK
    enum role
    enum status
    uuid added_by FK
    uuid published_by FK
  }
  USERS {
    uuid id PK
    string email UK
    enum role
  }

  CURRICULUM_FRAMEWORKS ||--o{ CURRICULUM_PROGRAMMES : contains
  CURRICULUM_FRAMEWORKS ||--o{ CURRICULUM_SUBJECTS : defines
  CURRICULUM_PROGRAMMES ||--o{ CURRICULUM_LEVELS : offers
  CURRICULUM_PROGRAMMES ||--o{ CURRICULUM_OFFERINGS : groups
  CURRICULUM_LEVELS o|--o{ CURRICULUM_OFFERINGS : scopes
  CURRICULUM_SUBJECTS ||--o{ CURRICULUM_OFFERINGS : appears_in
  CURRICULUM_OFFERINGS ||--o{ CURRICULUM_DESIGN_VERSIONS : editions
  CURRICULUM_DESIGN_VERSIONS o|--o{ CURRICULUM_DESIGN_VERSIONS : supersedes
  CURRICULUM_DESIGN_VERSIONS ||--o{ CURRICULUM_NODES : contains
  CURRICULUM_NODES o|--o{ CURRICULUM_NODES : parent_of
  CURRICULUM_NODES ||--o{ CURRICULUM_TARGET_REVISIONS : organizes
  CURRICULUM_DESIGN_VERSIONS ||--o{ CURRICULUM_TARGET_REVISIONS : publishes
  LIBRARY_RESOURCES ||--o{ LIBRARY_RESOURCE_REVISIONS : revisions
  LIBRARY_RESOURCE_REVISIONS ||--o{ LIBRARY_RESOURCE_CHUNKS : chunks
  CURRICULUM_TARGET_REVISIONS ||--o{ CURRICULUM_SOURCE_LINKS : supported_by
  LIBRARY_RESOURCE_REVISIONS ||--o{ CURRICULUM_SOURCE_LINKS : linked_as
  LIBRARY_RESOURCE_REVISIONS o|--o{ CURRICULUM_DESIGN_VERSIONS : imported_from
  USERS o|--o{ LIBRARY_RESOURCE_REVISIONS : created
  USERS ||--o{ CURRICULUM_SOURCE_LINKS : added
  USERS o|--o{ CURRICULUM_SOURCE_LINKS : publishes
```

The source-link table is the many-to-many join between a target revision and a
resource revision. Its role and publication state determine whether a source
can support retrieval. `curriculum_nodes.parent_node_id` models nested strands,
sub-strands, topics, and sections inside one design version.

## Source library and grounding

```text
Library resource → immutable resource revision → chunks + embedding
                                             └→ curriculum source link
Lesson plan ─────→ retrieval candidate chunks
Lesson version ──→ cited chunks
```

Resources have a type and authority. Revisions have content, edition, hash, and
publication state. Chunks belong to one revision and store 384-dimensional
BGE-small vectors. Curriculum source links connect resource revisions to
curriculum targets with a role, such as `defines_target`, `lead_guidance`, or
`exemplar`. Lesson-version citations point to individual chunks.

Retrieval scopes to the selected target and its published eligible sources. It
pins the official target-defining material and selects supporting chunks. The
lesson plan stores the candidate set from generation; each lesson version
stores its citations. Candidate membership is shared across edits to that
plan. Link and revision records have a `retired` status, and retrieval only
uses published records. No source-retirement action is exposed through the API;
existing plan candidates and citations remain stored if a record's status
changes.

The web library browses catalogue content. Curriculum Leads can submit source
text and metadata through the API; this creates a draft resource revision,
chunks, and target link. A separate API action publishes the link. File upload,
extraction, and source-management screens are not implemented.

## Lesson plan content

The shared `LessonPlanContentSchema` validates both generated drafts and
teacher edits. Each immutable version stores:

- Title, subject, grade, and selected learning outcome.
- Lesson duration and measurable objectives.
- Materials and starter activity.
- Timed activities.
- Check for understanding.
- Source citations, each identifying a document and chunk.

The API checks schema validity, selected target values, requested duration,
activity-time total, unique citations, the official target citation, and
membership in the frozen retrieval set. These checks establish structure and
provenance; they do not prove that every instructional claim follows from its
citation.

## Versions, decisions, and validation

`lesson_plans` stores the owner, current state, and optional `deleted_at`.
Teachers can remove unreviewed drafts from their workspace; soft deletion keeps
their immutable versions. Plans with review history, in review, returned, and
published plans stay visible for audit. Each edit creates a new `lesson_plan_versions`
row with a content snapshot and exact target revision.
Retrieval candidates and cited sources are stored against the relevant version.
Each review row references the exact version the Curriculum Lead decided on.

Rubric QA also references an immutable lesson version. It records its status,
rubric and prompt versions, reviewer model, summary, six scored dimensions,
evidence, suggestions, trace ID, and timestamp. The six dimensions are outcome
alignment, objective measurability, activity alignment, assessment quality,
pacing feasibility, and source support. QA results do not change workflow state.

### Lesson-plan and audit tables

The plan row owns the workflow state; immutable versions hold the content. Review
decisions and rubric validations point to the exact version they assessed.

```mermaid
erDiagram
  USERS {
    uuid id PK
    string email UK
    enum role
  }
  CURRICULUM_TARGET_REVISIONS {
    uuid id PK
    string source_locator
    string title
    string statement
  }
  LIBRARY_RESOURCE_CHUNKS {
    uuid id PK
    uuid resource_revision_id FK
    int ordinal
    string locator
    text content
    vector embedding_384
  }
  LESSON_PLANS {
    uuid id PK
    uuid teacher_id FK
    enum status
    datetime created_at
    datetime updated_at
    datetime deleted_at
  }
  LESSON_PLAN_VERSIONS {
    uuid id PK
    uuid lesson_plan_id FK
    uuid target_revision_id FK
    int version
    jsonb content
    uuid created_by FK
    datetime created_at
  }
  LESSON_PLAN_RETRIEVAL_CANDIDATES {
    uuid id PK
    uuid lesson_plan_id FK
    uuid resource_chunk_id FK
  }
  LESSON_PLAN_VERSION_SOURCES {
    uuid id PK
    uuid lesson_plan_version_id FK
    uuid resource_chunk_id FK
  }
  PLAN_REVIEWS {
    uuid id PK
    uuid lesson_plan_id FK
    uuid lesson_plan_version_id FK
    uuid curriculum_lead_id FK
    enum decision
    string comment
    datetime created_at
  }
  LESSON_PLAN_VALIDATIONS {
    uuid id PK
    uuid lesson_plan_id FK
    uuid lesson_plan_version_id FK
    string status
    string rubric_version
    string prompt_version
    string reviewer_model
    jsonb dimensions
    string trace_id
    datetime created_at
  }

  USERS ||--o{ LESSON_PLANS : owns
  LESSON_PLANS ||--o{ LESSON_PLAN_VERSIONS : versions
  USERS ||--o{ LESSON_PLAN_VERSIONS : authors
  CURRICULUM_TARGET_REVISIONS o|--o{ LESSON_PLAN_VERSIONS : targets
  LESSON_PLANS ||--o{ LESSON_PLAN_RETRIEVAL_CANDIDATES : freezes
  LIBRARY_RESOURCE_CHUNKS ||--o{ LESSON_PLAN_RETRIEVAL_CANDIDATES : retrieved
  LESSON_PLAN_VERSIONS ||--o{ LESSON_PLAN_VERSION_SOURCES : cites
  LIBRARY_RESOURCE_CHUNKS ||--o{ LESSON_PLAN_VERSION_SOURCES : cited_chunk
  LESSON_PLANS ||--o{ PLAN_REVIEWS : reviewed
  LESSON_PLAN_VERSIONS ||--o{ PLAN_REVIEWS : decision_for
  USERS ||--o{ PLAN_REVIEWS : curriculum_lead
  LESSON_PLANS ||--o{ LESSON_PLAN_VALIDATIONS : validated
  LESSON_PLAN_VERSIONS ||--o{ LESSON_PLAN_VALIDATIONS : validation_for
```

The current plan version is selected by its highest version number; the plan row
does not store a separate current-version pointer. Retrieval candidates are
frozen per plan, while citations are recorded per version. Reviews and
validations use a composite foreign key so their version must belong to the
same plan.

Teachers author and edit their own plans. Curriculum Leads review submitted
plans. State transitions and guards are shown in the
[workflow state charts](workflow-state-charts.md).
