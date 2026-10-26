"""run_eval: three router setups x the answered questions -> verdicts.csv and results.csv."""

import argparse
import csv
import hashlib
import json
import math
import os
import random
import sys
from pathlib import Path

from evalkit.config import DEFAULT_ENV, ConfigError, load_config
from evalkit.judge import grade_unanswerable, judge
from evalkit.metrics import RESULT_COLUMNS, SETUPS, Result, confident_wrong, cost_of, summarize
from evalkit.questions import QuestionsError, load_questions, split_of
from evalkit.rag import query_rag

HERE = Path(__file__).resolve().parents[1]
FORCE = {"always_cheap": "cheap", "always_expensive": "expensive", "rule_router": None}
VERDICT_COLUMNS = [
    "setup", "query", "answer_excerpt", "verdict", "reason", "flagged_for_review",
    "unanswerable_with_sources",
]  # fmt: skip
EXCERPT = 300
KEY_VERSION = 2  # state files without this marker used a key that ignored models and router config
STATE_MARK = "_resume_key_version"
GRADING_RULES = "v2: unanswerable = not-found message, sources tracked"  # part of the resume key


def pair_key(cfg, q, setup):
    """Identity of a run: edited answers, a changed split, judge, model, provider or router config re-run."""
    parts = [
        setup,
        q.tenant,
        q.query,
        q.expected_answer,
        str(q.held_out),
        cfg.judge_model,
        cfg.model_cheap,
        cfg.model_expensive,
        cfg.provider,
        cfg.router_hash,
    ]
    if (
        q.type == "unanswerable"
    ):  # only these rows are graded by the rule; judged rows keep their key
        parts.append(GRADING_RULES)
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:24]


def _save(path: Path, state: dict):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1))
    os.replace(tmp, path)


def run_pair(cfg, q, setup):
    """One (setup, question): ask the service, grade the answer. Returns the state record."""
    a = query_rag(cfg, cfg.tenant_ids[q.tenant], q.query, FORCE[setup])
    rec = {"setup": setup, "query": q.query, "qtype": q.type, "split": split_of(q),
           "answer": a.answer, "tier": a.tier, "top_score": a.top_score,
           "latency_ms": a.latency_ms, "error": a.error,
           "connection_failed": a.connection_failed,
           "quota_exhausted": a.quota_exhausted, "n_sources": len(a.sources)}  # fmt: skip
    rec["cost"] = None if a.error else cost_of(a.attempts, cfg.prices)
    if a.error:
        v = ("incorrect", f"system error: {a.error}")
    else:
        g = (
            grade_unanswerable(a.answer, cfg.not_found_message)
            if q.type == "unanswerable"
            else judge(cfg, q.query, q.expected_answer, a.answer)
        )
        v = (
            "error" if getattr(g, "error", False) else "correct" if g.correct else "incorrect",
            g.reason,
        )
    rec["verdict"], rec["reason"] = v
    return rec


