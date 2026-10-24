import os

import numpy as np
import psycopg
from pgvector.psycopg import register_vector


def _connect() -> psycopg.Connection:
    # DATABASE_URL is read on each call so tests can point it at the test database
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    register_vector(conn)
    return conn


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
        conn.execute(
            "UPDATE documents SET chunk_count = (SELECT count(*) FROM chunks WHERE tenant_id = %s AND document_id = %s)"
            " WHERE tenant_id = %s AND id = %s",
            (tenant_id, document_id, tenant_id, document_id),
        )


def search(tenant_id: str, query_vector: np.ndarray, k: int) -> list[tuple[int, str, str, float]]:
    """Top-k chunks of this tenant as (chunk_id, document_id, content, score); score is cosine similarity."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, document_id, content, 1 - (embedding <=> %s) AS score FROM chunks"
            " WHERE tenant_id = %s ORDER BY embedding <=> %s LIMIT %s",
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
