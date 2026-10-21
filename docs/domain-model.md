# Domain model

This reference describes the implemented Kenya CBC slice. The database schema
files under `apps/api/src/database/schema` and contracts under
`packages/shared/src/contracts` are authoritative.

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

`lesson_plans` stores the owner and current state. Each edit creates a new
`lesson_plan_versions` row with a content snapshot and target revision.
Retrieval candidates and cited sources are stored against the relevant version.
Each review row references the exact version the Curriculum Lead decided on.

Rubric QA also references an immutable lesson version. It records its status,
rubric and prompt versions, reviewer model, summary, six scored dimensions,
evidence, suggestions, trace ID, and timestamp. The six dimensions are outcome
alignment, objective measurability, activity alignment, assessment quality,
pacing feasibility, and source support. QA results do not change workflow state.

Teachers author and edit their own plans. Curriculum Leads review submitted
plans. State transitions and guards are shown in the
[workflow state charts](workflow-state-charts.md).
