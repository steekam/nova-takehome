# Lesson-plan tabletop

**Purpose:** Walk one CBC subject through corpus retrieval, teacher authoring, AI drafting, QA, edits, and lead review before implementing the workflow.

**Performance-brief boundary:** I checked the instructions in `nova-fullstack-performance-task.pdf`. They explicitly ask for AI during grounded plan generation, then teacher editing and Curriculum Lead approval into the lesson bank. A second AI Review/Jev call is not required by the brief; it is an optional design extension in this tabletop. The teacher-only authoring path is another optional product path, using the same content schema and checks.

## Fixture

One offering: KICD CBC · Junior School · Grade 8 · Integrated Science · July 2024 design. A plan version selects one target; several plans may reuse the same target. Target IDs are product IDs; `1.2(a)` is a source locator derived from sub-strand 1.2 and outcome letter a.

This is the cleanest first slice because the performance brief names Grade 8 Integrated Science as an example, and KICD places particle characteristics and physical or chemical changes in one sub-strand. The curriculum source supplies target authority; synthetic school, teaching, assessment, and lead documents supply lesson-level context.

The target labels below paraphrase the July 2024 design. Its particle and change outcomes appear under sub-strand 1.2 on printed page 3; retain the exact source record and locator. The playground's particle-size teaching focus comes from a synthetic teaching note and must not be described as KICD wording.

| Target revision | Paraphrased target | Plans in the tabletop |
| --- | --- | --- |
| `target-particles-r1` | Describe particle characteristics in the three states | `plan-particle-models`, `plan-particle-misconceptions` |
| `target-changes-r1` | Distinguish physical and chemical changes in substances | `plan-change-card-sort` |
| `target-applications-r1` | Outline day-to-day applications of change of state of matter | `plan-changes-at-home` |

The target is selected from the offering before authoring. A `LessonPlan` belongs to its teacher and holds workflow state; each immutable `LessonPlanVersion` holds one content snapshot, target revision, origin, parent version, and optional generation run. Lead decisions point to the submitted version ID.

## Corpus fixture: nine short documents

| ID | Resource type | Example content | Authority / approval | Origin |
| --- | --- | --- | --- | --- |
| `doc-kicd-jul24` | Curriculum design extract | Target statements and locators for the three targets | Official KICD source / published | `demo_seed` |
| `doc-scheme-particles` | Scheme-of-work entry | Sequence and prior knowledge for particle models | School planning / simulated approved | `demo_seed` |
| `doc-scheme-changes` | Scheme-of-work entry | Sequence for physical and chemical changes | School planning / simulated approved | `demo_seed` |
| `doc-note-particles` | Teaching note | Particle spacing, motion, and common misconception | Teaching guidance / simulated approved | `demo_seed` |
| `doc-note-change-evidence` | Teaching note | Evidence learners can use to classify a change | Teaching guidance / simulated approved | `demo_seed` |
| `doc-check-particles` | Assessment item | Explain a particle diagram using spacing and motion | Assessment / simulated approved | `demo_seed` |
| `doc-check-changes` | Assessment item | Classify a case and justify the evidence | Assessment / simulated approved | `demo_seed` |
| `doc-lead-heating-rule` | Curriculum Lead guidance | Prefer observation cards; do not require live combustion | School constraint / simulated approved | `demo_seed` |
| `doc-exemplar-models` | Reviewed lesson section | Group-model activity and pacing example | Pedagogical exemplar / reuse permission recorded | `demo_seed` |

`demo_seed` describes fixture provenance only. It does not make the eight synthetic school documents official KICD sources. Keep authority, author, approval, fixture origin, and reuse permission as separate fields. An exemplar can suggest teaching craft; it cannot ground an official target.

The exemplar is stored as a standalone reusable section excerpt, so it counts as one short corpus item rather than a whole plan.

## Proposed lesson-plan content schema

The same editable `content` object serves teacher-authored and AI-drafted plans. The server owns curriculum context, workflow, version metadata, and source resolution. This is a proposed v1 contract for discussion, not the schema currently enforced in `packages/shared/src/index.ts`; that prototype schema is flatter and has one starter and one check field.

