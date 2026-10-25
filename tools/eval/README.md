# tools/eval

Phase 5: the tenant isolation suite and the router evaluation. Python, standard library only, run with the
rag-service interpreter (`apps/rag-service/.venv`: pytest, ruff, psycopg, uvicorn). There is no test website.

```text
questions.csv        the evaluation questions (drafted by the agent, answers filled in by the human)
run_eval.py          entry point of the evaluation; the code is in evalkit/
evalkit/             questions loader, config, HTTP with 429 backoff, rag-service client, judge, metrics, CLI
isolation/           the isolation suite (python -m isolation, or pnpm eval:isolation from the repo root)
tests/               pytest, with fake rag-service and judge servers (no provider is ever called)
.env.example         every setting; copy to .env (git-ignored)
```

Run the tests from this directory: `../../apps/rag-service/.venv/bin/python -m pytest -q`
(`ruff check .` and `ruff format .` with the same venv).

## questions.csv

Header, exactly: `query,tenant,domain,type,expected_answer,source_doc,held_out,cheap_ok,expensive_ok`.

| Column | Who fills it | Meaning |
| --- | --- | --- |
| `query` | agent | The question, as a user would ask it. |
| `tenant` | agent | Tenant name; `.env` `TENANT_IDS` maps it to the tenant id (`Lumen` is the campus project with the eight PDFs). |
| `domain` | agent | Topic area (admissions, aid, careers, research, student-life, awards-policy, facilities). |
| `type` | agent | `easy` (one fact), `hard` (comparison, exception, several conditions), `multi-document`, `unanswerable` (not in the documents). |
| `source_doc` | agent | The PDF filename(s) holding the answer, separated by `;`. Empty for `unanswerable`. |
| `expected_answer` | **human** | The correct answer, in your own words, checked against the PDFs. For an `unanswerable` row write anything non-empty (for example `not in the documents`); that row is graded by rule, not by the judge. |
| `held_out` | **human** | `true` for the rows kept for the final comparison, `false` or empty for the rest. Held-out rows are reported as their own split and must never be used to tune thresholds, `k` or prompts. Aim for roughly a quarter, spread over all four types. |
| `cheap_ok`, `expensive_ok` | **human** | Phase 6 only (does the cheap / expensive tier answer it acceptably, `true` or `false`). Leave empty for now. |

The agent never writes `expected_answer`, `held_out`, `cheap_ok` or `expensive_ok`. A row without an `expected_answer` is
skipped (and counted in the output), so you can fill the file in gradually.

## run_eval.py

```sh
cp tools/eval/.env.example tools/eval/.env      # fill it in; never commit it
apps/rag-service/.venv/bin/python tools/eval/run_eval.py --dry-run
```

Options: `--dry-run` (print what would run, make no call, write nothing), `--limit N` (first N answered questions),
`--resume` (skip `(setup, query)` pairs already done in `.eval_state.json`; pairs that failed are run again),
`--review-fraction 0.2` (share of verdicts flagged for you, default 20 percent), `--seed`, `--questions`, `--env`, `--out-dir`.
It refuses to run when no row has an `expected_answer`, when the header is not exact, or when a `tenant` is not in `TENANT_IDS`.

For each answered question it runs three setups against `POST {RAG_URL}/internal/query` (secret header, models built
from `.env`): `always_cheap` (`force_tier: "cheap"`), `always_expensive` (`force_tier: "expensive"`) and `rule_router`
(no `force_tier`). An answer is graded by an LLM judge (OpenAI-compatible `{EVAL_BASE_URL}/chat/completions`,
temperature 0, strict JSON `{"correct": bool, "reason": str}`; one retry on a malformed reply). `unanswerable` rows are graded
by rule: correct when the answer is the not-found message. Sources are ignored for correctness (the service returns the retrieved sources even then) but counted: `verdicts.csv` column `unanswerable_with_sources` is `yes` for such rows. The grading rule version is part of the resume key of unanswerable rows. A system error (for example
`provider_error`) counts as wrong. A 429 is waited out using `Retry-After` and the `x-ratelimit-*` headers.

Outputs (both git-ignored):

- `verdicts.csv`: `setup,query,answer_excerpt,verdict,reason,flagged_for_review`. **Spot-check the rows marked `yes`**
  (a random 20 percent, plus every judge failure) and fix `expected_answer` or tell the agent where the judge was wrong.
