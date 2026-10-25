import json

from evalkit.config import Config
from evalkit.judge import grade_unanswerable, judge
from evalkit.rag import query_rag


def cfg(rag="", judge_url=""):
    return Config(base_url="https://models.example/v1", api_key="KEY", provider="openai",
                  model_cheap="small", model_expensive="big", judge_model="jm",
                  judge_base_url=judge_url, judge_api_key="JKEY", rag_url=rag,
                  internal_secret="SECRET", not_found_message="NOT FOUND.")  # fmt: skip


OK = {"request_id": "r", "answer": "A [1]", "sources": [{"document_id": "d", "chunk_id": 1, "score": 0.7}],
      "route": {"model_tier": "cheap", "k": 5, "escalated": False, "difficulty": 0.0, "top_score": 0.7},
      "usage": {"tokens_in": 10, "tokens_out": 5, "cost_usd": None, "latency_ms": 321},
      "attempts": [{"tier": "cheap", "tokens_in": 10, "tokens_out": 5, "outcome": "ok"}]}  # fmt: skip


def test_query_rag_sends_secret_models_and_force_tier(server):
    s = server(lambda *a: (200, {}, OK))
    a = query_rag(cfg(s.url), "tenant-1", "Q?", "expensive")
    call = s.calls[0]
    assert call["path"] == "/internal/query" and call["headers"]["x-internal-secret"] == "SECRET"
    assert call["body"]["tenant_id"] == "tenant-1" and call["body"]["query"] == "Q?"
    assert call["body"]["force_tier"] == "expensive"
    assert call["body"]["models"]["cheap"][0]["model_id"] == "small"
    assert (a.answer, a.tier, a.latency_ms, a.top_score, a.error) == (
        "A [1]",
        "cheap",
        321,
        0.7,
        "",
    )
    assert len(a.sources) == 1 and a.attempts[0]["tokens_in"] == 10


def test_query_rag_omits_force_tier_for_the_rule_router(server):
    s = server(lambda *a: (200, {}, OK))
    query_rag(cfg(s.url), "t", "Q?", None)
    assert "force_tier" not in s.calls[0]["body"]


def test_query_rag_reports_an_error_code(server):
    s = server(lambda *a: (502, {}, {"error": {"code": "provider_error", "message": "m"}}))
    a = query_rag(cfg(s.url), "t", "Q?", None)
    assert a.error == "provider_error" and a.answer == ""


def test_query_rag_backs_off_on_429(server, no_sleep):
    seq = iter([(429, {"retry-after": "3"}, {}), (200, {}, OK)])
    s = server(lambda *a: next(seq))
    assert query_rag(cfg(s.url), "t", "Q?", None).error == "" and no_sleep == [3]


def verdict_reply(content):
    return (200, {}, {"choices": [{"message": {"content": content}}]})


def test_judge_calls_with_temperature_zero_and_parses_strict_json(server):
    s = server(lambda *a: verdict_reply('{"correct": true, "reason": "same facts"}'))
    v = judge(cfg(judge_url=s.url), "Q?", "expected", "system answer")
    assert (v.correct, v.reason, v.error) == (True, "same facts", False)
    c = s.calls[0]
    assert c["path"] == "/chat/completions" and c["headers"]["authorization"] == "Bearer JKEY"
    assert c["body"]["temperature"] == 0 and c["body"]["model"] == "jm"
    prompt = json.dumps(c["body"]["messages"])
    assert "expected" in prompt and "system answer" in prompt and "Q?" in prompt


def test_judge_accepts_a_fenced_json_reply(server):
    s = server(lambda *a: verdict_reply('```json\n{"correct": false, "reason": "wrong date"}\n```'))
    assert judge(cfg(judge_url=s.url), "Q", "e", "a").correct is False


def test_judge_retries_once_on_garbage_then_marks_error(server):
    s = server(lambda *a: verdict_reply("sure thing"))
    v = judge(cfg(judge_url=s.url), "Q", "e", "a")
    assert v.error and not v.correct and len(s.calls) == 2


def test_judge_rejects_a_non_boolean_verdict(server):
    s = server(lambda *a: verdict_reply('{"correct": "yes", "reason": "x"}'))
    assert judge(cfg(judge_url=s.url), "Q", "e", "a").error


def test_unanswerable_is_correct_for_the_not_found_message_whatever_the_sources():
    nf = "NOT FOUND."
    assert grade_unanswerable(nf, [], nf).correct
    assert grade_unanswerable("  NOT FOUND.  ", [], nf).correct
    with_src = grade_unanswerable(nf, [{"document_id": "d"}, {"document_id": "e"}], nf)
    assert with_src.correct and with_src.listed_sources == 2  # tracked, not penalised
    assert grade_unanswerable(nf, [], nf).listed_sources == 0
    assert not grade_unanswerable("The president is Ana [1].", [], nf).correct
    assert not grade_unanswerable("The president is Ana [1].", [{"document_id": "d"}], nf).correct
    assert not grade_unanswerable("", [], nf).correct


def rate_limited_502(headers):
    return (502, {}, {"error": {"code": "provider_error", "message": "m"},
                      "attempts": [{"tier": "cheap", "outcome": "rate_limited", "rate_limits": headers}]})  # fmt: skip


def test_query_rag_waits_out_a_provider_rate_limit_and_retries(server, no_sleep):
    seq = iter([rate_limited_502({"retry-after": "4"}), (200, {}, OK)])
    s = server(lambda *a: next(seq))
    a = query_rag(cfg(s.url), "t", "Q?", None)
    assert a.error == "" and a.answer == "A [1]" and no_sleep == [4] and len(s.calls) == 2


def test_query_rag_uses_the_empty_token_bucket_reset(server, no_sleep):
    seq = iter(
        [
            rate_limited_502(
                {"x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "6.5s"}
            ),
            (200, {}, OK),
        ]
    )
    s = server(lambda *a: next(seq))
    assert query_rag(cfg(s.url), "t", "Q?", None).error == "" and no_sleep == [6.5]


def test_query_rag_gives_up_after_the_retries(server, no_sleep):
    s = server(lambda *a: rate_limited_502({"retry-after": "1"}))
    c = cfg(s.url)
    c.backoff_retries = 2
    a = query_rag(c, "t", "Q?", None)
    assert a.error == "provider_error" and len(s.calls) == 3 and no_sleep == [1, 1]


def test_a_very_long_wait_means_the_quota_is_exhausted(server, no_sleep):
    s = server(lambda *a: rate_limited_502({"retry-after": "7200"}))
    a = query_rag(cfg(s.url), "t", "Q?", None)
    assert (
        a.quota_exhausted and a.error == "quota_exhausted" and no_sleep == [] and len(s.calls) == 1
    )


def test_other_502s_are_not_retried(server, no_sleep):
    s = server(
        lambda *a: (
            502,
            {},
            {"error": {"code": "provider_error"}, "attempts": [{"outcome": "error"}]},
        )
    )
    assert query_rag(cfg(s.url), "t", "Q?", None).error == "provider_error" and len(s.calls) == 1
