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
Lesson version ──→ cited chunks
Generation run ──→ frozen retrieval candidate IDs
```

Resources have a type and authority. Revisions have content, edition, hash, and
publication state. Chunks belong to one revision and store 384-dimensional
BGE-small vectors. Curriculum source links connect revisions or chunks to
curriculum targets with a role, such as `defines_target`, `lead_guidance`, or
`exemplar`.

Retrieval scopes to the selected target and its published eligible sources. It
pins the official target-defining material and selects supporting chunks. The
generation run stores candidate IDs; the lesson version stores citations.
Retiring a source affects future retrieval and leaves prior versions and
citations intact.

The library screens browse catalogue content. Seed/import paths populate the
demo corpus; a full source-upload and approval workflow is not implemented.

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

```text
Draft → Submitted → Published
          └→ Returned → edit creates Draft version → Submit again
```

Teachers author and edit their own plans. Curriculum Leads review submitted
plans. Return decisions require a meaningful comment. Invalid transitions and
failed deterministic checks return stable API error codes and do not mutate the
plan.
