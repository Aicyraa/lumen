# Evaluation review — 2026-10-25

**Completion update, 2026-10-26:** the preserved Groq-only rerun finished all 129 cases after the user supplied a key
from a different account. Raw scores: cheap 38/43, expensive 36/43, router 35/43; all three 9/10 held-out. All 27 not-found
replies had zero sources. One router case failed output validation. The final results, cost methodology and limitations
are in [RESULTS_REVIEW_RUN.md](RESULTS_REVIEW_RUN.md). The timestamped checkpoints below are historical.

The original arithmetic is correct, but the results remain preliminary. All 43 references were checked against the
eight PDFs (22 pages) in `/home/jee/Downloads`, and all 26 flagged verdicts plus all 22 incorrect verdicts were read
using the **full answers** in the saved state, not the 300-character excerpts. This is agent review, not human approval.

## What the original run actually establishes

- 129 completed responses, 43 questions, three setups; no system or judge errors. These are 43 distinct test questions,
  not 129 independent questions. Cheap: 35/43; expensive: 36/43; rules: 36/43. Each is 9/10 on the held-out rows.
- Mean **estimated provider cost**: USD 0.000293058 cheap, 0.000620184 expensive, 0.000339326 rules. Rules cost 15.8%
  more than cheap and 45.3% less than expensive. These use the configured evaluation prices, not a verified bill.
- Overall median latency: 2763 ms cheap, 2911 ms expensive, 2757 ms rules. The larger train-only medians in
  `RESULTS_PRELIMINARY.md` are also correct for that split. One sequential run does not establish a stable speed advantage.
- Rules used the expensive tier on 5/43 questions. This is the expensive-tier share; `route.escalated` more narrowly
  means an expensive choice made out of caution. The CSV calls the broader measure `escalation_rate`.
- Forced cheap and expensive use different retrieval depths (`k=5` and `k=8`). This compares complete tier setups,
  not just model capability with identical evidence. The corpus was used to calibrate the rules; ten held-out questions
  are too few to establish equivalence or justify a classifier.
- All 24 exact not-found answers had sources. The other three `unanswerable_with_sources=yes` rows answered the
  ambiguous maintenance question. A correct answer verdict and a correct response contract are separate checks.

## References and question wording

The PDF supports the qualifiers **18 units** (01 p.2), **during teaching weeks** (05 p.2), and **up to PHP 5,000 per
academic year, subject to need and available funds** (02 p.2). Keep these: removing them would permit misleading answers.
The interim report-card exception (01 p.1) is also real, although treating its omission as an outright wrong answer
is a stricter completeness standard than a simple checklist of required documents.

Ten training references were shortened or corrected in `questions.csv` and `DRAFT_ANSWERS_REVIEW.md`:

| Question | Change | PDF evidence |
|---|---|---|
| 6 | Keep weekly hours; omit unasked wage and semester length. | 02 p.2 |
| 12 | Keep virtual deadline; omit discussion of a different pathway. | 07 p.2 |
| 20 | Keep INT-027's 60-unit requirement and pilot exclusion. Remove the unqualified suggestion that this student may apply to INT-028: workshop and department approval were not supplied in the question. | 07 pp.3–4 |
| 21 | Keep the extension's scope; omit the separate transcript dates and submission conditions. | 07 p.2 |
| 23 | Keep distinct hosts and the pilot label; omit business descriptions. | 07 p.3 |
| 25 | Keep the ethics prerequisite; omit unrelated permitted preparation. | 08 p.4 |
| 27 | Keep the two deadlines and permission to apply before admission; omit award activation and missed-deadline details. | 01 p.2; 02 p.2 |
| 28 | Keep exchange eligibility, credit approval and travel stacking; omit capacities, award amounts and the selection procedure. | 07 p.1; 06 p.2 |
| 30 | Keep allowance and hours; omit unasked host/job names. | 03 p.1; 07 p.3 |
| 32 | Keep number, deadline and non-stacking rule; omit grant amount and award-selection procedure. | 07 p.2; 06 p.2 |

