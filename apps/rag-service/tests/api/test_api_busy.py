import threading

import numpy as np

from app.core import limits
from app.core.config import load_config
from tests.api.test_api_ingest import post
from tests.conftest import AUTH, add_document


def test_ingest_over_the_limit_waits_then_503_busy_and_queries_still_run(client, monkeypatch):
    limits.reset()
    cfg = load_config()["concurrency"]
    monkeypatch.setitem(cfg, "ingest_max", 1)
    monkeypatch.setitem(cfg, "ingest_wait_seconds", 0.3)
    gate, entered = threading.Event(), threading.Event()

    def fake_embed(texts):
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
