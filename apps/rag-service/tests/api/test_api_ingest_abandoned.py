"""A document Express marked failed (ingest timeout) must not get chunks from the abandoned work."""

import numpy as np
import pytest

from app.core.config import load_config
from app.retrieval import store
from tests.api.test_api_ingest import chunk_count, db_rows, post
from tests.conftest import add_document


def set_status(tenant, doc, status):
    from app.retrieval import db

    with db.connection() as conn:
        conn.execute(
            "UPDATE documents SET status = %s WHERE tenant_id = %s AND id = %s",
            (status, tenant, doc),
        )


def test_failed_document_gets_no_chunks_and_409(client):
    doc = add_document("tenant_a", "a.txt")
    set_status("tenant_a", doc, "failed")
    resp = post(client, "tenant_a", doc)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "document_not_ingestable"
    assert chunk_count("tenant_a", doc) == 0


def test_store_refuses_chunks_for_a_failed_document():
    doc = add_document("t", "a.txt")
    set_status("t", doc, "failed")
    with pytest.raises(store.DocumentNotIngestable):
        store.add_chunks("t", doc, ["x"], np.zeros((1, 384), dtype=np.float32))
    assert chunk_count("t", doc) == 0


def test_store_refuses_chunks_for_a_missing_document():
    from tests.conftest import ensure_tenant

    ensure_tenant("t")
    with pytest.raises(store.DocumentMissing):
        store.add_chunks(
            "t", "00000000-0000-0000-0000-000000000000", ["x"], np.zeros((1, 384), dtype=np.float32)
        )


def test_status_is_checked_in_the_same_transaction_as_the_insert(client, monkeypatch):
    # the document turns failed after the routes' early checks but before the write
    doc = add_document("tenant_a", "a.txt")
    real = store.add_chunks

    def late(tenant, document, chunks, vectors):
        set_status(tenant, document, "failed")
        return real(tenant, document, chunks, vectors)

    monkeypatch.setattr("app.api.routes.store.add_chunks", late)
    assert post(client, "tenant_a", doc).status_code == 409
    assert chunk_count("tenant_a", doc) == 0


def test_ingest_aborts_between_batches_when_the_document_fails(client, monkeypatch):
    cfg = load_config()["ingest"]
    monkeypatch.setitem(cfg, "embed_batch_size", 1)
    monkeypatch.setitem(cfg, "status_check_every_batches", 1)
    doc = add_document("tenant_a", "a.txt")
    calls = []

    def fake_embed(texts):
        calls.append(len(texts))
        set_status("tenant_a", doc, "failed")  # Express times the document out mid-embedding
        return np.zeros((len(texts), 384), dtype=np.float32)

    monkeypatch.setattr("app.api.routes.embed", fake_embed)
    resp = post(client, "tenant_a", doc)
    assert resp.status_code == 409 and calls == [1]  # stopped after the first batch
    assert chunk_count("tenant_a", doc) == 0


def test_unknown_document_is_404_before_any_embedding(client, monkeypatch):
    def no_embed(texts):
        raise AssertionError("must not embed for a missing document")

    monkeypatch.setattr("app.api.routes.embed", no_embed)
    resp = post(client, "tenant_a", "00000000-0000-0000-0000-000000000009")
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"
    assert db_rows("SELECT count(*) FROM chunks")[0][0] == 0