```ts
type LessonContent = {
  title: string;
  durationMinutes: number;
  lessonObjectives: Array<{
    id: string;
    text: string;
    sourceChunkIds: string[];
  }>;
  materials: Array<{ name: string; notes?: string }>;
  activities: Array<{
    id: string;
    kind: "starter" | "main" | "closing";
    phaseLabel?: string; // e.g. a 5E phase; optional extension
    durationMinutes: number;
    teacherActions: string;
    learnerActions: string;
    objectiveIds: string[];
    sourceChunkIds: string[];
  }>;
  checksForUnderstanding: Array<{
    id: string;
    prompt: string;
    expectedEvidence: string;
    objectiveIds: string[];
    sourceChunkIds: string[];
  }>;
  curriculumConnections?: Array<{
    kind: "key_inquiry_question" | "competency" | "value" | "pci";
    label: string;
    evidence: string;
    activityIds: string[];
    sourceChunkIds: string[];
  }>;
  differentiation?: string[];
  safetyNotes?: string[];
};
```

Envelope fields live outside `content`: `planId`, `versionId`, `versionNumber`, `parentVersionId`, `ownerId`, `createdBy`, `origin` (`teacher_authored | ai_draft | teacher_edit`), `courseOfferingId`, `targetRevisionId`, `generationRunId?`, `schemaVersion`, `createdAt`. Workflow status lives on the plan; events record submit, return, and approval against an exact version. A citation is a section-to-chunk link; the server resolves chunk IDs to resource revision, title, and locator.

### Sample content

The sample uses fixture chunk IDs. It is illustrative; its KICD text is a paraphrase, not a source quotation.

```json
{
  "title": "Particles in the three states",
  "durationMinutes": 40,
  "lessonObjectives": [
    {
      "id": "obj-1",
      "text": "Compare particle spacing and movement in solids, liquids, and gases.",
      "sourceChunkIds": ["chunk-kicd-particles"]
    }
  ],
  "materials": [{ "name": "Particle model cards" }],
  "activities": [
    {
      "id": "act-1",
      "kind": "starter",
      "durationMinutes": 5,
      "teacherActions": "Show three particle diagrams and ask what changes.",
      "learnerActions": "Compare the diagrams and predict how particles move.",
      "objectiveIds": ["obj-1"],
      "sourceChunkIds": ["chunk-check-particles"]
    },
    {
      "id": "act-2",
      "kind": "main",
      "durationMinutes": 25,
      "teacherActions": "Ask groups to model each state and explain their choices.",
      "learnerActions": "Build, compare, and revise particle models.",
      "objectiveIds": ["obj-1"],
      "sourceChunkIds": ["chunk-note-particles", "chunk-exemplar-models"]
    },
    {
      "id": "act-3",
      "kind": "closing",
      "durationMinutes": 10,
      "teacherActions": "Ask learners to defend one model with evidence.",
      "learnerActions": "Explain spacing and movement in one state.",
      "objectiveIds": ["obj-1"],
      "sourceChunkIds": ["chunk-check-particles"]
    }
  ],
  "checksForUnderstanding": [
    {
      "id": "check-1",
      "prompt": "Which model represents a gas? What evidence supports your answer?",
      "expectedEvidence": "Learner refers to particle spacing and movement.",
      "objectiveIds": ["obj-1"],
      "sourceChunkIds": ["chunk-check-particles"]
    }
  ]
}
```

## Four plans to play through

The intended outcomes below assume the official curriculum source was verified and marked eligible. Before that prerequisite, the source gate blocks all otherwise-successful flows.

| Plan | Target | Starting point | Simulation outcome |
| --- | --- | --- | --- |
| `plan-particle-models` | `target-particles-r1` | AI draft, 40m: predict 5, model 25, explain 10 | Mechanical pass; semantic QA finds a claim contradicted by the teaching note; teacher fixes it in v2 |
| `plan-particle-misconceptions` | `target-particles-r1` | AI v1, then teacher edit v2; diagnose 8, critique 22, revise 10 | Submit v2; lead returns exact version with one actionable comment; teacher edits v3 and resubmits |
| `plan-change-card-sort` | `target-changes-r1` | Teacher-authored, 40m: examples 5, card sort 20, ambiguous cases 10, exit check 5 | No generation run; same schema and QA; lead approves exact submitted version |
| `plan-changes-at-home` | `target-applications-r1` | AI draft, 40m: everyday uses 5, scenarios 20, justify 10, exit response 5 | Citation set lacks eligible curriculum support; block generation and show a grounding gap |

The misconception fixture is deliberate: the draft says gas particles themselves expand, while the cited teaching note says particle spacing changes. Citation membership passes; meaning does not. The plan stays Draft until a teacher edits it.

