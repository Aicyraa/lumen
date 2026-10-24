import csv
import json

import pytest

from evalkit.cli import main
from evalkit.questions import HEADER

NF = "I could not find that in the documents."


def rag_handler(calls_log=None):
    def handler(method, path, headers, body):
        tier = body.get("force_tier")
        label = tier or "router"
        q = body["query"]
        if q == "Q2?":  # unanswerable
            if tier == "expensive":
                return 200, {}, resp("The president is Ana [1].", "expensive", 0.4, 300, True)
            return 200, {}, resp(NF, "none", 0.1, 100 if tier else 200, False)
        lat = {"cheap": 100, "expensive": 300, "router": 200}[label]
        return 200, {}, resp(f"{label} answer", tier or "cheap", 0.9, lat, True)

    return handler


def resp(answer, tier, top, latency, with_source):
    attempts = (
        [{"tier": "cheap", "tokens_in": 1_000_000, "tokens_out": 0, "outcome": "ok"}]
        if tier == "cheap"
        else [{"tier": "expensive", "tokens_in": 10, "tokens_out": 5, "outcome": "ok"}]
        if tier == "expensive"
        else []
    )
    return {
        "request_id": "r", "answer": answer,
        "sources": [{"document_id": "d", "chunk_id": 1, "score": top}] if with_source else [],
        "route": {"model_tier": tier, "k": 5, "escalated": False, "difficulty": 0, "top_score": top},
        "usage": {"tokens_in": 1, "tokens_out": 1, "cost_usd": None, "latency_ms": latency},
        "attempts": attempts,
    }  # fmt: skip


def judge_handler(method, path, headers, body):
    text = body["messages"][-1]["content"]
    ok = "SYSTEM ANSWER:\n" in text and (
        "cheap" in text.split("SYSTEM ANSWER:\n")[1]
        or "router" in text.split("SYSTEM ANSWER:\n")[1]
    )
    out = json.dumps({"correct": ok, "reason": "scripted"})
    return 200, {}, {"choices": [{"message": {"content": out}}]}


@pytest.fixture
def env(tmp_path, server):
    rag, judge = server(rag_handler()), server(judge_handler)
    envp = tmp_path / ".env"
    envp.write_text(
        "\n".join(
            [
                f"EVAL_BASE_URL={judge.url}",
                "EVAL_API_KEY=KEY",
                "EVAL_PROVIDER=openai",
                "EVAL_MODEL_CHEAP=small",
                "EVAL_MODEL_EXPENSIVE=big",
                "EVAL_JUDGE_MODEL=jm",
                "TENANT_IDS=Lumen=tenant-1",
                f"RAG_URL={rag.url}",
                "INTERNAL_SECRET=S",
                "EVAL_CONFIDENT_TOP_SCORE=0.5",
                "EVAL_PRICE_CHEAP_INPUT=2",
                "EVAL_PRICE_CHEAP_OUTPUT=4",
            ]
        )  # fmt: skip
    )
    rows = [
        ["Q1?", "Lumen", "d", "easy", "cheap-ish truth", "a.pdf", "", "", ""],
        ["Q2?", "Lumen", "d", "unanswerable", "not in the documents", "", "true", "", ""],
        ["Q3?", "Lumen", "d", "hard", "", "a.pdf", "", "", ""],
    ]
    return write_q(tmp_path, rows), envp, rag, judge, tmp_path


def write_q(tmp_path, rows, header=HEADER):
    p = tmp_path / "q.csv"
    with p.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    return p


def args(env, *extra):
    q, envp, _, _, tmp = env
    return ["--questions", str(q), "--env", str(envp), "--out-dir", str(tmp), *extra]


