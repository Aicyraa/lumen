# Preliminary evaluation results (eval-run-1)

**PRELIMINARY. Do not use these numbers for decisions.** The expected answers are agent-drafted from the PDFs and
unverified by the human (`DRAFT_ANSWERS_REVIEW.md`); one judge model, one run, and only 27 of the 43 questions finished.

## What ran

- Rag-service from this worktree (c_v1 + `force_tier`), tenant `Lumen` (8 campus PDFs, read-only use of the dev database).
- Models under test: cheap `openai/gpt-oss-20b`, expensive `openai/gpt-oss-120b`, both on Groq's free tier. Judge:
  `qwen/qwen3.8-27b` (a different family; it returned strict JSON in a smoke test). Prices as set by the human, per 1M tokens:
  cheap 0.075 in / 0.30 out, expensive 0.15 / 0.60. Cost below is the estimated provider cost from provider token counts.
- Held-out rule and seed: see `README.md` (seed 20261024, 3 easy, 3 hard, 2 multi-document, 2 unanswerable, fixed before any run).

## Completed and not completed

- **Complete for all three setups: the first 27 questions of `questions.csv`** (13 easy, 12 hard, 2 multi-document) = 81 runs.
  Split: **train 21 questions** (10 easy, 9 hard, 2 multi-document), **held_out 6 questions** (3 easy, 3 hard).
- **Not run: 16 questions** (7 multi-document and all 9 unanswerable; 2 of the 3 held-out multi-document/unanswerable
  quotas are therefore empty). Reason: Groq's free-tier limit on `openai/gpt-oss-20b` (the cheap model) was exhausted
  (rate-limited with a `retry-after` of several hundred seconds that kept renewing; about one request per 10 minutes got through),
  and the third `resume` chunk confirmed it. I stopped cleanly. Resume later with
  `python tools/eval/run_eval.py --resume` (the state file `.eval_state.json` keeps the 81 completed runs; the
  remaining pairs run on resume).
- Two incidental runs outside the 27 (always-cheap and always-expensive on "tuition for graduate programs", an unanswerable
  question) are in the state file but not in the tables. Both answered "I could not find that in the documents." and were
  graded **wrong** by the harness's rule because the response still listed sources (see the read below).
- System errors: **0**. Judge errors: **0**. (Two provider rate-limit errors early in the run were retried and replaced.)

## results.csv (27 questions x 3 setups)

| setup | split | n | accuracy | median latency ms | escalation rate | est. cost per query (USD) |
|---|---|---|---|---|---|---|
| always_cheap | train | 21 | 0.810 (17/21) | 2483 | 0.00 | 0.000272 |
| always_cheap | held_out | 6 | 1.000 (6/6) | 2236 | 0.00 | 0.000242 |
| always_expensive | train | 21 | 0.810 (17/21) | 3001 | 1.00 | 0.000605 |
| always_expensive | held_out | 6 | 1.000 (6/6) | 2634 | 1.00 | 0.000504 |
| rule_router | train | 21 | 0.857 (18/21) | 2683 | 0.095 (2/21) | 0.000313 |
| rule_router | held_out | 6 | 1.000 (6/6) | 2983 | 0.167 (1/6) | 0.000332 |

`unanswerable_handled` is empty everywhere: no unanswerable question completed. Router: 24 of 27 questions stayed on the
cheap tier, 3 escalated (the Merit Excellence vs Mobility comparison, the Applied AI lab closure, the AOG laboratory budget).

## Wrong answers (all 11 are judged omissions of a qualifier, none a wrong fact)

| setup(s) | question | judge reason (short) |
|---|---|---|
| cheap, expensive, router | standard tuition per semester | omits "for 18 units" |
| cheap, expensive, router | library hours on Saturdays | omits "during teaching weeks" |
| cheap, expensive, router | one-time emergency assistance grant | omits "up to", "per academic year" / "subject to need and funds" |
| cheap | documents a first-year applicant submits | omits "an interim report card may be submitted initially" |
| expensive | 54 units, IT, average 89, INT-027 | answered "does not meet the unit requirement", omits the 60 units and PILOT-48 exception |

## Confident and wrong (top_score >= 0.5): 10 cases

All are the rows above: tuition (3 setups, top 0.66), library Saturdays (3, 0.56), emergency grant (3, 0.63) and the
54-unit INT-027 question on always_expensive (0.56). The remaining wrong answer (cheap, first-year documents) had a lower
score. All ten are high-confidence retrievals whose answer is factually right but less complete than the drafted answer.

## Rows flagged for human review (`verdicts.csv`, 17 of 81, column `flagged_for_review`)

A seeded random 20 percent; no judge failures. Beyond those, read every wrong verdict above: all 11 depend on whether the
drafted answer demanded too much detail.

## Honest read

- **The numbers do not separate the setups.** Differences are one or two questions out of 21 (and 6 held-out
  questions, all correct everywhere). The router's 0.857 against 0.810 is a single question: the 54-unit question where
  the expensive model gave a shorter answer, a judge call that could go either way. Nothing here shows the router beats
  or loses to always-expensive on accuracy.
- **What does look consistent:** always-expensive costs about 2.2 times the cheap tier per query (0.000605 vs 0.000272 on
  train) and is about 0.5 s slower at the median; the rule router sat in between (0.000313) while escalating 11 percent.
  That is weak evidence for the cost-saving idea, not proof.
- **The judge is strict about qualifiers.** Most "wrong" answers are correct on the main fact and omit a drafted
  qualifier ("for 18 units", "during teaching weeks"). My drafted answers may be more detailed than a fair reference; this
  is the first thing for the human to check. I did not edit any answer after seeing system output.
- **The easy and hard rows only.** No unanswerable and only two multi-document questions finished, so the most
  interesting router cases (weak retrieval, cross-document) are untested. The held-out split is 6 questions and
  contains no multi-document or unanswerable row.
- **A harness finding:** for an unanswerable question the service can return the exact not-found sentence while still
  listing sources (the model returned empty claims, but sources of the retrieved passages stay in the response). The
  harness rule from the brief ("not-found message and no sources") grades that as wrong. Either the rule or the
  service behavior needs a decision before the unanswerable column means anything.
- Limits: 43 questions at most, one judge model from a different family but still an LLM, answers drafted by an agent,
  a single run (the models are not deterministic), free-tier models, the same corpus the thresholds were calibrated on.

## Files

`tools/eval/results.csv`, `tools/eval/verdicts.csv`, `tools/eval/.eval_state.json` (git-ignored, in the worktree).
