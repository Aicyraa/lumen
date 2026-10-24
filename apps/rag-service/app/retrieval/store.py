import os

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

from app.core.config import load_config


def _connect() -> psycopg.Connection:
    # DATABASE_URL is read on each call so tests can point it at the test database
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    register_vector(conn)
    return conn


def ensure_tenant(tenant_id: str) -> None:
    """Create the tenants row if missing. Only the local CLI calls this; in production the API inserts it first."""
    with _connect() as conn:
        conn.execute("INSERT INTO tenants (id) VALUES (%s) ON CONFLICT DO NOTHING", (tenant_id,))


def add_document(tenant_id: str, filename: str) -> str:
    with _connect() as conn:  # the with-block commits on success
        row = conn.execute(
            "INSERT INTO documents (tenant_id, filename) VALUES (%s, %s) RETURNING id",
            (tenant_id, filename),
        ).fetchone()
    return str(row[0])


def add_chunks(tenant_id: str, document_id: str, chunks: list[str], vectors: np.ndarray) -> None:
    # one transaction: a failure leaves no chunks. The composite FK rejects a document of another tenant.
    with _connect() as conn:
        # re-ingesting the same document replaces its chunks instead of appending duplicates
        conn.execute(
            "DELETE FROM chunks WHERE tenant_id = %s AND document_id = %s", (tenant_id, document_id)
        )
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES (%s, %s, %s, %s)",
                [(tenant_id, document_id, text, vec) for text, vec in zip(chunks, vectors)],
            )


def keyword_search(
    tenant_id: str, query_vector: np.ndarray, query_text: str, k: int
) -> list[tuple[int, str, str, float, float]]:
    """Tenant-local BM25 hits, with cosine and BM25 scores kept separate."""
    cfg = load_config()["retrieval"]
    with _connect() as conn:
        # shortcut: BM25 scans this tenant's chunks, persist postings when measured latency grows.
        rows = conn.execute(
            """
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
            SELECT c.id, c.document_id, c.content, 1 - (c.embedding <=> %(vector)s), r.bm25
            FROM ranked r JOIN corpus c ON c.id = r.id ORDER BY r.bm25 DESC, c.id LIMIT %(k)s
            """,
            {
                "tenant": tenant_id,
                "query": query_text,
                "vector": query_vector,
                "k": k,
                "k1": cfg["bm25_k1"],
                "b": cfg["bm25_b"],
            },
        ).fetchall()
    return [(r[0], str(r[1]), r[2], float(r[3]), float(r[4])) for r in rows]


def search(
    tenant_id: str, query_vector: np.ndarray, k: int, *, query_text: str = ""
) -> list[tuple[int, str, str, float]]:
    """Top-k tenant chunks; BM25/vector rank fusion preserves exposed cosine scores."""
    if query_text.strip():
        cfg = load_config()["retrieval"]
        limit = max(k, cfg["candidate_limit"])
        dense = search(tenant_id, query_vector, limit)
        sparse = keyword_search(tenant_id, query_vector, query_text, limit)
        hits, ranks = {}, {}
        for ranking in (dense, sparse):
            for rank, hit in enumerate(ranking, 1):
                hits[hit[0]] = hit[:4]
                ranks[hit[0]] = ranks.get(hit[0], 0) + 1 / (cfg["rrf_rank_constant"] + rank)
        return sorted(hits.values(), key=lambda h: (-ranks[h[0]], -h[3], h[0]))[:k]
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, document_id, content, 1 - (embedding <=> %s) AS score FROM chunks"
            " WHERE tenant_id = %s ORDER BY embedding <=> %s, id LIMIT %s",
            (query_vector, tenant_id, query_vector, k),
        ).fetchall()
    return [(r[0], str(r[1]), r[2], float(r[3])) for r in rows]


def delete_document(tenant_id: str, document_id: str) -> int:
    """Delete a document (its chunks go via ON DELETE CASCADE). Returns how many chunks were removed."""
    with _connect() as conn:
        count = conn.execute(
            "SELECT count(*) FROM chunks WHERE tenant_id = %s AND document_id = %s",
            (tenant_id, document_id),
        ).fetchone()[0]
        conn.execute(
            "DELETE FROM documents WHERE tenant_id = %s AND id = %s", (tenant_id, document_id)
        )
    return count


def filenames(tenant_id: str, document_ids: list[str]) -> dict[str, str]:
    """Filenames of this tenant's documents, {document_id: filename}; other tenants' ids are simply absent."""
    if not document_ids:
        return {}
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, filename FROM documents WHERE tenant_id = %s AND id = ANY(%s::uuid[])",
            (tenant_id, document_ids),
        ).fetchall()
    return {str(r[0]): r[1] for r in rows}