def write_outputs(out_dir: Path, records: list[dict], fraction: float, seed: int):
    results = [
        Result(r["setup"], r["split"], r["qtype"], r["verdict"] == "correct", r["latency_ms"],
               r["tier"], r["top_score"], r["cost"], r["query"],
               bool(r["error"]) or r["verdict"] == "error")
        for r in records
    ]  # fmt: skip
    with (out_dir / "results.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, RESULT_COLUMNS)
        w.writeheader()
        w.writerows(summarize(results))
    flagged = set(
        random.Random(seed).sample(range(len(records)), math.ceil(fraction * len(records)))
    )
    with (out_dir / "verdicts.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(VERDICT_COLUMNS)
        for i, r in enumerate(records):
            excerpt = " ".join(r["answer"].split())[:EXCERPT]
            flag = "yes" if i in flagged or r["verdict"] == "error" or r["error"] else ""
            with_src = "yes" if r["qtype"] == "unanswerable" and r.get("n_sources") else ""
            w.writerow([r["setup"], r["query"], excerpt, r["verdict"], r["reason"], flag, with_src])
    return results


def report(results, records, threshold):
    print(f"\n{'setup':18}{'split':10}" + "".join(f"{c[:14]:>16}" for c in RESULT_COLUMNS[2:]))
    for r in summarize(results):
        print(
            f"{r['setup']:18}{r['split']:10}" + "".join(f"{r[c]!s:>16}" for c in RESULT_COLUMNS[2:])
        )
    bad = confident_wrong(results, threshold)
    print(f"\nConfident and wrong (answer judged wrong, top_score >= {threshold}): {len(bad)}")
    by_key = {(r["setup"], r["query"]): r for r in records}
    for r in bad:
        ans = " ".join(by_key[(r.setup, r.query)]["answer"].split())[:160]
        print(f"  [{r.setup}] top_score={r.top_score:.2f} {r.query}\n      answer: {ans}")
    errors = sum(1 for r in records if r["error"])
    judge_errors = sum(1 for r in records if r["verdict"] == "error")
    answered = sum(1 for r in results if not r.errored)
    print(
        f"\naccuracy over {answered} answered of {len(results)} runs ({len(results) - answered} errors, left out)."
    )
    n_src = sum(
        1
        for r in records
        if r["qtype"] == "unanswerable" and r["verdict"] == "correct" and r.get("n_sources")
    )
    print(f"\n{n_src} not-found answer(s) still listed sources (graded correct; tracked).")
    print(
        f"{errors} system errors, {judge_errors} judge errors (left out of accuracy; see the errors column)."
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--questions", default=str(HERE / "questions.csv"))
    ap.add_argument("--env", default=str(DEFAULT_ENV))
    ap.add_argument("--out-dir", default=str(HERE))
    ap.add_argument("--state", help="resume state file (default: <out-dir>/.eval_state.json)")
    ap.add_argument("--resume", action="store_true", help="skip (setup, query) pairs already done")
    ap.add_argument("--limit", type=int, help="run only the first N answered questions")
    ap.add_argument("--dry-run", action="store_true", help="print what would run; no calls")
    ap.add_argument(
        "--review-fraction", type=float, default=0.2, help="share flagged for the human"
    )
    ap.add_argument("--seed", type=int, default=0, help="seed of the review sample")
    a = ap.parse_args(argv)
    out_dir = Path(a.out_dir)
    state_path = Path(a.state) if a.state else out_dir / ".eval_state.json"

    def fail(msg, code=2):
        print(msg, file=sys.stderr)
        return code

    try:
        questions = load_questions(a.questions)
        cfg = load_config(a.env, require=not a.dry_run)
    except (QuestionsError, ConfigError, OSError) as e:
        return fail(f"error: {e}")
    todo = [q for q in questions if q.expected_answer]
    skipped = len(questions) - len(todo)
    if not todo:
        return fail(
            "error: no row has an expected_answer; fill it in questions.csv first (see README)."
        )
    todo = todo[: a.limit] if a.limit else todo
    unknown = sorted({q.tenant for q in todo} - set(cfg.tenant_ids)) if not a.dry_run else []
    if unknown:
        return fail(f"error: tenant name(s) not in TENANT_IDS: {', '.join(unknown)}")
    print(
        f"{len(todo)} answered question(s) to run, skipped {skipped} question(s) without expected_answer."
    )
    pairs = [(s, q) for q in todo for s in SETUPS]
    if a.dry_run:
        for s, q in pairs:
            print(f"  {s} | {q.tenant} | {q.type} | {q.query}")
        print(f"dry run: {len(pairs)} runs, no calls made.")
        return 0
    state = {}
    if a.resume and state_path.exists():
        try:
            state = json.loads(state_path.read_text())
            if not isinstance(state, dict):
                raise ValueError("not an object")
            if state.get(STATE_MARK) != KEY_VERSION:
                print(
                    f"note: state file {state_path} was written with an older resume key "
                    "(it ignored models and router config); ignoring it and running everything.",
                    file=sys.stderr,
                )
                state = {}
        except ValueError:
            return fail(
                f"error: state file {state_path} is corrupt; delete it, or run without --resume."
            )
    state[STATE_MARK] = KEY_VERSION
    out_dir.mkdir(parents=True, exist_ok=True)
    in_a_row, aborted, quota = 0, False, False
    for n, (setup, q) in enumerate(pairs, 1):
        k = pair_key(cfg, q, setup)
        if k in state and not (state[k]["error"] or state[k]["verdict"] == "error"):
            continue  # done; pairs that failed are run again
        rec = run_pair(cfg, q, setup)
        if rec[
            "quota_exhausted"
        ]:  # not stored: this pair has not been answered and is run on --resume
            quota = True
            break
        state[k] = rec
        _save(state_path, state)
        print(f"[{n}/{len(pairs)}] {setup}: {state[k]['verdict']}")
        in_a_row = in_a_row + 1 if state[k]["connection_failed"] else 0
        if in_a_row >= cfg.max_consecutive_failures:
            aborted = True
            break
    records = [state[k] for s, q in pairs if (k := pair_key(cfg, q, s)) in state]
    results = write_outputs(out_dir, records, a.review_fraction, a.seed)
    report(results, records, cfg.confident_top_score)
    print(
        f"\nwrote {out_dir / 'results.csv'} and {out_dir / 'verdicts.csv'}; spot-check the flagged verdicts."
    )
    if quota:
        return fail(
            "error: the provider's quota is exhausted (it asked for a long wait); "
            f"{len(records)} of {len(pairs)} runs completed. Run again later with --resume.",
            3,
        )
    if aborted:
        return fail(
            f"error: stopped after {in_a_row} consecutive connection failures; is the rag-service "
            "running? Fix it and run again with --resume.",
            3,
        )
    return 0
