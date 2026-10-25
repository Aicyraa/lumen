# Preliminary evaluation results (eval-run-1, final pass)

The completed revised-reference rerun is in [RESULTS_REVIEW_RUN.md](RESULTS_REVIEW_RUN.md). This file preserves the
original run; its numbers are not the revised-reference results.

Historical first-run report. The 2026-10-25 source and verdict review is in
[`EVALUATION_REVIEW.md`](EVALUATION_REVIEW.md), including corrections to the judge's award-combination explanations,
the relative-date question, and the rerun status. The tables below describe the original run, not the revised dataset.

**PRELIMINARY. Do not use these numbers for decisions.** The expected answers are agent-drafted from the PDFs and
unverified by the human (`DRAFT_ANSWERS_REVIEW.md`); one judge model, one run, free-tier models.

## What ran

- Rag-service from this worktree (c_v1 + `force_tier`), tenant `Lumen` (the 8 campus PDFs; dev database read-only).
- Under test: cheap `openai/gpt-oss-20b`, expensive `openai/gpt-oss-120b` (Groq free tier). Judge: `qwen/qwen3.8-27b`
  (a different family; strict JSON verified). Prices as set by the human per 1M tokens: cheap 0.075 in / 0.30 out,
  expensive 0.15 / 0.60. Cost is the estimated provider cost from provider token counts.
- All 43 questions x 3 setups = 129 runs were attempted. Held-out rule and seed: `README.md` (seed 20261024; 10 held-out rows:
  3 easy, 3 hard, 2 multi-document, 2 unanswerable). Splits: **train 33 questions, held_out 10**.
- **Grading of unanswerable rows (lead decision):** correct when the answer is exactly the not-found sentence; sources are
  ignored for correctness and counted instead (`unanswerable_with_sources` in `verdicts.csv`).

## Completion

- **All 129 runs completed: 0 system errors, 0 judge errors.** The last 7 pending pairs (always_expensive on the
  exchange-pathways question; all three setups on the MBA and bus-schedule questions) ran in the final pass after the Groq
  quota had reset (a realistic-size call, about 1000 input tokens with `max_tokens` 2048, passed with no Retry-After).
- Earlier passes in this document (with 11, then 7 failed runs) are superseded by the table below.

## results.csv (train 33 questions, held_out 10, per setup; no failed runs)

| setup | split | accuracy | median latency ms | escalation rate | unanswerable_handled | est. cost per query (USD) |
|---|---|---|---|---|---|---|
| always_cheap | train | 0.788 (26/33) | 2801 | 0.00 | 0.857 (6/7) | 0.000297 |
| always_cheap | held_out | 0.900 (9/10) | 2449 | 0.00 | 1.000 (2/2) | 0.000280 |
| always_expensive | train | 0.818 (27/33) | 3049 | 1.00 | 0.857 (6/7) | 0.000652 |
| always_expensive | held_out | 0.900 (9/10) | 2634 | 1.00 | 1.000 (2/2) | 0.000516 |
| rule_router | train | 0.818 (27/33) | 2757 | 0.121 (4/33) | 0.857 (6/7) | 0.000341 |
| rule_router | held_out | 0.900 (9/10) | 2605 | 0.100 (1/10) | 1.000 (2/2) | 0.000334 |

All 43 questions together: always_cheap 35/43 (0.81), always_expensive 36/43 (0.84), rule_router 36/43 (0.84); mean
cost 0.000293, 0.000620 and 0.000339 USD per query. The router escalated 5 of 43 questions (the Merit Excellence vs
Mobility comparison, the Applied AI lab closure, the AOG laboratory budget, the internship comparison, the 3D-printer
serial number).

By type, correct / total: easy cheap 9/13, expensive 10/13, router 10/13; hard 12/12, 11/12, 12/12; multi-document 6/9,
7/9, 6/9; unanswerable 8/9, 8/9, 8/9 (the one miss per setup is the "maintenance closures next year" question below).

