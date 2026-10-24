"""POST /internal/query with force_tier: replaces the router's tier choice, nothing else."""

import pytest

from tests.api.test_api_models import models, tried
from tests.api.test_api_query import MESSAGES, add_doc, ask, best_score  # noqa: F401
from tests.conftest import AUTH

EASY = "What time does the cafe open?"
HARD = "Compare the two opening times"  # contains a hard word: the router sends it to expensive
TIERS = models(cheap=["c1"], expensive=["e1"])


@pytest.fixture
def docs(best_score):  # a strong match, so the router alone would pick cheap for EASY
    add_doc("tenant_a", [f"passage number {i}" for i in range(10)])
    best_score(0.6)


@pytest.mark.parametrize("tier,model,k", [("cheap", "c1", 5), ("expensive", "e1", 8)])
def test_forced_tier_picks_its_models_and_k(client, llm, docs, tier, model, k):
    body = ask(client, models=TIERS, force_tier=tier).json()
    assert tried(llm) == [model]
    assert (body["route"]["model_tier"], body["route"]["k"]) == (tier, k)
    assert len(body["sources"]) == k
    assert body["route"]["escalated"] is False
    assert [a["tier"] for a in body["attempts"]] == [tier]


def test_easy_question_forced_expensive_still_reports_its_difficulty(client, llm, docs):
    route = ask(client, query=EASY, models=TIERS, force_tier="expensive").json()["route"]
    assert (route["model_tier"], route["escalated"], route["difficulty"]) == (
        "expensive",
        False,
        0.0,
    )


def test_hard_question_forced_cheap_overrides_the_escalation(client, llm, docs):
    route = ask(client, query=HARD, models=TIERS, force_tier="cheap").json()["route"]
    assert (route["model_tier"], route["k"], route["escalated"]) == ("cheap", 5, False)
    assert route["difficulty"] == 0.25  # one hard word; still reported, not zeroed
    assert tried(llm) == ["c1"]


def test_without_force_tier_the_router_still_decides(client, llm, docs):
    route = ask(client, query=HARD, models=TIERS).json()["route"]
    assert (route["model_tier"], route["escalated"]) == ("expensive", True)


@pytest.mark.parametrize("value", ["fallback", "none", "", "CHEAP", 1])
def test_invalid_force_tier_is_422_invalid_request(client, llm, docs, value):
    resp = client.post(
        "/internal/query",
        headers=AUTH,
        json={"tenant_id": "tenant_a", "query": EASY, "force_tier": value},
    )
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"
    assert llm.calls == []


def test_forced_tier_with_no_models_borrows_the_other_tier(client, llm, docs):
    body = ask(client, models=models(expensive=["e1"]), force_tier="cheap").json()
    assert tried(llm) == ["e1"] and body["route"]["model_tier"] == "cheap"


def test_not_found_path_stays_model_free_even_when_forced(client, llm, best_score):
    add_doc("tenant_a", ["Shipping is unavailable."])
    best_score(0.10)  # below no_answer_score
    body = ask(client, models=TIERS, force_tier="expensive").json()
    assert llm.calls == [] and body["answer"] == MESSAGES["not_found"]
    assert body["route"]["model_tier"] == "none" and body["route"]["k"] == 0


def test_no_documents_path_stays_model_free_even_when_forced(client, llm, best_score):
    best_score(0.9)
    body = ask(client, tenant="tenant_a", models=TIERS, force_tier="cheap").json()
    assert llm.calls == [] and body["answer"] == MESSAGES["no_documents"]
    assert body["route"]["model_tier"] == "none"
