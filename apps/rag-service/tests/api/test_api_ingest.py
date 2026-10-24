import os

import psycopg

from app.retrieval import store
from tests.conftest import AUTH

LONG_TEXT = " ".join(f"word{i}" for i in range(300))  # 300 words -> several chunks (120 words, 30 overlap)


def post(client, tenant, doc_id, name="notes.txt", content=LONG_TEXT.encode()):
    return client.post(
        "/internal/ingest",
        headers=AUTH,
        data={"tenant_id": tenant, "document_id": doc_id},
        files={"file": (name, content, "application/octet-stream")},
    )


def db_rows(sql, *params):
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        return conn.execute(sql, params).fetchall()


def chunk_count(tenant, doc_id):
    return db_rows("SELECT count(*) FROM chunks WHERE tenant_id = %s AND document_id = %s", tenant, doc_id)[0][0]


def test_ingest_writes_chunks_for_the_given_document(client):
    doc_id = store.add_document("tenant_a", "notes.txt")  # Express creates this row before calling Python
    resp = post(client, "tenant_a", doc_id)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"chunk_count"} and body["chunk_count"] >= 2
    assert chunk_count("tenant_a", doc_id) == body["chunk_count"]
    stored = db_rows("SELECT chunk_count FROM documents WHERE tenant_id = %s AND id = %s", "tenant_a", doc_id)
    assert stored == [(body["chunk_count"],)]


def test_empty_file_is_422_no_text_extracted_and_writes_nothing(client):
    doc_id = store.add_document("tenant_a", "empty.txt")
    resp = post(client, "tenant_a", doc_id, "empty.txt", b"   \n  ")
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "no_text_extracted"
    assert chunk_count("tenant_a", doc_id) == 0


def test_unreadable_pdf_is_422_no_text_extracted(client):
    doc_id = store.add_document("tenant_a", "bad.pdf")
    resp = post(client, "tenant_a", doc_id, "bad.pdf", b"this is not a pdf")
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "no_text_extracted"


def test_unsupported_file_type_is_415(client):
    doc_id = store.add_document("tenant_a", "x.exe")
    resp = post(client, "tenant_a", doc_id, "x.exe", b"MZ")
    assert resp.status_code == 415 and resp.json()["error"]["code"] == "unsupported_type"


def test_unknown_document_is_404_and_writes_nothing(client):
    missing = "00000000-0000-0000-0000-000000000009"
    resp = post(client, "tenant_a", missing)
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"
    assert db_rows("SELECT count(*) FROM chunks")[0][0] == 0


def test_another_tenants_document_looks_like_a_missing_one(client):
    doc_id = store.add_document("tenant_a", "a.txt")
    resp = post(client, "tenant_b", doc_id)  # tenant_b names tenant_a's document
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"
    assert chunk_count("tenant_a", doc_id) == 0 and chunk_count("tenant_b", doc_id) == 0


def test_document_id_must_be_a_uuid(client):
    resp = post(client, "tenant_a", "not-a-uuid")
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"


def test_nul_byte_in_text_is_422_no_text_extracted_and_writes_nothing(client):
    doc_id = store.add_document("tenant_a", "nul.txt")
    resp = post(client, "tenant_a", doc_id, "nul.txt", b"hello\x00world " * 20)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "no_text_extracted"  # Postgres text cannot hold NUL
    assert chunk_count("tenant_a", doc_id) == 0


def test_ingesting_the_same_document_twice_keeps_chunk_count(client):
    doc_id = store.add_document("tenant_a", "notes.txt")
    first = post(client, "tenant_a", doc_id).json()["chunk_count"]
    second = post(client, "tenant_a", doc_id).json()["chunk_count"]
    assert second == first
    assert chunk_count("tenant_a", doc_id) == first
    stored = db_rows("SELECT chunk_count FROM documents WHERE tenant_id = %s AND id = %s", "tenant_a", doc_id)
    assert stored == [(first,)]


def test_reingest_does_not_touch_other_documents_chunks(client):
    keep = store.add_document("tenant_a", "keep.txt")
    other = store.add_document("tenant_a", "other.txt")
    post(client, "tenant_a", keep)
    kept = chunk_count("tenant_a", keep)
    post(client, "tenant_a", other)
    post(client, "tenant_a", other)
    assert chunk_count("tenant_a", keep) == kept