def read(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def test_full_run_writes_exact_results_and_verdicts(env, capsys):
    q, envp, rag, judge, tmp = env
    assert main(args(env)) == 0
    res = read(tmp / "results.csv")
    assert list(res[0]) == [
        "setup", "split", "accuracy", "median_latency_ms", "escalation_rate",
        "unanswerable_handled", "estimated_cost_per_query_usd",
    ]  # fmt: skip
    got = {(r["setup"], r["split"]): r for r in res}
    assert set(got) == {(s, p) for s in ("always_cheap", "always_expensive", "rule_router")
                        for p in ("train", "held_out")}  # fmt: skip
    c = got[("always_cheap", "train")]
    assert (c["accuracy"], c["median_latency_ms"], c["escalation_rate"]) == ("1.0", "100", "0.0")
    assert c["estimated_cost_per_query_usd"] == "2.0" and c["unanswerable_handled"] == ""
    e = got[("always_expensive", "train")]
    assert (e["accuracy"], e["escalation_rate"], e["estimated_cost_per_query_usd"]) == (
        "0.0",
        "1.0",
        "",
    )
    assert got[("always_cheap", "held_out")]["unanswerable_handled"] == "1.0"
    assert got[("always_expensive", "held_out")]["unanswerable_handled"] == "0.0"
    assert got[("rule_router", "train")]["median_latency_ms"] == "200"
    out = capsys.readouterr().out
    assert "skipped 1 question" in out
    assert "confident and wrong" in out.lower() and "Q1?" in out and "always_expensive" in out


def test_setups_call_the_service_with_the_right_force_tier(env):
    q, envp, rag, judge, tmp = env
    main(args(env))
    q1 = [c["body"] for c in rag.calls if c["body"]["query"] == "Q1?"]
    assert [b.get("force_tier", "none") for b in q1] == ["cheap", "expensive", "none"]
    assert all(c["headers"]["x-internal-secret"] == "S" for c in rag.calls)
    assert all(c["body"]["tenant_id"] == "tenant-1" for c in rag.calls)
    assert len(rag.calls) == 6  # Q3 has no expected_answer and never runs


def test_unanswerable_rows_are_graded_by_rule_not_by_the_judge(env):
    q, envp, rag, judge, tmp = env
    main(args(env))
    assert len(judge.calls) == 3  # only Q1 in three setups
    v = read(tmp / "verdicts.csv")
    assert list(v[0]) == [
        "setup",
        "query",
        "answer_excerpt",
        "verdict",
        "reason",
        "flagged_for_review",
    ]
    rule = [r for r in v if r["query"] == "Q2?" and r["setup"] == "always_cheap"][0]
    assert rule["verdict"] == "correct" and rule["reason"].startswith("rule:")


def test_review_sample_is_a_fraction_of_the_verdicts(env):
    main(args(env, "--review-fraction", "0.34"))
    v = read(env[4] / "verdicts.csv")
    assert len(v) == 6 and sum(r["flagged_for_review"] == "yes" for r in v) == 3  # ceil(0.34 * 6)
    main(args(env, "--review-fraction", "1"))
    assert all(r["flagged_for_review"] == "yes" for r in read(env[4] / "verdicts.csv"))


def test_resume_skips_completed_pairs(env):
    q, envp, rag, judge, tmp = env
    assert main(args(env, "--limit", "1")) == 0
    assert len(rag.calls) == 3
    assert main(args(env, "--resume")) == 0
    assert len(rag.calls) == 6 and len(judge.calls) == 3  # no pair was run twice
    assert len(read(tmp / "results.csv")) == 6
    assert main(args(env, "--resume")) == 0 and len(rag.calls) == 6  # nothing left to do


def test_without_resume_the_run_starts_over(env):
    main(args(env, "--limit", "1"))
    main(args(env, "--limit", "1"))
    assert len(env[2].calls) == 6


def test_dry_run_makes_no_calls_and_writes_nothing(env, capsys):
    assert main(args(env, "--dry-run")) == 0
    assert env[2].calls == [] and env[3].calls == []
    assert not (env[4] / "results.csv").exists() and not (env[4] / ".eval_state.json").exists()
    out = capsys.readouterr().out
    assert out.count("always_cheap") == 2 and "6 runs" in out


def test_refuses_when_no_row_has_an_expected_answer(tmp_path, env, capsys):
    p = write_q(tmp_path, [["Q?", "Lumen", "d", "easy", "", "a.pdf", "", "", ""]])
    assert main(["--questions", str(p), "--env", str(env[1]), "--out-dir", str(tmp_path)]) == 2
    assert "expected_answer" in capsys.readouterr().err and env[2].calls == []


def test_rejects_a_wrong_csv_header(tmp_path, env, capsys):
    p = write_q(tmp_path, [], header=HEADER[::-1])
    assert main(["--questions", str(p), "--env", str(env[1]), "--out-dir", str(tmp_path)]) == 2
    assert "header" in capsys.readouterr().err


def test_unknown_tenant_name_stops_before_any_call(tmp_path, env, capsys):
    p = write_q(tmp_path, [["Q?", "Nobody", "d", "easy", "x", "a.pdf", "", "", ""]])
    assert main(["--questions", str(p), "--env", str(env[1]), "--out-dir", str(tmp_path)]) == 2
    assert "Nobody" in capsys.readouterr().err and env[2].calls == []


def test_judge_429_is_waited_out(env, server, no_sleep):
    q, envp, rag, judge, tmp = env
    hits = []

    def flaky(method, path, headers, body):
        hits.append(1)
        if len(hits) == 1:
            return 429, {"retry-after": "7"}, {}
        return judge_handler(method, path, headers, body)

    j2 = server(flaky)
    envp.write_text(envp.read_text().replace(judge.url, j2.url))
    assert main(args(env, "--limit", "1")) == 0
    assert 7 in no_sleep


def test_a_failing_service_counts_as_wrong_and_is_reported(env, server, capsys):
    q, envp, rag, judge, tmp = env
    bad = server(lambda *a: (502, {}, {"error": {"code": "provider_error", "message": "m"}}))
    envp.write_text(envp.read_text().replace(rag.url, bad.url))
    assert main(args(env, "--limit", "1")) == 0
    got = {r["setup"]: r for r in read(tmp / "results.csv")}
    assert (
        got["always_cheap"]["accuracy"] == "0.0" and got["always_cheap"]["median_latency_ms"] == ""
    )
    assert "provider_error" in read(tmp / "verdicts.csv")[0]["reason"]
    assert "3 system errors" in capsys.readouterr().out


def test_resume_retries_pairs_that_failed(env, server):
    q, envp, rag, judge, tmp = env
    bad = server(lambda *a: (502, {}, {"error": {"code": "provider_error", "message": "m"}}))
    good_url = rag.url
    envp.write_text(envp.read_text().replace(good_url, bad.url))
    main(args(env, "--limit", "1"))
    envp.write_text(envp.read_text().replace(bad.url, good_url))
    main(args(env, "--limit", "1", "--resume"))
    assert len(rag.calls) == 3  # the three failed pairs were run again
    assert {
        r["accuracy"] for r in read(tmp / "results.csv") if r["setup"] != "always_expensive"
    } == {"1.0"}