### Manual authoring, no AI draft

1. Teacher selects the offering, one target, and 40 minutes.
2. App opens the blank `LessonContent` form; no generation run is created.
3. Teacher writes objective, materials, timed teacher/learner actions, and check for understanding.
4. Teacher attaches eligible chunks with a source picker. This records deliberate source use; it does not claim automatic retrieval.
5. Server validates shape, target scope, references, duration arithmetic, and required source coverage.
6. Save as `teacher_authored` v1, Draft. Teacher can edit and save v2; v1 remains available.
7. Teacher submits v2. Lead reviews v2 and approves or returns that exact version.

### AI draft, guidance, human edits

1. Teacher selects the same offering, target, and duration.
2. Retrieval filters by curriculum scope and eligibility, ranks within that set, then freezes chunk IDs, resource revisions, locators, guidance revisions, retrieval version, prompt version, and model/mock version.
3. Generate returns only `LessonContent`; server validates it and creates `ai_draft` v1 as Draft.
4. Optional Review evaluates that exact version and returns a separate guidance report. It never writes into plan content, submits, or approves.
5. Teacher accepts, changes, or dismisses suggestions. Saving creates `teacher_edit` v2; it does not mutate v1. Any edit invalidates the old QA report.
6. Rerun checks on v2. Teacher submits v2; the lead reviews v2. A return followed by edits creates another Draft version and requires resubmission.

## Prompt and output samples

### Generate

```text
System: Return one JSON object matching LessonContent. Use only the supplied target,
source chunks, and structured guidance. Do not invent citations or curriculum claims.
The selected target and requested minutes are fixed. Cite chunk IDs beside each
objective, activity, and check that they support. If the supplied sources cannot
support a safe, useful plan, return the specified grounding-gap error instead of
filling gaps from memory. Do not include plan IDs, workflow state, or version fields.

User:
  framework: KICD CBC
  release: July 2024 design
  level: Grade 8
  subject: Integrated Science
  targetRevisionId: target-particles-r1
  targetStatement: <exact verified source statement from corpus>
  requestedDurationMinutes: 40
  guidance: <applicable structured lead rules>
  allowedChunks: <frozen IDs, locators, text, authority, and approval>
  outputSchema: LessonContent v1
```

Generation response is either schema-valid `LessonContent` or a typed error such as `INSUFFICIENT_CURRICULUM_GROUNDING`. Store the raw attempt and validation result in the run; allow one repair attempt that includes only the validator's errors. Revalidate after repair; on failure return a clear error and keep the attempt for audit.

### Review

```text
System: Review the supplied immutable lesson version against its selected target,
the cited source passages, and applicable guidance. Return JSON matching ReviewReport.
Report unsupported claims, contradictions, target drift, weak assessment alignment,
unclear instructions, infeasible pacing, safety concerns, and accessibility gaps.
For each finding, give a section path and source IDs. Separate evidence from advice.
Do not rewrite the plan, add citations, change workflow state, or approve it.
If evidence is insufficient, say so; do not infer support from citation presence.

User:
  planVersionId: <exact version>
  target: <selected verified target and locator>
  content: <immutable LessonContent snapshot>
  citations: <resolved cited passages>
  guidance: <applicable structured and human-authored guidance>
  rubricVersion: review-rubric-v1
```

```ts
type ReviewReport = {
  planVersionId: string;
  rubricVersion: string;
  findings: Array<{
    code: string;
    dimension: "alignment" | "grounding" | "accuracy" | "assessment" | "feasibility" | "safety" | "accessibility";
    severity: "blocker" | "warning" | "info";
    sectionPath: string;
    summary: string;
    evidenceChunkIds: string[];
    suggestion?: string;
    signal: "rule" | "jev" | "llm" | "human";
    confidence?: number;
  }>;
};
```

## QA card: three separate decisions

| Indicator | Values | Decides |
| --- | --- | --- |
| `mechanicalValidation` | `passed | failed` | Hard invariants that code can check. Failure blocks submit/publish regardless of any model score. |
| `semanticQa` | `not_run | recorded_fixture | evaluated | unavailable` | Advisory evidence about meaning, accuracy, fit, and source support. Store per-dimension findings; never collapse into a pass/fail gate by itself. |
| `humanReview` | `pending | returned | approved` | Curriculum Lead decision on the exact submitted version. |