Question 38 now asks about maintenance closures **in 2028**, retaining the unanswerable type. The manual (08 p.4)
specifies November 8–12, **2027**, and explicitly omits next year's closures. No 2028 maintenance closure was found
anywhere in the eight PDFs. The original relative date was defective: on 2026-10-25, "next year" means 2027, so the
three answers citing that closure cannot fairly be counted as demonstrated hallucinations. Do not retroactively
replace the old three verdicts with new measurements.

All ten held-out queries, reference answers and split flags are unchanged; `cheap_ok` and `expensive_ok` remain empty.
Question 29's `source_doc` metadata now also lists PDF 06, which supplies the MEM amount and restrictions already
cited in the draft review. This metadata is not sent to the model or judge and does not change its resume key.
Held-out question 29 is still ambiguous: "a mobility award" could mean one example, while its reference demands both
award amounts and additional costs. The expensive answer explicitly says "such as the Merit Excellence Mobility
Award" and is defensible on that reading. Retire or rewrite this question in a future, prospectively fixed test set;
do not use its observed output to tune the router or silently relabel this held-out result.

## The original 26 flagged verdicts

Row numbers below count data rows in the original `verdicts.csv` (header excluded). Question numbers refer to
`DRAFT_ANSWERS_REVIEW.md`. "Agree" accepts the verdict, not every possible detail in the judge's explanation.

| Verdict row | Setup | Question | Original verdict | Review |
|---|---|---|---|---|
| 6 | rules | 2 tuition | incorrect | Agree under the explicit qualifier rubric: 18-unit basis absent. |
| 13 | cheap | 5 Saturday library | incorrect | Agree: teaching-week limitation absent. |
| 18 | rules | 6 work hours | correct | Agree: eight-hour weekly limit answers the question; wage not required. |
| 28 | cheap | 10 Launchpad | correct | Agree: 12 weeks, October 18, 2027. |
| 33 | rules | 11 Maker Room | correct | Agree: Innovation Hall 006; code not required to state location. |
| 34 | cheap | 12 virtual deadline | correct | Agree: October 1, 2027. |
| 37 | cheap | 13 organizations | correct | Agree: 38. |
| 39 | rules | 13 organizations | correct | Agree: 38. |
| 46 | cheap | 16 reduced load | correct | Agree: PHP 28,000 tuition, PHP 14,000 AOG; calculation steps not required. |
| 52 | cheap | 18 outage ticket | correct | Agree on lack of automatic entitlement; wording "cannot submit" is stronger than the PDF's "no automatic extension." |
| 62 | expensive | 21 transcript extension | correct | Agree: virtual applications excluded. |
| 63 | rules | 21 transcript extension | correct | Agree: virtual applications excluded. |
| 65 | expensive | 22 transfer | correct | Agree: Research Office approval needed; arithmetic explanation optional. |
| 66 | rules | 22 transfer | correct | Agree: Research Office approval needed. |
| 69 | rules | 23 hosts | correct | Agree: different hosts, Workshop has PILOT-48. |
| 75 | rules | 25 ethics | correct | Agree: approval required before recruitment. |
| 80 | expensive | 27 deadlines | correct | Agree: both dates and pre-admission application permission given. |
| 97 | cheap | 33 lab rules | incorrect | Agree under the broad booking-rules question: duration and cancellation rules omitted. |
| 99 | rules | 33 lab rules | incorrect | Agree: duration/cancellation rules and weekday scope omitted. |
| 101 | expensive | 34 enrollment | correct | Agree: all three dates correct. |
| 103 | cheap | 35 graduate tuition | correct | Agree on answer text; response incorrectly included sources. |
| 107 | expensive | 36 president | correct | Agree on answer text; response incorrectly included sources. |
| 108 | rules | 36 president | correct | Agree on answer text; response incorrectly included sources. |
| 112 | cheap | 38 maintenance | incorrect | Dispute the question: 2027 is next year from the evaluation date. |
| 118 | cheap | 40 dress code | correct | Agree on answer text; response incorrectly included sources. |
| 124 | cheap | 42 MBA | correct | Agree on answer text; response incorrectly included sources. |

## Additional incorrect-verdict review

- Rows 4–6 and 13–15: tuition/load and library/teaching-week omissions are real completeness issues. Rows 19–21:
  emergency-assistance limits are real; the cheap answer also turns a cap into a fixed payment.
