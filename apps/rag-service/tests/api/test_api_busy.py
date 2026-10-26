import threading

import numpy as np

from app.core import limits
from app.core.config import load_config
from app.retrieval import embeddings, reranker
from tests.api.test_api_ingest import post
from tests.api.test_api_query import add_doc, ask, best_score  # noqa: F401 (best_score is a fixture)
from tests.conftest import AUTH, add_document


def test_ingest_over_the_limit_waits_then_503_busy_and_queries_still_run(client, monkeypatch):
    limits.reset()
    cfg = load_config()["concurrency"]
    monkeypatch.setitem(cfg, "ingest_max", 1)
    monkeypatch.setitem(cfg, "ingest_wait_seconds", 0.3)
    gate, entered = threading.Event(), threading.Event()

    def fake_embed(texts, wait=None):
        if len(texts) > 1:  # an upload's batch: hold the ingest slot until released
            entered.set()
            gate.wait(5)
        return np.zeros((len(texts), 384), dtype=np.float32)

    monkeypatch.setattr("app.api.routes.embed", fake_embed)
    first_doc = add_document("tenant_a", "one.txt")
    second_doc = add_document("tenant_a", "two.txt")
    result = {}
    t = threading.Thread(target=lambda: result.update(r=post(client, "tenant_a", first_doc)))
    t.start()
    assert entered.wait(5)
    busy = post(client, "tenant_a", second_doc)
    assert busy.status_code == 503
    assert busy.json()["error"]["code"] == "busy"
    assert busy.headers["Retry-After"] == str(cfg["retry_after_seconds"])
    # a query is not starved by the upload: it does not need the ingest slot
    q = client.post(
        "/internal/query", headers=AUTH, json={"tenant_id": "tenant_a", "query": "anything"}
    )
    assert q.status_code == 200
    gate.set()
    t.join(10)
    assert result["r"].status_code == 200
    limits.reset()


class BlockedModel:
    """Fake embedder and reranker: every call holds its slot until `gate` is set."""

    def __init__(self):
        self.gate, self.entered = threading.Event(), threading.Event()

    def _hold(self):
        self.entered.set()
        self.gate.wait(5)

    def encode(self, texts, **kwargs):
        self._hold()
        return np.zeros((len(texts), 384), dtype=np.float32)

    def predict(self, pairs, **kwargs):
        self._hold()
        return [0.0] * len(pairs)


def _busy_query_while_a_slot_is_held(client, monkeypatch, slot_max_key):
    """Hold the only slot with one query, then ask a second one: it must get 503 busy after the wait."""
    limits.reset()
    cfg = load_config()["concurrency"]
    monkeypatch.setitem(cfg, slot_max_key, 1)
    monkeypatch.setitem(cfg, "query_wait_seconds", 0.3)
    model = BlockedModel()
    started = threading.Thread(target=lambda: ask(client))
    return cfg, model, started


def test_a_query_over_the_embed_limit_waits_then_503_busy(client, monkeypatch):
    cfg, model, first = _busy_query_while_a_slot_is_held(client, monkeypatch, "embed_max")
    monkeypatch.setattr(embeddings, "_model", model)
    first.start()
    assert model.entered.wait(5)
    busy = ask(client)
    model.gate.set()
    first.join(10)
    limits.reset()
    assert busy.status_code == 503 and busy.json()["error"]["code"] == "busy"
    assert busy.headers["Retry-After"] == str(cfg["retry_after_seconds"])


def test_a_query_over_the_rerank_limit_waits_then_503_busy(client, llm, monkeypatch, best_score):
    cfg, model, first = _busy_query_while_a_slot_is_held(client, monkeypatch, "rerank_max")
    add_doc("tenant_a", ["We open at 8am every day."])
    best_score(0.9)
    monkeypatch.setattr("app.api.routes.rerank", reranker.rerank)  # the autouse fake skips the slot
    monkeypatch.setattr(reranker, "_model", lambda: model)
    first.start()
    assert model.entered.wait(5)
    busy = ask(client)
    model.gate.set()
    first.join(10)
    limits.reset()
    assert busy.status_code == 503 and busy.json()["error"]["code"] == "busy"
    assert busy.headers["Retry-After"] == str(cfg["retry_after_seconds"])