Show dimensions separately: target alignment, claim support, objective-to-assessment fit, feasibility/pacing, safety, and accessibility. Every QA report names `planVersionId`; edits create a new version and make older QA visibly stale. A citation proves traceability, not entailment.

### Hard checks, decided in code

- Offering, release, level, subject, and selected target revision match.
- Required official curriculum grounding exists; eligible resources and active guidance are in scope.
- Content shape is valid; each objective link exists; activities and checks refer to valid objective IDs.
- Activity durations are positive integers and sum to content duration; the first AI draft also equals requested duration.
- AI citations belong to the frozen run; teacher citations were selected and are approved/in-scope.
- Structured mandatory rules are satisfied; plan owner, role, state transition, and reviewed version are valid.

Representative errors: `TARGET_SCOPE_MISMATCH`, `INSUFFICIENT_CURRICULUM_GROUNDING`, `GUIDANCE_CONSTRAINT_VIOLATION`, `SCHEMA_INVALID`, `REFERENCE_INVALID`, `DURATION_MISMATCH`, `CITATION_NOT_IN_CONTEXT`, `CITATION_SCOPE_MISMATCH`, `INVALID_TRANSITION`, `STALE_REVIEW`.

### Jev as an optional semantic signal

TypeSafe Jev can return typed `Choice`, `Score`, and `Noul` answers. Use small, independent questions after mechanical validation: e.g. `Choice` = supported / contradicted / insufficient evidence for one claim; `Score` = how well one check elicits evidence for one objective; `Noul` = probability that one activity states a misconception. Choice and Score can include confidence; Noul returns a yes-probability from 0 to 1 and has no separate confidence field. Route low Choice/Score confidence, conflicting signals, or a Noul value near a configured threshold to human review. No score proves correctness. Jev cannot decide target identity, eligibility, citations, duration, permissions, or publication.

Illustrative question design, not TypeSafe SDK syntax:

| Question | Jev type | Atomic input / rubric | Routing |
| --- | --- | --- | --- |
| Does this cited passage support this one claim? | `Choice` | Claim + exact cited passage; `supported`, `contradicted`, `insufficient_evidence` | Low confidence or contradiction → human check |
| Does this check elicit evidence for this objective? | `Score` | One objective + one check; rubric from unrelated to directly observable evidence | Low confidence or weak score → teacher/lead improvement cue |
| Does this activity state a particle misconception? | `Noul` | One activity + one precise yes/no proposition | Near configured threshold → human check |

For a deterministic demo, store Jev-like outcomes as `recorded_fixture`, with the rubric version, input hash, and expected result. For live evaluation, retain judge/model version, rubric version, input hash, raw answers, and evaluation time. Run live evaluations separately; never let a live score change a hard check or workflow state.

## Verification loop

```text
request + role
  → validate offering / target / duration
  → filter eligible corpus by metadata, then rank
  → freeze exact run inputs
  → Generate (LLM or deterministic mock)
  → parse + deterministic validation
      ├─ fail → one repair attempt → revalidate → clear error if still invalid
      └─ pass → save immutable Draft version
  → optional Review / Jev signals on that version
  → teacher edit → new version → rerun validation and QA
  → submit exact version → Curriculum Lead review
      ├─ return → teacher edits → Draft, new version, resubmit
      └─ approve → publish exact reviewed version
```

Tabletop acceptance: a missing-grounding case blocks; an out-of-run citation fails; a 35-minute activity set cannot pass a 40-minute request; the misconception passes mechanical checks but raises semantic QA; no QA score can publish; manual authoring has no generation run; and review/approval always names the current submitted version.

## References

- [Performance task brief](../nova-fullstack-performance-task.pdf), especially “Curriculum Corpus and Retrieval,” “Grounded Lesson Plan Generation,” and “Edit, Submit and Publish.”
- [Reviewer checklist](performance-checklist.md) for implementation invariants.
- [KICD Grade Eight designs](https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eight-designs/) — links to the current Integrated Science Grade 8 design.
- TypeSafe Jev docs: [Choice](https://docs.typesafe.ai/primitives/choice), [Score](https://docs.typesafe.ai/primitives/score), [Noul](https://docs.typesafe.ai/primitives/noul), [introduction](https://docs.typesafe.ai/introduction).
- [Project glossary](../GLOSSARY.md) · [Domain model](domain-model-and-grounding.md) · [Visual model](domain-model-visual.html).
