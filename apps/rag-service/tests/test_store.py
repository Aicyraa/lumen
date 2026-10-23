import os

import numpy as np
import psycopg
import pytest

from app import store


def vec(i):
    v = np.zeros(384, dtype=np.float32)
    v[i] = 1.0  # unit vector along axis i
    return v


def add(tenant, filename, contents, axes):
    doc = store.add_document(tenant, filename)
    store.add_chunks(tenant, doc, contents, np.array([vec(a) for a in axes]))
    return doc


def test_search_returns_only_the_callers_tenant():
    add("tenant_a", "a.txt", ["a secret"], [0])
    add("tenant_b", "b.txt", ["b secret"], [0])  # identical vector: would tie if unfiltered
    hits = store.search("tenant_a", vec(0), k=10)
    assert [h[2] for h in hits] == ["a secret"]


def test_search_orders_by_score_and_returns_tuple_shape():
    doc = add("t", "f.txt", ["far", "near"], [1, 0])
    hits = store.search("t", vec(0), k=2)
    chunk_id, document_id, content, score = hits[0]
    assert (content, document_id) == ("near", doc)
    assert score == pytest.approx(1.0)
    assert hits[1][2] == "far" and hits[1][3] == pytest.approx(0.0)
    assert isinstance(chunk_id, int)


def test_delete_document_removes_its_chunks():
    doc = add("t", "f.txt", ["x", "y"], [0, 1])
    keep = add("t", "g.txt", ["z"], [2])
    assert store.delete_document("t", doc) == 2
    assert [h[2] for h in store.search("t", vec(0), k=10)] == ["z"]
    assert store.search("t", vec(0), k=10)[0][1] == keep


def test_delete_document_of_another_tenant_does_nothing():
    doc = add("tenant_a", "a.txt", ["x"], [0])
    assert store.delete_document("tenant_b", doc) == 0
    assert len(store.search("tenant_a", vec(0), k=5)) == 1


def test_chunk_with_other_tenant_than_its_document_is_rejected():
    doc = store.add_document("tenant_a", "a.txt")
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        store.add_chunks("tenant_b", doc, ["x"], np.array([vec(0)]))


def count_chunks(tenant, doc):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        return conn.execute(
            "SELECT count(*) FROM chunks WHERE tenant_id = %s AND document_id = %s", (tenant, doc)
        ).fetchone()[0]


def test_add_chunks_for_an_existing_document_is_all_or_nothing():
    # ingest relies on this: Express creates the documents row, Python writes the chunks
    doc = store.add_document("t", "f.txt")
    good, bad = vec(0), np.zeros(10, dtype=np.float32)  # wrong dimension fails on the second row
    with pytest.raises(psycopg.Error):
        store.add_chunks("t", doc, ["one", "two"], [good, bad])
    assert count_chunks("t", doc) == 0


def test_add_chunks_for_a_missing_document_writes_nothing():
    missing = "00000000-0000-0000-0000-000000000000"
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        store.add_chunks("t", missing, ["x"], np.array([vec(0)]))
    assert count_chunks("t", missing) == 0