- `results.csv`: `setup,split,accuracy,median_latency_ms,escalation_rate,unanswerable_handled,estimated_cost_per_query_usd`,
  one row per setup and split (`train` = `held_out` false or empty, `held_out`). `escalation_rate` is the share of
  questions answered by the expensive tier (0 for always-cheap by construction; questions that call no model count as not
  escalated). `unanswerable_handled` is the accuracy over the `unanswerable` rows only. `median_latency_ms` is the
  service's own `usage.latency_ms`. `estimated_cost_per_query_usd` is the tenant's estimated provider cost: provider token
  counts times the `EVAL_PRICE_*` per-1M prices of the tier that answered; empty when a used tier has no price. Lumen has
  no prices of its own.
- The console also lists every **confident and wrong** case (judged wrong while the best passage scored at least
  `EVAL_CONFIDENT_TOP_SCORE`). Read all of them.

The judge is an LLM: it can be wrong in both directions, which is why part of its work is yours to check.

## Isolation suite

`pnpm eval:isolation` (from the repo root) needs the dev Postgres container up (`pnpm db:up`), `node_modules` installed and
the rag-service venv with its model weights cached. It never touches dev data and uses no real provider:

1. creates the scratch database `lumen_isolation_<timestamp>` on the server named in `apps/api/.env` (refuses a non-local
   host), applies `scripts/db.mjs migrate` and Better Auth's tables, with fresh random secrets;
2. starts its own API (`NODE_ENV=development`, rate and monthly limits raised for this process only) and rag-service on
   free ports, plus a local OpenAI-compatible stub model that answers with one claim quoting an exact span of the first
   passage (free and deterministic; it counts its calls);
3. signs up two users through the API (verified by `/dev/verify-email`), mints keys (`/dev/api-key`), adds the stub as a
   cheap model through `POST /api/dashboard/models`, uploads three synthetic documents each (tenant A plants
   `AMBERFOX-4417`, tenant B `COBALTOWL-9082`) and waits for `ready`;
4. asks 64 cross-tenant questions through `POST /v1/chat` (each tenant about the other's code word, document names, topics,
   its tenant id, prompt injections and generic questions) and checks after every call: every source document belongs to
   the caller, no foreign marker (code word, brand, document name) appears anywhere in the response; plus 14 positive
   questions that must find the tenant's own planted data (so the suite cannot pass by finding nothing), and object-level
   checks: foreign document GET and DELETE and foreign request GET return `404 not_found` (and the delete changes nothing),
   feedback on a foreign request is `404`, an altered key is `401`, a `tenant_id` in the body or header is ignored, and the
   tenant's dashboard (documents, requests, models, models/usage, usage, analytics) shows no foreign row;
5. **negative control**: copies `apps/rag-service/app` to a temporary directory, removes the `tenant_id` predicates from
   `store.search` and `store.keyword_search` (`isolation/sqlstrip.py`; it raises if the code no longer looks as expected, so
   the control cannot silently turn into a no-op), starts that rag-service and a second API instance in front of it and asks
   the same questions. The control passes only when leaks are detected for both tenants. This **combined** control is
   mandatory. Two more controls run one after the other, each with its own leaky copy: only the vector predicate removed
   (`search`, which is also the probe query: the probe is the same SQL, not a separate predicate) and only the keyword
   (BM25) predicate removed. They are reported, not required: if one path alone cannot leak (the other path's candidates
   may not cover it), the report says "no leak" for it instead of forcing a result;
6. prints a report and exits 0 only with zero leaks in the real run, at least 50 cross-tenant questions actually asked, at
   least 10 positive checks passed, and a combined control that detected leaks. It always stops its
   processes (by PID group), drops the scratch database and removes its temporary directory.

Logs of the child processes are in the temporary directory printed at the start (removed at the end).

What it does not cover: Supabase (RLS, pooler), more than one API instance, the real model providers, the dashboard in a
browser, and leaks that need data volumes (it uses six tiny documents; the reranker and BM25 see only 3 chunks per tenant).

## Preliminary evaluation setup (eval-run-1)

- **The `expected_answer` values are agent-drafted and unverified by the human.** They were written from the eight source PDFs
  only (never from system output); `DRAFT_ANSWERS_REVIEW.md` lists each draft with its PDF page and, for the nine unanswerable
  rows, the terms searched to confirm the information is absent. Every result built on them is **preliminary** until the
  human verifies them.
- **Held-out rule (fixed before any system answer was seen):** per `type`, take the rows in file order, shuffle them with
  `random.Random(f"{SEED}:{type}")` where `SEED = 20261024`, keep the first N: 3 easy, 3 hard, 2 multi-document,
  2 unanswerable (10 of 43). Code: `evalkit/heldout.py`; a test checks that `questions.csv` matches the rule.
  `cheap_ok` and `expensive_ok` stay empty (Phase 6).
