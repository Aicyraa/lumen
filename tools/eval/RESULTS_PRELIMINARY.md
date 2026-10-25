# Preliminary evaluation results (eval-run-1, second pass)

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

- **118 of 129 runs produced an answer. 11 runs failed with `provider_error` (system errors) and are counted wrong in
  `results.csv`:** the Groq daily token quota ran out partway through the last chunk and was exhausted again when I retried
  (the retry stopped cleanly on a long retry-after). Affected: always_expensive 3 (one multi-document, two unanswerable),
  always_cheap 3 (one multi-document, two unanswerable), rule_router 5 (two multi-document, three unanswerable).
  They are all train rows; no held-out run failed. Resume later with `python tools/eval/run_eval.py --resume`; only
  those 11 pairs will run.
- Because of this, the `results.csv` accuracies for train are **lower bounds** (failed runs counted as wrong). The tables
  below also give accuracy over answered runs.

## results.csv (counts: train 33 questions, held_out 10, per setup)

| setup | split | accuracy (failures counted wrong) | accuracy over answered runs | median latency ms | escalation rate | unanswerable_handled | est. cost per query (USD) |
|---|---|---|---|---|---|---|---|
| always_cheap | train | 0.727 (24/33) | 0.800 (24/30) | 2718 | 0.00 | 0.571 (4/7) | empty in csv (a failed run has no cost); 0.000296 mean over the 40 priced runs, all splits |
| always_cheap | held_out | 0.900 (9/10) | 0.900 (9/10) | 2449 | 0.00 | 1.000 (2/2) | 0.000280 |
| always_expensive | train | 0.727 (24/33) | 0.800 (24/30) | 2956 | 0.91 (30/33) | 0.571 (4/7) | empty in csv; 0.000613 mean over the 40 priced runs |
| always_expensive | held_out | 0.900 (9/10) | 0.900 (9/10) | 2634 | 1.00 | 1.000 (2/2) | 0.000516 |
| rule_router | train | 0.697 (23/33) | 0.821 (23/28) | 2681 | 0.091 (3/33) | 0.429 (3/7) | empty in csv; 0.000334 mean over the 38 priced runs |
| rule_router | held_out | 0.900 (9/10) | 0.900 (9/10) | 2605 | 0.100 (1/10) | 1.000 (2/2) | 0.000334 |

(`unanswerable_handled` denominators include failed runs: 7 train and 2 held-out unanswerable questions.
Always-expensive escalation is 0.91 on train, not 1.0, because 3 failed runs report no tier; the questions answered
with no model call, the not-found shortcut, count as not escalated.) The router escalated 4 questions in total: the Merit
Excellence vs Mobility comparison, the Applied AI lab closure, the AOG laboratory budget and the 3D-printer serial number.

By type, correct / answered (failed runs excluded): easy cheap 9/13, expensive 10/13, router 10/13; hard 12/12, 11/12,
12/12; multi-document 6/8, 6/8, 5/7; unanswerable 6/7, 6/7, 5/6.

## Not-found answers that still listed sources

**20 of the 20 correctly graded not-found answers listed sources** (always_cheap 7, always_expensive 7, rule_router 6),
so the service returns retrieved sources even when it says it could not find the answer. Under the old brief rule every one
of these would have been wrong.

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

## Confident and wrong (answer judged wrong, top_score >= 0.5): 18 cases

Tuition (3 setups, 0.66), library Saturdays (3, 0.56), emergency grant (3, 0.63), semester-exchange tuition and travel
costs (3, 0.63), maintenance closures next year (3, 0.61), INT-027 54-unit on always_expensive (0.56), Global Mobility
Grants on always_expensive (0.59), booking rules on rule_router (0.72). Most are right-on-the-main-fact answers that omit a
drafted qualifier (see the read).

## Rows flagged for human review

`verdicts.csv`: 35 of 129 rows flagged (a seeded random 20 percent plus none from judge failure; 12 unanswerable, 8 easy,
8 hard, 7 multi-document). Also read every wrong verdict and the 11 system errors' questions.

## Honest read

- **Still no evidence that any setup is better on accuracy.** On the 43 questions the three setups are within one or two
  questions of each other on train and identical on the 10 held-out rows (9/10 each). The held-out set is 10 questions; one
  question is 10 points.
- **Cost and speed are the consistent differences:** always-expensive costs about 2.1 times the cheap tier per query and
  is slower at the median; the rule router costs about 13 percent more than always-cheap, escalating 4 of 43 questions. That
  fits the cost-saving idea, but the accuracy data cannot show the router is not losing quality on harder questions,
  because the 11 failed runs fall on exactly the multi-document and unanswerable rows where a difference would show.
- **The judge is strict about qualifiers**, and my drafted answers include many of them; some "wrong" answers are a
  judge-and-draft artifact. Human verification of the drafts (and of the judge on the flagged rows) is the next step.
- **The unanswerable set is small (9) and one of its questions looks defective**; the not-found behaviour of the service
  (sources listed with a not-found answer) is a service question, not an evaluation result.
- Limits: 43 questions, drafted answers, one LLM judge, one run (models are not deterministic), free-tier models, the corpus
  the router thresholds were calibrated on.

## Files

`tools/eval/results.csv`, `verdicts.csv` and `.eval_state.json` (git-ignored, in the worktree).
