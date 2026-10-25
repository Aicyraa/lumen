import os

import numpy as np
import psycopg
import pytest

from app.retrieval import store
from tests.conftest import add_document, ensure_tenant


def vec(i):
    v = np.zeros(384, dtype=np.float32)
    v[i] = 1.0  # unit vector along axis i
    return v


def add(tenant, filename, contents, axes):
    doc = add_document(tenant, filename)
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


def test_hybrid_search_finds_an_exact_code_missed_by_vectors():
    add("t", "f.txt", ["Career events", "Opportunity INT-027 closes September 3"], [0, 1])
    hits = store.search("t", vec(0), k=1, query_text="INT-027 deadline")
    assert hits[0][2] == "Opportunity INT-027 closes September 3"
    assert hits[0][3] == pytest.approx(0.0)  # score still means cosine similarity


def test_hybrid_search_keeps_semantic_matches_without_keyword_overlap():
    add("t", "f.txt", ["We accept returns", "Unrelated delivery details"], [0, 1])
    hits = store.search("t", vec(0), k=1, query_text="refund policy")
    assert hits[0][2] == "We accept returns"


def test_hybrid_search_never_uses_another_tenants_keyword_match():
    add("tenant_a", "a.txt", ["My own text"], [0])
    add("tenant_b", "b.txt", ["INT-027 private deadline"], [0])
    hits = store.search("tenant_a", vec(0), k=5, query_text="INT-027 deadline")
    assert [h[2] for h in hits] == ["My own text"]


def test_bm25_uses_term_frequency_length_and_tenant_local_document_frequency():
    import math

    add("tenant_a", "a.txt", ["alpha alpha beta", "beta gamma", "the"], [0, 1, 2])
    hits = store.keyword_search("tenant_a", vec(0), "alpha", 10)
    # Gold BM25 score: N=3, df=1, tf=2, length=3, average length=5/3.
    expected = math.log(1 + 2.5 / 1.5) * (2 * 2.2) / (2 + 1.2 * (0.25 + 0.75 * 3 / (5 / 3)))
    assert len(hits) == 1 and hits[0][2] == "alpha alpha beta"
    assert hits[0][4] == pytest.approx(expected)
    add("tenant_b", "b.txt", ["alpha " * 1000], [0])
    assert store.keyword_search("tenant_a", vec(0), "alpha", 10) == hits


@pytest.mark.parametrize("query", ["?!", "the and of", "nonexistentword"])
def test_bm25_returns_no_keyword_candidates_without_matching_terms(query):
    add("t", "f.txt", ["INT-027 closes tomorrow"], [0])
    assert store.keyword_search("t", vec(0), query, 10) == []


@pytest.mark.parametrize("query", ["?!", "the and of", "INT-027'); DROP TABLE chunks; --"])
def test_hybrid_search_handles_empty_terms_and_query_punctuation(query):
    add("t", "f.txt", ["INT-027 details"], [0])
    hits = store.search("t", vec(0), k=3, query_text=query)
    assert [h[2] for h in hits] == ["INT-027 details"]


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
    doc = add_document("tenant_a", "a.txt")
    ensure_tenant(
        "tenant_b"
    )  # so the rejection is the document's tenant, not a missing tenants row
    with pytest.raises(
        store.DocumentMissing
    ):  # tenant_b has no such document; the FK is the backstop
        store.add_chunks("tenant_b", doc, ["x"], np.array([vec(0)]))


def test_filenames_returns_only_the_callers_tenant():
    mine, theirs = add_document("tenant_a", "mine.txt"), add_document("tenant_b", "theirs.txt")
    assert store.filenames("tenant_a", [mine, theirs]) == {mine: "mine.txt"}


def test_add_chunks_does_not_need_a_chunk_count_column():
    # the count lives in the document_stats view now; add_chunks only writes chunks
    doc = add_document("t", "f.txt")
    store.add_chunks("t", doc, ["x", "y"], np.array([vec(0), vec(1)]))
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        rows = conn.execute(
            "SELECT chunk_count FROM document_stats WHERE tenant_id = %s AND document_id = %s",
            ("t", doc),
        ).fetchall()
    assert rows == [(2,)]


def test_deleting_a_tenant_removes_its_documents_and_chunks_only():
    gone = add("tenant_a", "a.txt", ["x", "y"], [0, 1])
    kept = add("tenant_b", "b.txt", ["z"], [0])
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.execute("DELETE FROM tenants WHERE id = %s", ("tenant_a",))
    assert count_chunks("tenant_a", gone) == 0 and store.filenames("tenant_a", [gone]) == {}
    assert count_chunks("tenant_b", kept) == 1


def test_a_document_for_a_tenant_without_a_tenants_row_is_rejected():
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        store.add_document("no_such_tenant", "f.txt")


def count_chunks(tenant, doc):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        return conn.execute(
            "SELECT count(*) FROM chunks WHERE tenant_id = %s AND document_id = %s", (tenant, doc)
        ).fetchone()[0]


def test_add_chunks_for_an_existing_document_is_all_or_nothing():
    # ingest relies on this: Express creates the documents row, Python writes the chunks
    doc = add_document("t", "f.txt")
    good, bad = vec(0), np.zeros(10, dtype=np.float32)  # wrong dimension fails on the second row
    with pytest.raises(psycopg.Error):
        store.add_chunks("t", doc, ["one", "two"], [good, bad])
    assert count_chunks("t", doc) == 0


def test_add_chunks_for_a_missing_document_writes_nothing():
    missing = "00000000-0000-0000-0000-000000000000"
    ensure_tenant("t")
    with pytest.raises(store.DocumentMissing):
        store.add_chunks("t", missing, ["x"], np.array([vec(0)]))
    assert count_chunks("t", missing) == 0
