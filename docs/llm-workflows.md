# LLM workflows and evaluation

The API owns generation, deterministic checks, repair, rubric QA, and plan-version persistence. Prompt definitions and the OpenAI-compatible provider adapter live in `apps/api/src/lesson-planning/llm-workflows`. The shared contracts live in `packages/shared`.

See [workflow state charts](workflow-state-charts.md) for the generation,
provider retry, and rubric-validation paths, including their failure outcomes.

Generation creates a grounded draft and runs deterministic checks. A failed first response gets one repair attempt; a second deterministic failure is rejected. A valid draft is persisted with its source provenance, then advisory rubric QA scores outcome alignment, objective measurability, activity alignment, assessment quality, pacing, and source support. Teachers can run that rubric again against any saved version after edits. Each AI workflow has a Langfuse trace with request correlation and prompt capture configured by the API.

`apps/evals` is an internal harness, not a second product implementation. It logs in through the API, resolves a stable target from the curriculum catalogue, generates a draft, calls the separate validation endpoint, and writes a report with request IDs and both rubric traces.

```sh
pnpm evals -- eval-api
pnpm evals -- dataset export
pnpm evals -- dataset export --sync
```

The evaluator uses the seeded demo teacher and a local API at `http://localhost:3001` by default. Each run creates a draft in the configured database. Use a disposable local database for repeated runs. Dataset sync requires Langfuse credentials and is explicit.

The retained fixture files preserve earlier CBC retrieval and rubric labels. Their legacy chunk identifiers and lesson shape do not match the API model yet, so they are reference material, not active graders. Map them to curriculum locators, API source UUIDs, and `LessonPlanContent` before using them in automated scores. Retrieval ranking metrics also need an API-visible candidate trace to evaluate the production retrieval path.
