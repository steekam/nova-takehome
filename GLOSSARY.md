# Project glossary

Use these terms consistently in the app, schema, demo, and project docs. Curriculum definitions below describe how this project uses the terms; the selected publisher's curriculum source remains the authority for official wording.

## Curriculum terms

**CBC (Competency-Based Curriculum).** The framework named in the performance brief and in KICD's revised Grade 8 design. Use “CBC” for the task's teacher context. Refer to the source itself as the “KICD Grade 8 Junior School Integrated Science design.”

**Curriculum framework.** The organizing system published by an authority. This task models Kenya's CBC as defined in KICD curriculum designs.

**Programme.** A named pathway within a framework, such as KICD Junior School. A subject code or learning target belongs to its programme and release; do not treat it as globally unique.

**Curriculum release.** The exact dated edition or syllabus version being modelled. Store the source file, release label, and locators together. A later release is a separate record even when most content is unchanged.

**Curriculum level and local school level.** The level named by the KICD design and the school's own grade/year. Store them separately and add an explicit mapping when known.

**Course offering.** A valid combination of framework release, programme, curriculum level, and subject offering. Use this to prevent targets from unrelated programmes or levels entering a lesson request.

**Curriculum target.** A normalized record for an official learning requirement while preserving KICD's source term, such as specific learning outcome. Keep its authority wording and source locator.

**Core competency.** A capability learners develop across learning areas, such as communication and collaboration or critical thinking and problem-solving. Include one only when the lesson activities give learners a chance to demonstrate it.

**Grade 8 / Junior School.** The learner level and stage named in the selected KICD design. Use both in curriculum metadata when they help distinguish a source.

**Key inquiry question.** A broad question from the curriculum design that guides exploration in a sub-strand. Keep the KICD question linked to its source; label a teacher-created question as an adaptation.

**Learning area.** KICD's term for a subject, such as Integrated Science. Use “learning area” when discussing the curriculum. Use `subject` in the current shared and API schemas; “Subject” also works in teacher-facing UI copy.

**Lesson objective.** A lesson-specific, observable aim derived from a selected curriculum target. It narrows the lesson's focus; it does not replace or rewrite the official target.

**Pertinent and Contemporary Issue (PCI).** A real-world issue connected to learning, such as safety or financial literacy. Add it only when the lesson addresses it through a concrete activity.

**Scheme of work.** A teacher's sequence of learning across a term or unit. It gives lesson-level planning context; it is not the same record as a generated lesson plan.

**Specific learning outcome (SLO).** KICD's curriculum statement describing what a learner should be able to do. The teacher selects a target before generation. Store its stable ID and source reference; do not let the model invent or silently rewrite it.

**Target ID / outcome ID.** Nova's internal stable key for one curriculum target. It is not an official KICD identifier. Store the source's printed code (such as `1.2(a)`) separately as an external code or locator, scoped to its release and subject.

**Strand.** A broad area of a learning area. In the selected Grade 8 Integrated Science design, “Mixtures, Elements and Compounds” is strand 1.0.

**Sub-strand.** A smaller topic within a strand. “Physical and chemical changes” is sub-strand 1.2 in the selected design.

**Suggested learning experience.** An activity direction in the curriculum design. It guides teachers but does not prescribe one mandatory classroom script. Label a new activity as a teacher-authored adaptation, not as KICD wording.

**Value.** A principle learners practise through their actions, such as unity or responsibility. Connect it to observable behavior in the activity.

**5E learning cycle.** The Integrated Science design's inquiry approach: engagement, exploration, explanation, elaboration, and evaluation. Use these phases as a planning scaffold; keep the teacher's requested lesson duration configurable.

## Corpus and retrieval terms

**Curriculum source.** A versioned authority record for a source such as a KICD curriculum design. Store its publisher, exact edition or file label, URL, and locator details separately from authored teaching material.

**Corpus document.** One short, typed source item in the mock corpus, such as an outcome reference, activity guide, scheme entry, or assessment item. The performance task asks for 8–12 documents for one subject.

**Resource type.** What the item is: curriculum design, teaching guidance, assessment item, scheme entry, or lesson exemplar. Use realistic types in demo fixtures.

**Demo fixture / fixture origin.** A development or presentation record marker such as `demo_seed`. It says where the record came from, not what kind of resource it is or whether it is authoritative. Keep fixture origin separate from resource type, authorship, and approval.

**ISBN.** An optional publication identifier for a particular edition or format. It is not an ID for every file revision or internal curriculum target. Keep internal resource and revision IDs, file hashes, release labels, and locators as well.

**Chunk.** A searchable passage made from a corpus document. Keep its document ID, heading, outcome IDs, and source locator so retrieval can return a traceable reference.

**Embedding.** A numeric representation of a chunk used for similarity search. It supports retrieval; it does not establish that the chunk is correct or official.

**Retrieval.** Selecting corpus chunks relevant to the teacher's selected outcome and duration. Filter by curriculum metadata before ranking semantic similarity.

**Grounding.** The plan's claims and activities have support in approved, in-scope source chunks. AI citations must belong to the frozen retrieval set; teacher-added citations must point to explicitly selected, approved, in-scope chunks. A source list alone does not prove support.

