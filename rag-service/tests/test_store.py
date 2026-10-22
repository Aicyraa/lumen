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
