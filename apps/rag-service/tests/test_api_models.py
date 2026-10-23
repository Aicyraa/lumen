"""POST /internal/query with tenant models: tiers, backups, fallback, errors, attempts, snippets."""
import logging

import pytest

from app import store
from tests.test_api_query import add_doc, ask, best_score  # noqa: F401 (best_score is a fixture)

KEY = "sk-tenant-secret-key-abcdef"


def M(model_id, provider="openai_compatible", tmid=None):
    return {"provider": provider, "model_id": model_id, "endpoint_url": f"https://{model_id}.example.com/v1",
            "api_key": KEY, "tenant_model_id": tmid or f"id-{model_id}"}


def models(cheap=(), expensive=(), fallback=()):
    return {"cheap": [M(x) for x in cheap], "expensive": [M(x) for x in expensive], "fallback": [M(x) for x in fallback]}


@pytest.fixture
def docs(best_score):  # a tenant with a document and a strong match, so the cheap tier is chosen
    add_doc("tenant_a", ["We open at 8am every day."])
    best_score(0.6)


def tried(llm):
    return [c["model_id"] for c in llm.calls]


def test_models_are_tried_top_to_bottom_and_the_backup_answers(client, llm, docs):
    llm.outcomes = {"c1": "error"}
    llm.tokens = {"c2": (321, 45)}
    body = ask(client, models=models(cheap=["c1", "c2", "c3"])).json()
    assert tried(llm) == ["c1", "c2"]  # c3 is never reached
    assert body["answer"] == "Fake answer [1]"
    assert [(a["model_id"], a["tenant_model_id"], a["tier"], a["outcome"]) for a in body["attempts"]] == [
        ("c1", "id-c1", "cheap", "error"), ("c2", "id-c2", "cheap", "ok")]
    assert (body["usage"]["tokens_in"], body["usage"]["tokens_out"]) == (321, 45)  # the attempt that answered
    assert body["usage"]["cost_usd"] is None and body["route"]["model_tier"] == "cheap"


def test_the_requests_own_endpoint_and_key_reach_the_caller(client, llm, docs):
    ask(client, models=models(cheap=["c1"]))
    sent = llm.calls[0]["model"]
    assert sent["api_key"] == KEY and sent["endpoint_url"] == "https://c1.example.com/v1"


def test_whole_tier_failing_falls_back_in_order(client, llm, docs):
    llm.outcomes = {"c1": "error", "c2": "timeout", "f1": "rate_limited"}
    body = ask(client, models=models(cheap=["c1", "c2"], expensive=["e1"], fallback=["f1", "f2"])).json()
    assert tried(llm) == ["c1", "c2", "f1", "f2"]  # the expensive tier is not touched on a cheap route
    assert [(a["tier"], a["outcome"]) for a in body["attempts"]] == [
        ("cheap", "error"), ("cheap", "timeout"), ("fallback", "rate_limited"), ("fallback", "ok")]
    assert body["route"]["model_tier"] == "cheap"  # route still reports the router's tier only
    assert "api_key" not in str(body)


def test_everything_failing_is_502_provider_error_with_every_attempt(client, llm, docs, caplog):
    caplog.set_level(logging.DEBUG)
    llm.outcomes = {"c1": "error", "f1": "timeout"}
    resp = ask(client, models=models(cheap=["c1"], fallback=["f1"]))
    assert resp.status_code == 502
    body = resp.json()
    assert body["error"]["code"] == "provider_error" and body["error"]["message"]
    assert [(a["model_id"], a["outcome"], a["tokens_in"]) for a in body["attempts"]] == [
        ("c1", "error", None), ("f1", "timeout", None)]
    assert KEY not in resp.text and KEY not in caplog.text and "c1.example.com" not in body["error"]["message"]


def test_expensive_route_uses_the_expensive_models(client, llm, best_score):
    add_doc("tenant_a", ["x"])
    best_score(0.20)  # weak match: expensive tier
    body = ask(client, models=models(cheap=["c1"], expensive=["e1", "e2"])).json()
    assert tried(llm) == ["e1"] and body["route"]["model_tier"] == "expensive"
    assert body["attempts"][0]["tier"] == "expensive"


def test_a_tier_without_models_uses_the_other_tier(client, llm, docs):
    body = ask(client, models=models(expensive=["e1"])).json()  # cheap route, no cheap models
    assert tried(llm) == ["e1"] and body["attempts"][0]["tier"] == "expensive"
    assert body["route"]["model_tier"] == "cheap"


def test_a_tenant_with_only_fallback_models_uses_them(client, llm, docs):
    body = ask(client, models=models(fallback=["f1"])).json()
    assert tried(llm) == ["f1"] and body["attempts"][0]["tier"] == "fallback"


