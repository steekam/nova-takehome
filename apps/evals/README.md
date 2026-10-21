# API evaluation CLI

`apps/evals` exercises the real HTTP workflow; it does not own lesson-plan lifecycle, providers, prompts, or retrieval.

```sh
pnpm demo:up
pnpm evals -- eval-api
pnpm evals -- dataset export
pnpm evals -- dataset export --sync
```

The default run uses the seeded teacher (`teacher@example.test` / `NovaLocal123!`), finds the source-backed CBC Grade 8 Integrated Science target for July 2024 through `/api/curriculum/library`, generates a draft, then calls `/api/lesson-plans/:id/validate` for the saved version. Override the API URL with `--api` or `NOVA_EVAL_API_URL`. Override target filters with `--framework`, `--programme`, `--grade`, `--subject`, `--edition`, and `--locator`; use `--duration` to set lesson length. Password and target defaults accept `NOVA_EVAL_*` environment overrides.

Reports are saved to `.cache/evals/runs/` (or `NOVA_EVAL_REPORTS_DIR`). Each run creates a real draft. Use a disposable database for repeated evaluations. Reports include the target, deterministic checks, generation and validation rubric results, request IDs, and Langfuse trace IDs. Provider usage and costs remain in Langfuse traces.

`fixtures/retrieval-cases.json`, `fixtures/rubric-cases.json`, and `fixtures/cbc-source-corpus.json` preserve earlier diagnostic labels and corpus examples. Their chunk IDs and lesson schema belong to the retired local workflow; map them to API catalogue locators, source UUIDs, and current lesson-plan contracts before using them as automated graders.
