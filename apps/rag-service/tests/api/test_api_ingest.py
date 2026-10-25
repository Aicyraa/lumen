import os

import psycopg

from tests.conftest import AUTH, add_document

LONG_TEXT = " ".join(
    f"word{i}" for i in range(300)
)  # 300 words -> several chunks (120 words, 30 overlap)


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
    return db_rows(
        "SELECT count(*) FROM chunks WHERE tenant_id = %s AND document_id = %s", tenant, doc_id
    )[0][0]


def test_ingest_writes_chunks_for_the_given_document(client):
    doc_id = add_document("tenant_a", "notes.txt")  # Express creates this row before calling Python
    resp = post(client, "tenant_a", doc_id)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"chunk_count"} and body["chunk_count"] >= 2
    assert chunk_count("tenant_a", doc_id) == body["chunk_count"]
    stored = db_rows(
        "SELECT chunk_count FROM document_stats WHERE tenant_id = %s AND document_id = %s",
        "tenant_a",
        doc_id,
    )
    assert stored == [(body["chunk_count"],)]


def test_empty_file_is_422_no_text_extracted_and_writes_nothing(client):
    doc_id = add_document("tenant_a", "empty.txt")
    resp = post(client, "tenant_a", doc_id, "empty.txt", b"   \n  ")
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "no_text_extracted"
    assert chunk_count("tenant_a", doc_id) == 0


def test_unreadable_pdf_is_422_unreadable_document(client):
    doc_id = add_document("tenant_a", "bad.pdf")
    resp = post(client, "tenant_a", doc_id, "bad.pdf", b"this is not a pdf")
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "unreadable_document"


def test_encrypted_pdf_is_422_unreadable_document(client, tmp_path):
    from tests.ingest.test_extract import blank_pdf

    doc_id = add_document("tenant_a", "locked.pdf")
    data = blank_pdf(tmp_path, 1, password="secret").read_bytes()
    resp = post(client, "tenant_a", doc_id, "locked.pdf", data)
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "unreadable_document"


def test_pdf_over_max_pages_is_422_document_too_large(client, tmp_path, monkeypatch):
    from app.core.config import load_config
    from tests.ingest.test_extract import blank_pdf

    monkeypatch.setitem(load_config()["ingest"], "max_pages", 1)
    doc_id = add_document("tenant_a", "big.pdf")
    resp = post(client, "tenant_a", doc_id, "big.pdf", blank_pdf(tmp_path, 2).read_bytes())
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "document_too_large"


def test_too_many_chunks_is_422_document_too_large_before_embedding(client, monkeypatch):
    from app.core.config import load_config

    def no_embed(texts):
        raise AssertionError("must not embed an oversized document")

    monkeypatch.setitem(load_config()["ingest"], "max_chunks", 2)
    monkeypatch.setattr("app.api.routes.embed", no_embed)
    doc_id = add_document("tenant_a", "big.txt")
    resp = post(client, "tenant_a", doc_id)  # LONG_TEXT makes 3+ chunks
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "document_too_large"
    assert chunk_count("tenant_a", doc_id) == 0


def test_unsupported_file_type_is_415(client):
    doc_id = add_document("tenant_a", "x.exe")
    resp = post(client, "tenant_a", doc_id, "x.exe", b"MZ")
    assert resp.status_code == 415 and resp.json()["error"]["code"] == "unsupported_type"


def test_unknown_document_is_404_and_writes_nothing(client):
    missing = "00000000-0000-0000-0000-000000000009"
    resp = post(client, "tenant_a", missing)
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"
    assert db_rows("SELECT count(*) FROM chunks")[0][0] == 0


def test_tenant_without_a_tenants_row_is_404_and_writes_nothing(client):
    resp = post(client, "no_such_tenant", "00000000-0000-0000-0000-000000000009")
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"
    assert db_rows("SELECT count(*) FROM documents")[0][0] == 0
    assert db_rows("SELECT count(*) FROM chunks")[0][0] == 0


def test_another_tenants_document_looks_like_a_missing_one(client):
    doc_id = add_document("tenant_a", "a.txt")
    resp = post(client, "tenant_b", doc_id)  # tenant_b names tenant_a's document
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"
    assert chunk_count("tenant_a", doc_id) == 0 and chunk_count("tenant_b", doc_id) == 0


def test_document_id_must_be_a_uuid(client):
    resp = post(client, "tenant_a", "not-a-uuid")
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"


def test_nul_byte_in_text_is_422_no_text_extracted_and_writes_nothing(client):
    doc_id = add_document("tenant_a", "nul.txt")
    resp = post(client, "tenant_a", doc_id, "nul.txt", b"hello\x00world " * 20)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "no_text_extracted"  # Postgres text cannot hold NUL
    assert chunk_count("tenant_a", doc_id) == 0


def test_ingesting_the_same_document_twice_keeps_chunk_count(client):
    doc_id = add_document("tenant_a", "notes.txt")
    first = post(client, "tenant_a", doc_id).json()["chunk_count"]
    second = post(client, "tenant_a", doc_id).json()["chunk_count"]
    assert second == first
    assert chunk_count("tenant_a", doc_id) == first
    stored = db_rows(
        "SELECT chunk_count FROM document_stats WHERE tenant_id = %s AND document_id = %s",
        "tenant_a",
        doc_id,
    )
    assert stored == [(first,)]


def test_reingest_does_not_touch_other_documents_chunks(client):
    keep = add_document("tenant_a", "keep.txt")
    other = add_document("tenant_a", "other.txt")
    post(client, "tenant_a", keep)
    kept = chunk_count("tenant_a", keep)
    post(client, "tenant_a", other)
    post(client, "tenant_a", other)
    assert chunk_count("tenant_a", keep) == kept
