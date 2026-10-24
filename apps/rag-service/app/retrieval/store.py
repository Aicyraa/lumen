import os
import re

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


def search(
    tenant_id: str, query_vector: np.ndarray, k: int, *, query_text: str = ""
) -> list[tuple[int, str, str, float]]:
    """Top-k tenant chunks; optional keyword/vector rank fusion, with cosine scores preserved."""
    terms = " OR ".join(re.findall(r"\w+(?:-\w+)*", query_text))
    with _connect() as conn:
        if terms:
            cfg = load_config()["retrieval"]
            # Rank fusion combines word matches and meaning without treating unlike scores as comparable.
            rows = conn.execute(
                """
                WITH semantic AS (
                    SELECT id, row_number() OVER (ORDER BY embedding <=> %(vector)s, id) AS rank
                    FROM chunks WHERE tenant_id = %(tenant)s
                    ORDER BY embedding <=> %(vector)s, id LIMIT %(candidates)s
                ), lexical AS (
                    SELECT id, row_number() OVER (
                        ORDER BY ts_rank(to_tsvector('english', content),
                            websearch_to_tsquery('english', %(terms)s)) DESC, id
                    ) AS rank
                    FROM chunks WHERE tenant_id = %(tenant)s
                        AND to_tsvector('english', content) @@ websearch_to_tsquery('english', %(terms)s)
                    ORDER BY rank LIMIT %(candidates)s
                ), fused AS (
                    SELECT coalesce(s.id, l.id) AS id,
                        coalesce(1.0 / (%(constant)s + s.rank), 0) +
                        coalesce(1.0 / (%(constant)s + l.rank), 0) AS rank
                    FROM semantic s FULL JOIN lexical l ON l.id = s.id
                )
                SELECT c.id, c.document_id, c.content, 1 - (c.embedding <=> %(vector)s) AS score
                FROM fused f JOIN chunks c ON c.id = f.id
                WHERE c.tenant_id = %(tenant)s
                ORDER BY f.rank DESC, c.embedding <=> %(vector)s, c.id LIMIT %(k)s
                """,
                {
                    "vector": query_vector,
                    "tenant": tenant_id,
                    "terms": terms,
                    "candidates": max(k, cfg["candidate_limit"]),
                    "constant": cfg["rrf_rank_constant"],
                    "k": k,
                },
            ).fetchall()
        else:
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