- Row 7: interim report-card omission is a rubric/completeness issue, not an incorrect list of final documents.
- Row 59 (expensive, question 20): the answer correctly says the student does not meet INT-027's unit requirement.
  Requiring an alternative host is unfair; the original reference also overstated that alternative's eligibility.
- Rows 82 and 84 (cheap/rules, question 28): **the judge's explanations are wrong**. The answers correctly state AOP/AOG
  and MEM/Global Mobility stacking; they do not rename the Global Mobility Grant as AOP. Both answers do incorrectly
  call the internship/project pathways exchange pathways. The rules answer additionally treats capacity as eligibility
  and omits the two credit-plan requirements. An incorrect verdict is defensible for those actual reasons, not the
  claimed award contradiction. Do not repeat the original report's claim that cheap confused award combinations.
- The paired expensive response, **row 83**, was graded correct but makes the same exchange/internship conflation and
  calls 24/40 places entry requirements. That is a **false-positive judge verdict**. This was found by reading the
  paired answer beyond the requested random sample. Its passing grade is not evidence that expensive solves question 28.
- Rows 85–87 (held-out question 29): generic "a mobility award" makes the rubric underspecified. Cheap/rules present
  MEM's cap without identifying the award; rules also omits the host-tuition waiver. Expensive names MEM as an example;
  its rejection for not listing both amounts and home-scholarship details is overly demanding for that reading.
- Row 95 (expensive, question 32): the answer supplies all three requested facts. Rejecting it for an unasked amount
  and selection procedure is too strict. The training reference now contains only the requested facts.
- Rows 97 and 99: duration and cancellation are booking rules, so retaining those required reference details is fair.
- Rows 112–114: defective relative-date question, as above.

No saved judge verdicts were manually changed. A new model run can vary even on unchanged questions; score changes
after editing references are not, by themselves, evidence of improved RAG quality.

## Product fix and verification

`apps/rag-service/app/api/routes.py` now clears sources when the validated answer is the configured not-found message,
before fetching owner-only filenames/snippets. Model tier, attempts and token accounting remain available because a
model was actually called. Six regression cases cover empty claims, a generic refusal and a validated claim describing
missing information, both with and without snippets. All six failed before the fix and passed afterward.

