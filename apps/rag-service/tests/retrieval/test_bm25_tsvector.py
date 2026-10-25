"""Migration 011 (stored tsvector + GIN) and the BM25 query that uses it."""

import numpy as np
import pytest

from app.core.config import load_config
from app.retrieval import db, store
from tests.conftest import SQL_DIR, add_document
from tests.retrieval.test_store import vec

# The BM25 query as it was before 011 (recomputes to_tsvector over the tenant's chunks on every call).
OLD_BM25_SQL = """
WITH corpus AS MATERIALIZED (
    SELECT id, document_id, content, embedding, to_tsvector('english', content) AS terms
    FROM chunks WHERE tenant_id = %(tenant)s
), terms AS MATERIALIZED (
    SELECT c.id, t.lexeme, cardinality(t.positions)::double precision AS tf
    FROM corpus c CROSS JOIN LATERAL unnest(c.terms) t
), lengths AS (
    SELECT c.id, coalesce(sum(t.tf), 0)::double precision AS length
    FROM corpus c LEFT JOIN terms t ON t.id = c.id GROUP BY c.id
), stats AS (
    SELECT count(*)::double precision AS n, avg(length) AS avg_length FROM lengths
), frequencies AS (
    SELECT lexeme, count(*)::double precision AS n FROM terms
    WHERE lexeme = ANY(tsvector_to_array(to_tsvector('english', %(query)s)))
    GROUP BY lexeme
), ranked AS (
    SELECT t.id, sum(
        ln(1 + (s.n - f.n + 0.5) / (f.n + 0.5)) *
        (t.tf * (%(k1)s + 1)) /
        (t.tf + %(k1)s * (1 - %(b)s + %(b)s * l.length / nullif(s.avg_length, 0)))
    ) AS bm25
    FROM terms t JOIN frequencies f ON f.lexeme = t.lexeme
    JOIN lengths l ON l.id = t.id CROSS JOIN stats s GROUP BY t.id
)
SELECT c.id, r.bm25 FROM ranked r JOIN corpus c ON c.id = r.id ORDER BY r.bm25 DESC, c.id LIMIT %(k)s
"""

CORPUS = [
    "The library opens at nine and closes at five on weekdays.",
    "Library cards are free for students; replacement cards cost a small fee.",
    "Opportunity INT-027 closes September 3. Apply early; early applications are favoured.",
    "Housing applications open in March. Housing is not guaranteed by admission.",
    "Parking permits are sold at the front desk. Permits expire each August.",
    "!!! ???",  # no lexemes at all: still counts in N and the average length
    "Students running late should run to the registrar; running is not required.",
    "apply apply apply apply applications applied",
]


def old_ranking(tenant, query, k):
    cfg = load_config()["retrieval"]
    with db.connection() as conn:
        return conn.execute(
            OLD_BM25_SQL,
            {"tenant": tenant, "query": query, "k": k, "k1": cfg["bm25_k1"], "b": cfg["bm25_b"]},
        ).fetchall()


def load_corpus(tenant="t"):
    doc = add_document(tenant, "f.txt")
    store.add_chunks(tenant, doc, CORPUS, np.array([vec(i) for i in range(len(CORPUS))]))


def test_chunks_have_a_generated_tsvector_with_a_gin_index():
    with db.connection() as conn:
        gen = conn.execute(
            "SELECT is_generated FROM information_schema.columns"
            " WHERE table_name = 'chunks' AND column_name = 'tsv'"
        ).fetchone()
        idx = conn.execute(
            "SELECT indexdef FROM pg_indexes WHERE tablename = 'chunks' AND indexdef ILIKE '%gin%'"
        ).fetchall()
    assert gen == ("ALWAYS",) and any("tsv" in r[0] for r in idx)


def test_migration_011_is_safe_to_run_twice():
    with db.connection() as conn:
        sql = (SQL_DIR / "011_chunks_tsvector.sql").read_text()
        conn.execute(sql)
        conn.execute(sql)


@pytest.mark.parametrize(
    "query",
    [
        "library",
        "INT-027 deadline",
        "apply applications",
        "running late",
        "housing permits desk",
        "zzz",
    ],
)
def test_new_bm25_matches_the_old_ranking_and_scores(query):
    load_corpus()
    new = store.keyword_search("t", vec(0), query, 10)
    old = old_ranking("t", query, 10)
    assert [h[0] for h in new] == [r[0] for r in old]
    assert [h[4] for h in new] == pytest.approx([r[1] for r in old])


def test_new_bm25_scores_stay_tenant_local():
    load_corpus("tenant_a")
    before = store.keyword_search("tenant_a", vec(0), "library", 10)
    load_corpus("tenant_b")
    assert store.keyword_search("tenant_a", vec(0), "library", 10) == before
    assert {h[0] for h in before}.isdisjoint(
        {h[0] for h in store.keyword_search("tenant_b", vec(0), "library", 10)}
    )


def test_content_is_read_after_ranking_not_carried_through_the_cte():
    import inspect

    src = inspect.getsource(store.keyword_search)
    assert "to_tsvector('english', content)" not in src and ".tsv" in src