def test_no_models_at_all_is_422_with_zero_calls(client, llm, docs):
    resp = ask(client, models=models())
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "no_models_configured" and "Models" in resp.json()["error"]["message"]
    assert llm.calls == []


def test_models_absent_uses_the_env_default_per_tier(client, llm, docs):
    body = ask(client).json()
    assert tried(llm) == ["cheap-model"]
    a = body["attempts"][0]
    assert (a["tier"], a["tenant_model_id"]) == ("default", None)
    assert llm.calls[0]["model"]["api_key"] == "test-key-not-real"


def test_models_absent_in_production_is_422_even_with_llm_env_set(client, llm, docs, monkeypatch):
    monkeypatch.setenv("NODE_ENV", "production")
    resp = ask(client)
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "no_models_configured"
    assert llm.calls == []


@pytest.mark.parametrize("missing", ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL_CHEAP"])
def test_models_absent_and_default_unusable_is_422(client, llm, docs, monkeypatch, missing):
    monkeypatch.delenv(missing)
    resp = ask(client)
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "no_models_configured"
    assert llm.calls == []


def test_tenant_models_are_never_mixed_with_the_env_default(client, llm, docs):
    llm.outcomes = {"c1": "error"}
    assert ask(client, models=models(cheap=["c1"])).status_code == 502
    assert tried(llm) == ["c1"]  # cheap-model was not tried as a last resort


def test_no_documents_and_no_answer_paths_are_model_free_with_empty_attempts(client, llm, best_score):
    best_score(0.9)
    body = ask(client, tenant="nobody", models=models(cheap=["c1"])).json()  # no documents
    assert body["attempts"] == []
    add_doc("tenant_a", ["x"])
    best_score(0.05)  # below no_answer_score
    body = ask(client, models=models(cheap=["c1"])).json()
    assert body["attempts"] == [] and body["route"]["model_tier"] == "none"
    assert llm.calls == []


def test_no_models_path_needs_no_models_when_nothing_matches(client, llm, best_score):
    add_doc("tenant_a", ["x"])
    best_score(0.05)
    assert ask(client, models=models()).status_code == 200  # the model is never needed, so no 422


def test_rate_limits_and_reported_cost_are_passed_through_when_present(client, llm, docs):
    llm.extra = {"c1": {"rate_limits": {"x-ratelimit-remaining-requests": "9"}, "reported_cost_usd": 0.0002}}
    a = ask(client, models=models(cheap=["c1"])).json()["attempts"][0]
    assert a["rate_limits"] == {"x-ratelimit-remaining-requests": "9"} and a["reported_cost_usd"] == 0.0002
    llm.extra = {}
    a = ask(client, models=models(cheap=["c1"])).json()["attempts"][0]
    assert "rate_limits" not in a and "reported_cost_usd" not in a
    assert set(a) == {"provider", "model_id", "tenant_model_id", "tier", "outcome", "tokens_in", "tokens_out", "latency_ms"}


@pytest.mark.parametrize("bad", [
    {"cheap": [{**M("c1"), "provider": "mystery"}]},
    {"cheap": [{k: v for k, v in M("c1").items() if k != "api_key"}]},
    {"cheap": "c1"},
])
def test_malformed_models_are_422_invalid_request(client, llm, docs, bad):
    resp = ask(client, models=bad)
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"
    assert KEY not in resp.text and llm.calls == []


def test_include_snippets_adds_filename_and_a_200_char_snippet(client, llm, best_score):
    add_doc("tenant_a", ["S" * 500], filename="handbook.md")
    best_score(0.6)
    plain = ask(client, models=models(cheap=["c1"])).json()["sources"][0]
    assert set(plain) == {"document_id", "chunk_id", "score"}
    src = ask(client, models=models(cheap=["c1"]), include_snippets=True).json()["sources"][0]
    assert src["filename"] == "handbook.md" and src["snippet"] == "S" * 200
    assert {"document_id", "chunk_id", "score"} <= set(src)


def test_snippets_are_never_logged(client, llm, best_score, caplog):
    caplog.set_level(logging.DEBUG)
    add_doc("tenant_a", ["very private passage text"])
    best_score(0.6)
    ask(client, models=models(cheap=["c1"]), include_snippets=True)
    assert "very private passage" not in caplog.text and KEY not in caplog.text


def test_filenames_are_looked_up_for_one_tenant_only():
    doc_a, doc_b = add_doc("tenant_a", ["a"], "a.txt"), add_doc("tenant_b", ["b"], "b.txt")
    assert store.filenames("tenant_a", [doc_a, doc_b]) == {doc_a: "a.txt"}
    assert store.filenames("tenant_a", []) == {}