Checks completed: **263 RAG tests passed; 121 evaluation-tool tests passed; Ruff lint and formatting passed.**
The isolation suite passed with **zero leaks in 108 real-stack checks** (64 cross-tenant, 14 positive, 30 object/dashboard).
Negative controls detected leaks with combined predicates removed (A 110 / B 109), vector only (A 110 / B 109), and
keyword only (A 58 / B 64); the scratch database was dropped afterward.
The local AST graph was refreshed with `graphify update .`; SQL extraction remains unavailable because the installed
Graphify lacks `tree_sitter_sql`. No database code or schema changed.
Framework testing conventions were checked
against the [official FastAPI testing documentation](https://fastapi.tiangolo.com/tutorial/testing/). Serena and Context7
were unavailable, so native source tools and official documentation were used.

Keep the rule-based router. This sample does not show enough missed escalations to justify Phase 6. A new classifier
would need human labels, a prospectively fixed larger test set, and an explicit missed-escalation versus unnecessary-call
penalty before training. No classifier or threshold/prompt/retrieval tuning was added.

Question 33 (lab booking rules) is one credible candidate missed escalation: cheap/rules omit booking conditions,
whereas expensive includes them. Question 28 looks like another in the CSV, but its expensive answer also has the
errors above. So "the router never misroutes" is too strong; "there is insufficient evidence to train a classifier"
fits this review better.

## Fresh provider rerun — incomplete

A fresh run of all 129 pairs was attempted against a temporary server using this checkout, without reusing old
responses. **39/129 pairs completed** before repeated answering-provider `429 provider_rate_limited` waits made it
impractical to finish now (a normal request reported 194 seconds, then 386 seconds after the next successful pair).
The judge answered both diagnostic probes normally. The RAG probe reported 8000/8000 per-minute tokens remaining,
so the long wait is consistent with another quota, rather than exhaustion of that displayed minute bucket. No
provider configuration or quota was changed. The temporary evaluation and its server were stopped.

The 39 completed pairs and matching partial CSVs are saved in **`tools/eval/review-run/`** (git-ignored). These cover
only the first 13 questions, not the whole test. They cannot replace the full comparison or verify all live not-found
responses. The original `tools/eval/results.csv`, `verdicts.csv` and `.eval_state.json` were restored byte-for-byte;
their answers and verdicts remain the original run. No incomplete rerun scores are presented as a new benchmark.

After provider quota recovers, start the updated RAG service, point `tools/eval/.env`'s `RAG_URL` at it with a matching
`INTERNAL_SECRET`, and continue the **fresh** state:

```sh
apps/rag-service/.venv/bin/python tools/eval/run_eval.py --out-dir tools/eval/review-run --resume --seed 0
```

This resumes the 39 responses from the fixed service; resuming the default original state would mix old service
responses into the rerun. The source check still does not satisfy the project's human-reference-approval acceptance
check. No new phase, classifier, deployment, merge or push was performed.

### Groq-only continuation

At the user's request, the same fresh Groq-only state was resumed on 2026-10-25 at approximately 09:55 UTC, starting
from 39 saved pairs. Models remain `openai/gpt-oss-20b` and `openai/gpt-oss-120b` through Groq; NVIDIA and the account's
saved provider order are excluded. Non-secret run configuration is saved in `review-run/run-config.json`.
At 10:00 UTC, 41/129 pairs were saved and the running process was waiting on another Groq rate-limit retry.
Use the saved state for subsequent progress; this checkpoint is not a completed comparison.

At 10:51 UTC the run reached **80/129**: always cheap 17/43, always expensive **43/43**, rules 20/43. Always expensive
scored **36/43**, including **9/10 held-out**. Ten live not-found replies (nine expensive, one rules) all had zero sources.
There were no recorded system or judge errors. The other setups are incomplete, so this is not a new three-way result.

To avoid blocking ready expensive requests behind cheap-model quota waits, continuation after the first 50 saved pairs
uses the disposable `review-run/driver.py`: requests remain sequential, with the same model settings and grading code;
quota responses are deferred until their reported retry deadline, while other ready pairs run. Its offline self-checks
passed. The API's saved Groq model keys were compared in a read-only transaction and both match the evaluation key.
No NVIDIA calls or account changes were made. Retry state and partial CSVs are saved after every outcome. Model attempts
from deferred requests after this change are retained for estimated-provider-cost accounting. The original 50 completed
records keep the original harness's accounting; the reported estimate is not a provider bill.

The remaining 49 cheap-tier requests remain queued. `review-run/progress.json` records the latest completed count and
retry deadlines, and `review-run/.eval_state.json` contains the saved answers. This timestamped checkpoint may lag the
active job. Do not launch the original sequential runner concurrently against the same state file.

At 11:31 UTC, the continuing Groq queue had saved **84/129** (cheap 18/43, expensive 43/43, rules 23/43), still with no
recorded system/judge errors. New answer review is recorded in `review-run/JUDGE_REVIEW.md`. It identifies a false-negative
judge verdict on the router's correct unapproved-12-unit renewal answer, plus a real expensive-model error inventing an
exclusion of Discovery teams from extended lab hours. Raw verdicts were preserved; no prompt, reference or routing
changes were made from these observed outputs.

At approximately 15:06 UTC, the continuing run had **101/129** saved. One pending exchange-pathways request had twice
generated a response but encountered quota during validation repair. Continuation now increases the repair cooldown
so a whole request can finish, retains those charged attempts, and has passed the queue self-checks.

The repository was updated while the process was running, including a new resume-key version and RAG changes. To
preserve this experiment, the application/harness source is now frozen at **`3ce51ee`**, with the original revised
questions. All 101 saved keys and the provider/model/judge/price settings were verified against it. Model weights are
shared read-only; credentials remain in the environment. The active run therefore evaluates the **original pipeline**,
including the sources fix, rather than the later audit changes. The updated product needs a separate future evaluation.
See `review-run/README.md` for the current continuation procedure; the earlier generic CLI command is superseded for
this historical state.
