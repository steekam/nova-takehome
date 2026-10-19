# Review evaluation

The review eval checks whether the advisory DeepSeek reviewer catches known defects without flagging clean plans.

## Cases

Each run creates a verified mock baseline for both Grade 8 Integrated Science targets, then saves four frozen review inputs:

| Case | Label | Injected defect |
|---|---|---|
| `particles-clean` | Clean | No mutation |
| `particles-corrupted` | Defect | Objective says gas particles grow as they spread |
| `changes-clean` | Clean | No mutation |
| `changes-corrupted` | Defect | Objective says tearing paper forms a new substance |

Every case stores its content and selected source chunks with SHA-256 hashes. A corrupted plan remains schema-valid so the judge must reason over the contradiction. Each defect has a labelled source chunk. A detection counts only when an accepted finding matches the expected section, dimension, and evidence ID. Deterministic lesson verification is reported separately.

## Run and read results

```sh
pnpm playground -- review-eval
pnpm playground -- review-eval --live --via-litellm
```

The default mock reviewer returns no findings; it checks the eval plumbing. `--live` uses the configured Baseten DeepSeek reviewer directly; add `--via-litellm` to route it through the local LiteLLM alias. A defect counts as detected only when the judge response passes deterministic review validation and cites the expected field and source. A separate deterministic rationale checklist requires key concepts in the finding summary and teacher advice: the false claim, source-grounded correction, and actionable fix. These phrase-alternative checks cover the two labelled facts; they do not grade freeform reasoning. Invalid responses are inconclusive. The report separates expected-defect detection, correct source citations, rationale concept checks, false alarms on clean cases, unexpected findings, and invalid reviews. It also records retries, tokens, reported and estimated cost, a per-attempt total with estimate fallback, missing-cost calls, trace IDs, and score-delivery status. Mixed and partial totals are labeled explicitly.

Valid review observations receive Langfuse scores for expected behavior, no unexpected findings, and schema validity. Corrupted cases also receive `review_eval_expected_evidence_cited` and `review_eval_expected_rationale_concepts_passed`; clean cases have no expected evidence or rationale labels, so those scores are omitted. Evaluation scores are attached only after the review output passes deterministic checks. Review finding-count scores remain attached to the original generation observation when one exists.

Reports and replay inputs live under `.cache/playground/review-evals/`. The aggregate report includes each frozen case snapshot and can be inspected without rerunning calls. This four-case synthetic set helps tune the rubric and prompts; it does not establish broad reviewer quality.
