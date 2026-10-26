import pytest

from app.core.config import load_config
from app.retrieval import db, reranker
from tests.conftest import AUTH


def test_ready_without_the_secret_is_401(client):
    resp = client.get("/internal/ready")
    assert resp.status_code == 401 and resp.json()["error"]["code"] == "unauthorized"


def test_ready_reports_each_check(client):
    resp = client.get("/internal/ready", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == {
        "status": "ready",
        "checks": {"database": True, "reranker": True},
    }


def test_ready_is_503_when_the_database_pool_cannot_answer(client, monkeypatch):
    def broken(*a, **k):
        raise RuntimeError("database down; password must not leak")

    monkeypatch.setattr(db, "connection", broken)
    resp = client.get("/internal/ready", headers=AUTH)
    assert resp.status_code == 503
    assert resp.json()["status"] == "not_ready" and resp.json()["checks"]["database"] is False
    assert "password" not in resp.text


def test_ready_is_503_when_the_reranker_is_enabled_but_not_loaded(client, monkeypatch):
    monkeypatch.setattr(reranker, "is_loaded", lambda: False)
    resp = client.get("/internal/ready", headers=AUTH)
    assert resp.status_code == 503 and resp.json()["checks"]["reranker"] is False


def test_ready_ignores_the_reranker_when_it_is_disabled(client, monkeypatch):
    monkeypatch.setitem(load_config()["reranker"], "enabled", False)
    monkeypatch.setattr(reranker, "is_loaded", lambda: False)
    assert client.get("/internal/ready", headers=AUTH).status_code == 200


def test_health_stays_cheap_and_never_touches_the_database(client, monkeypatch):
    def forbidden(*a, **k):
        raise AssertionError("health must not use the database")

    monkeypatch.setattr(db, "connection", forbidden)
    assert client.get("/internal/health").json() == {"status": "ok"}


def test_the_reranker_is_loaded_at_startup_not_on_the_first_query(monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    loaded = []
    monkeypatch.setattr(reranker, "_model", lambda: loaded.append(1) or object())
    with TestClient(main.app):
        assert loaded == [1]


def test_a_failed_startup_load_does_not_stop_the_service(monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    def missing():
        raise OSError("weights missing")

    monkeypatch.setattr(reranker, "_model", missing)
    with TestClient(main.app) as c:
        assert c.get("/internal/health").status_code == 200


@pytest.mark.parametrize("exc", [RuntimeError, OSError, ValueError])
def test_rerank_fallback_logs_a_warning_with_the_exception_class(monkeypatch, caplog, exc):
    class Model:
        def predict(self, pairs, **kwargs):
            raise exc("private passage text")

    monkeypatch.setattr(reranker, "_model", lambda: Model())
    hits = [(1, "d", "private passage text", 0.5)]
    with caplog.at_level("WARNING", logger="lumen.rag"):
        assert reranker.rerank("q", hits, 1) == hits
    assert exc.__name__ in caplog.text and "private passage text" not in caplog.text
