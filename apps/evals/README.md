# API evaluation CLI

`apps/evals` exercises the real HTTP workflow; it does not own lesson-plan lifecycle, providers, prompts, or retrieval.

```sh
pnpm demo:up
pnpm evals -- eval-api --locator '1.2(a)'
pnpm evals -- dataset export
pnpm evals -- dataset export --sync
```

The default run uses the seeded teacher (`teacher@example.test` / `NovaLocal123!`), finds the source-backed CBC Grade 8 Integrated Science target for July 2024 through `/api/curriculum/library`, generates a draft, then calls `/api/lesson-plans/:id/validate` for the saved version. Override the API URL with `--api` or `NOVA_EVAL_API_URL`. Override target filters with `--framework`, `--programme`, `--grade`, `--subject`, `--edition`, and `--locator`; use `--duration` to set lesson length. Password and target defaults accept `NOVA_EVAL_*` environment overrides.

Reports are saved to `.cache/evals/runs/` (or `NOVA_EVAL_REPORTS_DIR`). Each run creates a real draft. Use a disposable database for repeated evaluations. Reports include the target, deterministic checks, generation and validation rubric results, request IDs, and Langfuse trace IDs. Provider usage and costs remain in Langfuse traces.

The live run uses the configured provider route (`lesson-planner` in `ops/litellm/config.yaml`) and writes real usage and cost to Langfuse. To run controlled repair and retry cases, start the local stub in a separate terminal, route the API container to it, then run a case:

```sh
pnpm evals -- provider-stub --port 4055
env COMPOSE_LLM_BASE_URL=http://host.docker.internal:4055/v1 pnpm exec varlock run -- docker compose up -d --no-deps --force-recreate api
pnpm evals -- workflow-cases --case timing-repair-success
```

Use the cases marked `controlled` for deterministic scenario checks. Cases marked `live_review` describe semantic judgments that need a real reviewer or human review. Controlled reports calculate synthetic usage from successful stub responses and label it as non-billed. Restore the API route after controlled runs:

```sh
env COMPOSE_LLM_BASE_URL=http://litellm:4000/v1 pnpm exec varlock run -- docker compose up -d --no-deps --force-recreate api
```

`fixtures/retrieval-cases.json`, `fixtures/rubric-cases.json`, and `fixtures/cbc-source-corpus.json` preserve earlier diagnostic labels and corpus examples. Their chunk IDs and lesson schema belong to the retired local workflow; map them to API catalogue locators, source UUIDs, and current lesson-plan contracts before using them as automated graders.