**On the earlier "6 of 7 vs 4/7" inconsistency:** both were right but counted different things, and my prose was loose.
In the previous pass 4/7 was the train column (7 train unanswerable questions, 3 of them failed system errors counted
wrong), and "6 of 7" was across all splits among the 7 unanswerable runs that had answered, per setup. With every run
complete, the numbers are unambiguous: 6/7 on train, 2/2 held-out, 8/9 overall per setup.

## Not-found answers that still listed sources

**All 24 correctly graded not-found answers listed sources** (8 per setup). The `unanswerable_with_sources` column shows
`yes` on 27 rows because it also marks the 3 wrong answers to the maintenance question, which listed sources too. So
the service returns retrieved sources even when it says it could not find the answer. Under the old brief rule each
of the 24 would have been wrong.

## Wrong answers (answered runs)

- Omitted qualifier, main fact right: tuition ("for 18 units"), library Saturdays ("during teaching weeks"), emergency grant
  ("up to / per academic year / subject to need"), first-year documents on always_cheap (interim report card), and several
  multi-document questions (mobility grant amounts, booking rules, cancellation rules).
- Possible real errors: always_cheap on the exchange-pathways question says "AOP can be added to AOG and cannot be combined with
  MES" in a way the judge found contradictory to the question asked; always_cheap on "semester exchange tuition and travel
  costs" implied the mobility award covers more than the documents state.
- **Likely a defective drafted question:** "What maintenance closures are planned for the Applied AI and Digital Inclusion Lab
  next year?" The system (all three setups) answered with the November 8-12, 2027 closure from the manual; I had
  classified it unanswerable because the manual says it does not list "next year's maintenance closures". "Next year" is
  ambiguous relative to a 2027 document, so this is a drafting problem as much as a system one. I did not change it
  after seeing the output; the human should decide.

## Confident and wrong (answer judged wrong, top_score >= 0.5): 19 cases (of 22 wrong verdicts)

Tuition (3 setups, 0.66), library Saturdays (3, 0.56), emergency grant (3, 0.63), semester-exchange tuition and travel
costs (3, 0.63), maintenance closures next year (3, 0.61), INT-027 54-unit on always_expensive (0.56), Global Mobility
Grants on always_expensive (0.59), booking rules on rule_router (0.72). Most are right-on-the-main-fact answers that omit a
drafted qualifier (see the read).

## Rows flagged for human review

`verdicts.csv`: 26 of 129 rows flagged (a seeded random 20 percent; no system or judge errors this time). Also read every wrong verdict and the wrong verdicts.

## Honest read

- **Still no evidence that any setup is better on accuracy.** On the 43 questions the three setups are within one or two
  questions of each other on train and identical on the 10 held-out rows (9/10 each). The held-out set is 10 questions; one
  question is 10 points.
- **Cost and speed are the consistent differences:** always-expensive costs about 2.1 times the cheap tier per query and
  is slower at the median; the rule router costs about 15 percent more than always-cheap, escalating 5 of 43 questions. That
  fits the cost-saving idea. On this sample the router matches always-expensive on train (27/33) at about half the cost,
  but 43 questions cannot show it is not losing quality on harder questions: the cheap tier lost two multi-document and
  one easy question that the expensive tier got right, a difference of a few questions.
- **The judge is strict about qualifiers**, and my drafted answers include many of them; some "wrong" answers are a
  judge-and-draft artifact. Human verification of the drafts (and of the judge on the flagged rows) is the next step.
- **The unanswerable set is small (9) and one of its questions looks defective**; the not-found behaviour of the service
  (sources listed with a not-found answer) is a service question, not an evaluation result.
- Limits: 43 questions, drafted answers, one LLM judge, one run (models are not deterministic), free-tier models, the corpus
  the router thresholds were calibrated on.

## Files

`tools/eval/results.csv`, `verdicts.csv` and `.eval_state.json` (git-ignored, in the worktree).
