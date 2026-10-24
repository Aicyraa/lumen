import numpy as np

from app.retrieval import store
from tests.conftest import AUTH


def add_doc(tenant, texts):
    doc = store.add_document(tenant, "d.txt")
    axis = np.zeros(384, dtype=np.float32)
    axis[0] = 1.0
    store.add_chunks(tenant, doc, texts, np.array([axis] * len(texts)))
    return doc


def delete(client, doc_id, tenant):
    return client.delete(
        f"/internal/documents/{doc_id}", params={"tenant_id": tenant}, headers=AUTH
    )


def remaining(tenant):
    axis = np.zeros(384, dtype=np.float32)
    axis[0] = 1.0
    return store.search(tenant, axis, 50)


def test_delete_removes_the_documents_chunks_and_reports_the_count(client):
    doc = add_doc("tenant_a", ["one", "two", "three"])
    other = add_doc("tenant_a", ["keep me"])
    resp = delete(client, doc, "tenant_a")
    assert resp.status_code == 200 and resp.json() == {"deleted_chunks": 3}
    assert [h[1] for h in remaining("tenant_a")] == [other]


def test_delete_with_another_tenants_id_deletes_nothing(client):
    doc = add_doc("tenant_a", ["one", "two"])
    resp = delete(client, doc, "tenant_b")
    assert resp.status_code == 200 and resp.json() == {"deleted_chunks": 0}
    assert len(remaining("tenant_a")) == 2


def test_delete_requires_tenant_id(client):
    resp = client.delete("/internal/documents/00000000-0000-0000-0000-000000000001", headers=AUTH)
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"


def test_delete_document_id_must_be_a_uuid(client):
    resp = delete(client, "not-a-uuid", "tenant_a")
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"
