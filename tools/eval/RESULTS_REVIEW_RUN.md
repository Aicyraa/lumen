# Completed Groq-only evaluation — 2026-10-26

**129/129 case results saved. Preliminary: references and disputed judge calls still need human approval.**
The run covers the original RAG pipeline preserved at `3ce51ee`, including the not-found sources fix. Later audit
changes in the current application are outside this run.

## Raw scores

| Setup | All questions | Train | Held-out | Unanswerable |
|---|---|---|---|---|
| Always cheap | 38/43 | 29/33 | 9/10 | 9/9 |
| Always expensive | 36/43 | 27/33 | 9/10 | 9/9 |
| Rule router | 35/43 | 26/33 | 9/10 | 9/9 |

The router used the expensive tier on 5/43 questions. There were **20 incorrect verdicts**, including one technical
failure: the router's exchange-pathways request exhausted its permitted output-validation repair and returned
`provider_error`. The other 19 are LLM-judge rejections. No judge replies were malformed.

**All 27 not-found replies returned zero sources.** The explicit 2028 maintenance question was handled correctly by
all three setups. This verifies the sources fix across the live comparison.

## How to read the scores

Always cheap has the highest raw score on this sample. The three-question gap to the router is not clean evidence
of a routing defect: the router omitted the interim-report-card detail on a separate cheap-model generation, one
correct renewal answer was misgraded, and one cheap-tier response failed validation. All three setups scored 9/10
held-out, with the same ambiguous mobility-award question accounting for the miss.

The judge falsely rejected the router's 12-unit renewal answer even though it correctly says panel review is required
and cites the true standard 18-unit rule. On the cheap mobility answer, it also incorrectly says the award's full name
is wrong instead of its abbreviation MEM. That question/reference remains ambiguous. Accessibility answers were
rejected for omitted orientation/supervision conditions despite stating correct support services: a strict completeness
judgment, not a demonstrated false service description.

There are real mistakes too. The expensive model invented an exclusion saying extended lab hours do not apply to
Discovery teams, and misnamed MEM while classifying internship/project pathways as exchange pathways. More expensive
routing is therefore not a guaranteed repair.

All **27 flagged rows** (26 seeded random rows plus the validation failure) and **all 20 incorrect verdicts** were read
using full saved answers. The row-by-row audit is in [review-run/JUDGE_REVIEW.md](review-run/JUDGE_REVIEW.md). Raw
verdicts were preserved. References and prompts were not changed during continuation.

Keep the rule-based router for now. The evidence does not justify Phase 6. A larger prospectively fixed question set,
human reference/judge review, and a specified missed-escalation penalty should precede classifier work. Both classifier
label columns remain empty.

## Latency

| Setup | Median service latency (s) | Observations | Technical failures |
|---|---|---|---|
| Always cheap | 5.087 | 43 | 0 |
| Always expensive | 3.565 | 43 | 0 |
| Rule router | 6.205 | 42 | 1 |

These are the service's reported latencies; quota waits are excluded. The run spanned many hours, restarts and two
Groq accounts. It is not a controlled speed comparison. The router failure has no reported latency, leaving 42 observations.

## Estimated provider cost

USD per case, at the unchanged configured per-model rates; these are estimates, not a provider invoice or Lumen prices.

| Setup | Estimated provider cost: final RAG request | Recorded estimated provider cost including captured retries |
|---|---|---|
| Always cheap | 0.000299 | 0.000332 |
| Always expensive | 0.000579 | 0.000579 |
| Rule router | 0.000349 | 0.000430 |

The final-request estimate includes the model calls in the final RAG request, including its repair, whether it answered
or failed validation. The recorded estimate additionally includes saved quota-interrupted calls and the failed case's
prior attempts. Before the first 50 cases, the original harness did not retain all retry attempts, so the recorded
estimate may undercount the experiment's total provider usage. Authentication probes are outside these query estimates.

The raw `results.csv` leaves the router train cost blank because the legacy harness marks errored requests unpriced.
The table above uses the failed request's saved provider-reported token counts to calculate its known estimated cost.
For final-request accounting, the archived failed record at the credential switch is excluded from the new request;
remaining retries are separated at their recorded rate-limit boundaries. The final request is checked to contain no
more than the two permitted model attempts. These derived figures are in [review-run/summary.json](review-run/summary.json);
the raw CSV and raw verdicts are unchanged.

## Provenance and completed checks

- 43 frozen questions about eight synthetic campus PDFs (22 pages), each evaluated in three setups. These are 43
  distinct questions, not 129 independent questions. Train 33; held-out 10. All held-out queries, reference answers,
  split flags and labels match the original dataset; question 29 source metadata additionally cites PDF 06.
- Ten training references were shortened/corrected and the maintenance question explicitly changed to 2028 before
  this rerun. The earlier run used different references and stochastic outputs, so score changes do not isolate a
  product-quality improvement. Source review is in [DRAFT_ANSWERS_REVIEW.md](DRAFT_ANSWERS_REVIEW.md).
- Models remained Groq `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, judged by `qwen/qwen3.8-27b`. NVIDIA was not used.
  Forced tiers use different retrieval depths (5 versus 8), so this compares whole tier setups, not models with identical evidence.
- First 50 saved cases used the sequential harness. Later cases used a sequential ready-request queue so other
  ready work could proceed during quota waits. Longer repair cooldowns prevented repeated restart/repair starvation.
- The repository changed mid-run. Original application/harness source and revised questions were preserved;
  all 129 keys and all frozen source hashes were verified. Later application changes were not mixed into the run.
- The user supplied a key from a different Groq account near the end. Cheap and judge authorization checks both
  returned HTTP 200; provider/model/judge/price settings stayed unchanged. Old quota timers were cleared, earlier
  usage was preserved, and the state before switching is archived locally. Final records: 106 from credential epoch 1,
  23 from epoch 2 (including the retried validation failure). No credentials were written into evaluation artifacts.
- Earlier implementation verification: six regression cases failed before the sources fix and passed afterward;
  263 RAG tests and 121 evaluation-tool tests passed; isolation reported zero leaks in 108 real checks and detected
  leaks in all three negative controls. These checks are historical verification of the original work, not tests
  of the subsequent audit changes.
- Continuation self-checks passed. Final verification confirmed 129 unique setup/question pairs, 43 per setup,
  matching CSV/state rows, empty classifier labels, unchanged held-out references and intact source hashes.
  The temporary RAG server shut down. The original run's results, verdicts and state remain byte-for-byte preserved.

## Files

- [Raw results](review-run/results.csv), [raw verdicts](review-run/verdicts.csv), [saved answers/state](review-run/.eval_state.json).
- [Derived summary](review-run/summary.json), [judge review](review-run/JUDGE_REVIEW.md), [progress](review-run/progress.json).
- [Non-secret run configuration](review-run/run-config.json), [frozen source manifest](review-run/frozen/source-manifest.json).
- [Continuation/provenance notes](review-run/README.md). The run directory is intentionally git-ignored.

Still unverified: human approval of the references and judge disputes, and performance/quality of the newer application.
