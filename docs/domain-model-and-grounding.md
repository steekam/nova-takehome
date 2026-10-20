# Domain model and grounding

This page summarizes the implemented CBC slice. The [zoomable data schema](system-data-schema.html) is the visual reference; [shared lesson schemas](../packages/shared/src/index.ts) define the API contract.

## Curriculum catalogue

```text
Framework → Programme → Level + Subject → Offering → Design version
                                                   └→ Curriculum nodes → Target revisions
```

Framework and programme codes are controlled values. Grades are structured levels; subjects are separate records. A design version owns its hierarchy and target revisions, so the printed locator (for example, `1.2(a)`) is only meaningful within that edition. Nova IDs identify records; they do not replace publisher codes or source locators.

The demo catalogue contains five CBC offerings. Only Grade 8 Integrated Science, July 2024, target `1.2(a)` has an official source and supports generation. The other catalogue paths are browse-only examples.

## Source library and retrieval

```text
Library resource → immutable resource revision → source chunks + 384-d vector
                                      └→ target source link (role, status)
Lesson plan ──→ frozen retrieval-candidate chunk IDs
```

The seed has nine short resources across six types: one official KICD excerpt and eight clearly labelled synthetic supports. Resource type, authority, revision, and source-link role are separate fields. A target is generation-ready only when its published design has a published official `defines_target` source.

Retrieval filters to published links and revisions, scopes candidates to the selected target, and pins its official defining excerpt. The API stores unique candidate chunk IDs. Retiring a source excludes it from future retrieval; it does not rewrite immutable lesson versions or erase their resolvable citations.

Curriculum Leads can record `lead_guidance` and `exemplar` resources through the controlled source API. The current library UI only browses and inspects records; seed/import paths populate the demo data. The proposed upload, extraction, and approval flow is in the [source-ingestion extension](source-ingestion-extension.md).

## Lesson plan and review

`lesson_plans` holds the teacher owner and workflow status. Every edit creates an immutable `lesson_plan_versions` row with the selected target revision and content snapshot. `lesson_plan_version_sources` records cited chunks, `lesson_plan_retrieval_candidates` freezes the generation set, and each `plan_reviews` row references the exact version reviewed.

The same shared content schema validates generated drafts and teacher edits:

```json
{
  "title": "Particles in the three states",
  "subject": "Integrated Science",
  "grade": "Grade 8",
  "learningOutcome": "Describe the characteristics of particles in the three states of matter.",
  "durationMinutes": 40,
  "objectives": ["Compare particle spacing and movement in each state."],
  "materials": ["Particle cards"],
  "starter": "Compare three particle diagrams.",
  "activities": [{
    "title": "Build a model",
    "description": "Model the spacing and movement of particles.",
    "durationMinutes": 30
  }],
  "checkForUnderstanding": "Explain one difference between a liquid and a gas.",
  "sources": [{ "documentId": "00000000-0000-4000-8000-000000000001", "chunkId": "00000000-0000-4000-8000-000000000002" }]
}
```

The API checks schema, selected target, duration, activity-time total, the official target citation, and membership in the frozen candidate set before saving, submitting, and publishing. These checks prove structural validity and traceability; they do not prove that every lesson claim follows from its citation.

```text
Draft ──submit──▶ Submitted ──return + comment──▶ Returned ──edit──▶ Draft
                         └──publish────────────▶ Published (terminal)
```

Teachers edit only their own drafts. Leads decide on submitted plans. Editing a returned plan creates a new version and requires resubmission. The AI call creates a draft; the teacher edits it and the Curriculum Lead makes the publication decision.

For the tester click-through and local setup, use the [README](../README.md). For telemetry and the internal evaluation tools, see [observability](observability.md) and the [playground docs](playground/embedding-corpus-guide.md).
