# Internal telemetry runbook

This runbook populates telemetry and eval data for engineering review. Do not present the CLI or playground workflow as the product walkthrough. The product video should use the API-backed teacher and curriculum-lead screens, with Langfuse, Grafana, and LiteLLM views as supporting evidence.

Use the `changes` CBC fixture for generation and review. Use the `particles` fixture for the teacher-authored lifecycle. Both are Grade 8 Integrated Science and show the same workflow without comparing models.

## Before inspecting telemetry

On a fresh clone, install dependencies and prepare local secrets once:

```sh
pnpm install
pnpm local:prepare
```

Set `BASETEN_API_KEY` for LiteLLM's upstream connection in `.env.local`, start the local services and LiteLLM through Varlock, then provision the scoped OpenAI-compatible proxy key:

```sh
pnpm exec varlock run -- docker compose up -d
pnpm exec varlock run -- docker compose --profile litellm up -d postgres litellm
pnpm litellm:key
```

The key setup command waits up to 60 seconds for LiteLLM's readiness endpoint before validating or creating the virtual key.

Check Langfuse at `http://localhost:3002`, Grafana at `http://localhost:3000`, Prometheus at `http://localhost:9091`, and LiteLLM at `http://localhost:4000`. Set `OTEL_ENABLED=true` and leave `LANGFUSE_CAPTURE_PROMPTS=false` for trace metadata without prompt bodies.

## Walkthrough

1. Generate one lesson through LiteLLM: `pnpm playground -- generate --target changes --duration 40 --live --via-litellm`. Try `--duration 30` in a mock run to show how the prompt, plan, deterministic timing checks, and saved scenario change together.
2. Show the JSON run report: frozen KICD target and source chunks, schema-constrained lesson, deterministic checks, attempts, token usage, cost, and trace ID.
3. Run the immutable review: `pnpm playground -- review <generation-run-id> --live --via-litellm`. Show findings with cited plan paths and sources, then the Langfuse finding-count score delivery status.
4. Run `pnpm playground -- review-eval --live --via-litellm`. Show the four clean/corrupted CBC cases, accepted detections, clean-case false alarms, invalid review outputs, total cost and cost source, and scores on accepted Langfuse review observations. Scores carry eval-run, case, label-set, judge-model, route, and input-hash metadata. Failed or invalid reviews have no judge scores. The playground runs the judge; Langfuse stores the judge trace and scores. The CLI does not create a Langfuse experiment run. The report keeps every case snapshot and input hash for inspection.
5. Import the generated lesson from step 1 as a teacher-owned Draft: `pnpm playground -- plans import <generation-run-id> --owner teacher-demo`. Copy its plan ID. Ask the judge for advisory feedback with `pnpm playground -- plans review <plan-id> --live --via-litellm`. Show the exact retrieved source snapshot, generation run/candidate provenance, findings, QA, and Langfuse score status. The judge writes a separate report and leaves the plan unchanged. The teacher applies useful suggestions manually as a new version, then continues:

   ```sh
   pnpm playground -- plans edit <plan-id> --owner teacher-demo --content /path/to/revised-plan.json
   pnpm playground -- plans submit <plan-id> --owner teacher-demo
   pnpm playground -- plans return <plan-id> --lead lead-demo --comment "Add an explicit learner check for particle size."
   pnpm playground -- plans edit <plan-id> --owner teacher-demo --content /path/to/revised-plan.json
   pnpm playground -- plans submit <plan-id> --owner teacher-demo
   pnpm playground -- plans publish <plan-id> --lead lead-demo
   ```

   Each workflow write prints a trace ID and records a deterministic QA score in Langfuse, a structured event in Loki, and QA metrics in Prometheus. Open one trace in Tempo/Langfuse and show version number, lifecycle status, pass/fail and failed check codes. Plan content and actor IDs are excluded from telemetry. The sample commands model workflow state; actor IDs are not authentication.
6. Open the generation trace in Tempo and Langfuse. Follow retrieval, generation, and proxy spans. A standalone review has its own command trace linked to the source generation IDs; the four review-eval cases share the eval command trace and have separate judge spans. Open the review-eval trace using its printed trace ID. Show that prompt content is absent unless capture was enabled.
7. In Grafana Explore → Loki, filter `{service_name="nova-playground"} |= "playground generation completed"`. Show the trace/run IDs, status, model, duration, and cost attributes; logs omit prompts and lesson content.
8. Show LiteLLM's spend record and Grafana's request, proxy-latency, playground call-cost, command-outcome, dataset-export, BGE operation/load p95-duration, and embedding-cache panels. The dedicated CBC review-judge panel separates defect detection, evidence citation, rationale, clean false-positive, and invalid-review rates by judge model and route; its adjacent spend panel shows review-eval cost by provider/model. The retrieval trace also breaks out each embedding call by model, representation, dimensions, cache hits/misses, model load time, and elapsed time. Playground panels use the latest cumulative sample from each short-lived process within the last 30 minutes; `costs --json` aggregates saved reports and keeps provider-reported and estimated values separate.
9. Run `pnpm playground -- retrieval-eval` and show per-query retrieval ranking beside the generated plan's frozen context. Open the printed trace ID in Langfuse to show nDCG, Hit@1, and Recall@3 evaluation scores; cache counts live on the trace and in the local report. This diagnostic covers the particle fixture, not every CBC target.
10. Export generation replay data with `pnpm playground -- dataset export`. Show a JSONL item with replay input, deterministic verification expectations, source trace links, and observed historical model output in metadata. The expected output lists verification codes; it is not a curated gold lesson plan. To show the judge's labeled evaluation corpus, run `pnpm playground -- dataset export --review-evals`. Those items keep clean/corrupted labels and expected defect, evidence, and rationale checks in expected output, separate from the lesson/source input. Sync the updated review-evaluation labels to `nova-lesson-review-evaluation-v4` with `--sync`; the new dataset name preserves prior versions because Langfuse sync adds or updates items and does not delete stale labels. The command span records extracted and synced counts.
11. Summarize saved run costs with `pnpm playground -- costs --json`. Compare recorded generation, standalone review, and judge-evaluation costs by provider/model, then show the same grouped summary in Loki or use the trace ID printed by the plain-text command. This reads prior reports and does not issue provider calls.

When `LANGFUSE_CAPTURE_PROMPTS=false`, prompt and response bodies are omitted from telemetry spans. Local run reports and dataset exports still retain them for replay, so keep those artifacts local.

Use LiteLLM as the live route for generation, review, and review evaluation. Historical cost reports can group previously saved calls by provider and model.
