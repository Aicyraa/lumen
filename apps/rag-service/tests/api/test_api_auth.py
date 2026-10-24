import inspect

import pytest
from fastapi.testclient import TestClient

from app import main
from app.api import routes
from tests.conftest import AUTH, FAKE_ENV

DOC_ID = "00000000-0000-0000-0000-000000000001"
# (method, path, kwargs that make an otherwise valid request)
PROTECTED = [
    (
        "post",
        "/internal/ingest",
        {
            "data": {"tenant_id": "t", "document_id": DOC_ID},
            "files": {"file": ("a.txt", b"hello", "text/plain")},
        },
    ),
    ("post", "/internal/query", {"json": {"tenant_id": "t", "query": "hi"}}),
    ("delete", f"/internal/documents/{DOC_ID}?tenant_id=t", {}),
]


def assert_error(resp, status, code):
    assert resp.status_code == status
    body = resp.json()
    assert set(body) == {"error"} and body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


@pytest.mark.parametrize("method,path,kwargs", PROTECTED)
def test_missing_secret_is_401(client, method, path, kwargs):
    assert_error(getattr(client, method)(path, **kwargs), 401, "unauthorized")


@pytest.mark.parametrize("method,path,kwargs", PROTECTED)
def test_wrong_secret_is_401(client, method, path, kwargs):
    resp = getattr(client, method)(path, headers={"X-Internal-Secret": "nope"}, **kwargs)
    assert_error(resp, 401, "unauthorized")


@pytest.mark.parametrize("method,path,kwargs", PROTECTED)
def test_auth_is_checked_before_the_request_body(client, method, path, kwargs):
    # an unauthenticated caller with a malformed body still gets 401, not a 422 hint about the shape
    assert_error(getattr(client, method)(path.split("?")[0]), 401, "unauthorized")


def test_non_ascii_secret_is_401_not_a_crash(client):
    resp = client.post(
        "/internal/query",
        json={"tenant_id": "t", "query": "hi"},
        headers={"X-Internal-Secret": "café".encode("utf-8")},
    )  # raw non-ASCII bytes
    assert_error(resp, 401, "unauthorized")


def test_health_needs_no_secret(client):
    resp = client.get("/internal/health")
    assert resp.status_code == 200 and resp.json() == {"status": "ok"}


def test_unknown_route_uses_the_error_shape(client):
    assert_error(client.get("/nope", headers=AUTH), 404, "not_found")


def test_invalid_body_uses_the_error_shape(client):
    assert_error(
        client.post("/internal/query", json={"tenant_id": "t"}, headers=AUTH),
        422,
        "invalid_request",
    )


@pytest.mark.parametrize("missing", ["INTERNAL_SECRET", "DATABASE_URL"])
def test_service_refuses_to_start_without_required_env(monkeypatch, missing):
    monkeypatch.delenv(missing)
    with pytest.raises(RuntimeError) as exc:
        with TestClient(main.app):
            pass
    assert missing in str(exc.value)
    assert not any(v in str(exc.value) for v in FAKE_ENV.values())  # names only, never values


@pytest.mark.parametrize(
    "missing", ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL_CHEAP", "LLM_MODEL_EXPENSIVE"]
)
def test_llm_env_is_optional_at_startup(monkeypatch, missing):
    monkeypatch.delenv(missing)  # only a dev/test default now
    with TestClient(main.app) as c:
        assert c.get("/internal/health").status_code == 200


@pytest.mark.parametrize("name", ["ingest", "query", "delete_document"])
def test_endpoints_that_embed_or_use_the_database_are_plain_def(name):
    # async def would run the blocking embed on the event loop and stall /internal/health
    assert not inspect.iscoroutinefunction(getattr(routes, name))