**Deterministic grounding check.** A check a program can decide from structured data, such as curriculum scope matching, target IDs, AI citation membership in the frozen retrieval set, required fields, and duration arithmetic. Teacher-added citations must be explicitly selected approved sources in scope. These checks prove traceability and constraints, not that a cited passage truly supports a claim.

**Semantic review.** A person checks whether a source actually supports the lesson's subject claim and whether the activity is accurate, suitable, feasible, and safe. Keep this separate from mechanical validation.

**Semantic QA.** Advisory machine-generated or human findings about meaning, such as target alignment or whether a source supports a claim. It does not establish source eligibility, pass deterministic checks, or approve a plan.

**Source reference / citation.** A link from a plan or plan section to a corpus chunk, then back to its document and source edition. Keep official curriculum references distinct from synthetic teaching guidance.

## Product and workflow terms

**AI-drafted plan.** A structured lesson plan returned by the generation step. It remains a draft for the teacher to review and edit; AI does not submit, approve, or publish it.

**Post-draft AI review.** An optional design extension that evaluates an immutable plan version and returns separate findings or suggestions. The performance brief requires grounded generation and human editing/review; it does not require a second AI review call. Review output cannot silently edit or approve the plan.

**Jev.** TypeSafe AI's typed model-evaluation interface. In this project it may provide optional semantic QA signals (for example, a `Choice`, `Score`, or `Noul` question). Its outputs are advisory and do not replace deterministic checks or Curriculum Lead decisions.

**QA status triad.** Separate results for `mechanicalValidation` (hard invariants), `semanticQa` (advisory evidence), and `humanReview` (Curriculum Lead decision). Keep all three tied to the exact plan version they describe.

**Plan content schema.** The structured lesson fields shared by AI drafts and teacher edits: title, duration, lesson objectives, materials, timed activities, checks for understanding, and source uses. Curriculum-specific labels such as 5E phases are optional extensions.

**Mock mode.** A deterministic generation path that needs no model credentials. Use it to demonstrate the full workflow without an external provider or cost.

**Teacher.** A user who selects an outcome, authors or generates a plan, edits their own draft, and submits it for review. A teacher can read published plans but cannot publish one.

**Curriculum Lead.** A user who reviews submitted plans and approves them for publication or returns them with a comment.

**Curriculum Lead guidance.** A versioned rule, clarification, or recommendation authored or approved by a curriculum lead. Give it a scope and approval state; make constraints machine-checkable only when their predicates are structured.

**Lesson exemplar.** A reviewed, published past plan or plan section that can inform teaching craft, pacing, or activity structure. It is not curriculum authority. Record its alignment, reuse permission, and eligibility separately.

**Plan version.** An immutable snapshot of lesson-plan content and its source references. Save a new version when the teacher edits; retain prior versions for review and traceability.

**Version envelope.** Server-managed metadata around a plan version: creator, origin, parent version, schema version, curriculum target, generation run, and timestamps. It is separate from editable lesson content.

**Version origin.** How a version was created: `ai_draft`, `teacher_edit`, or `teacher_authored`. It records provenance, not approval or ownership; the Teacher owns the plan workflow.

**Draft, Submitted, Returned, Published.** The plan workflow states. Editing a returned plan moves it to Draft; the teacher must submit it again before review.

## Wording rules for project docs

- Say **“KICD says”** only for content supported by a versioned KICD source and locator.
- Say **“KICD-aligned synthetic resource”** for mock teaching material mapped to a KICD outcome. Alignment does not mean KICD endorsed it.
- Say **“retrieved chunk”** for the passage sent to generation, and **“source reference”** for the saved pointer back to it.
- Keep curriculum authority, document authorship, and review status as separate fields.
- Keep demo fixture origin separate from resource type and authority.
- Do not label an AI draft “approved,” “published,” or “teacher-reviewed.”

## Pilot slice and source note

The playground uses Grade 8 Integrated Science under Kenya CBC. Its selected KICD outcome is 1.2(a), in strand 1.0, sub-strand 1.2. The target's internal ID is `target-kicd-g8-is-physical-chemical-changes-slo-a-v2024`; `1.2(a)` is a locator derived from the sub-strand and outcome letter, not a claimed KICD identifier.

The source record points to the Grade Eight designs page and its file labeled Integrated Science Grade 8, July 2024. The target chunk preserves the specific learning outcome wording and locator. Particle size remaining unchanged is a synthetic teaching-note emphasis, not part of that KICD outcome. Do not merge the separate April 2024 file label or locator into this source record.

References:

- [KICD Grade Eight designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eight-designs/)
- [KICD Grade 8 Integrated Science design, April 2024](https://kicd.ac.ke/wp-content/uploads/2024/06/Integrated-Science-Grade-8-Design-Formatted-April-2024.pdf)
- [Performance task brief](nova-fullstack-performance-task.pdf)
- [Architecture](docs/architecture.md)
- [Reviewer checklist](docs/performance-checklist.md)
- [Observability plan](docs/observability.md)
- [Curriculum domain model and grounding](docs/domain-model-and-grounding.md)
