import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest

from app.core.env import load_env

SQL_DIR = Path(__file__).resolve().parents[3] / "infra" / "sql"


def _test_url() -> str:
    load_env()
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:  # derive from the dev URL by swapping the database name
        p = urlparse(os.environ["DATABASE_URL"])
        url = urlunparse(p._replace(path="/lumen_test"))
    assert urlparse(url).path.endswith("_test"), "refusing to run tests on a non-test database"
    return url


@pytest.fixture(scope="session", autouse=True)
def test_db():
    url = _test_url()
    os.environ["DATABASE_URL"] = url  # app code reads DATABASE_URL, so it now points at the test DB
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        # every numbered migration in order, the same rule as apps/api/test/global-setup.ts (001 runs once, on a fresh schema)
        for f in sorted(SQL_DIR.glob("[0-9]*_*.sql")):
            conn.execute(f.read_text())
    return url


def ensure_tenant(*tenant_ids: str) -> None:
    """Insert the tenants rows the foreign keys need (in production the API creates them first)."""
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        for t in tenant_ids:
            conn.execute("INSERT INTO tenants (id) VALUES (%s) ON CONFLICT DO NOTHING", (t,))


def add_document(tenant_id: str, filename: str) -> str:
    """store.add_document for a tenant that may not have a tenants row yet."""
    from app.retrieval import store

    ensure_tenant(tenant_id)
    return store.add_document(tenant_id, filename)


@pytest.fixture(autouse=True)
def clean(test_db):
    with psycopg.connect(test_db, autocommit=True) as conn:
        conn.execute("TRUNCATE tenants RESTART IDENTITY CASCADE")  # cascades to every tenant table


# ---- fixtures for the FastAPI service: fake secrets and a fake LLM, never real values or calls ----
SECRET = "test-secret"
AUTH = {"X-Internal-Secret": SECRET}
FAKE_ENV = {
    "INTERNAL_SECRET": SECRET,
    "LLM_BASE_URL": "http://127.0.0.1:9/v1",  # nothing listens here; the real client is replaced anyway
    "LLM_API_KEY": "test-key-not-real",
    "LLM_MODEL_CHEAP": "cheap-model",
    "LLM_MODEL_EXPENSIVE": "expensive-model",
}


@pytest.fixture(autouse=True)
def fake_env(monkeypatch):
    for key, value in FAKE_ENV.items():
        monkeypatch.setenv(key, value)


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """Hostnames resolve to a public address, so no test touches real DNS (the guard's own tests inject resolvers)."""
    monkeypatch.setattr("app.llm.endpoint_guard._resolve", lambda host: ["93.184.216.34"])


@pytest.fixture(autouse=True)
def fake_reranker(monkeypatch):
    # API tests use deterministic ordering; the reranker's own tests inject model scores.
    monkeypatch.setattr("app.api.routes.rerank", lambda query, hits, k: hits[:k])


class FakeCaller:
    """Stands in for llm.call_model. Records every call; `outcomes` maps a model_id to how that model behaves
    (default ok). Answering models report 100 tokens in and 10 out unless `tokens` says otherwise."""

    def __init__(self):
        self.calls = []
        self.outcomes = {}
        self.tokens = {}
        self.extra = {}  # model_id -> fields to set on its attempt (rate_limits, reported_cost_usd)

    def __call__(self, m, tier, system, user):
        from app.llm.client import Attempt

        self.calls.append(
            {"tier": tier, "model_id": m["model_id"], "model": m, "system": system, "user": user}
        )
        outcome = self.outcomes.get(m["model_id"], "ok")
        a = Attempt(
            m["provider"],
            m["model_id"],
            m.get("tenant_model_id"),
            tier,
            outcome=outcome,
            latency_ms=5,
        )
        if outcome == "ok":
            first = re.search(r"\[1\] (.*?)(?=\n\[\d+\] |\n\nQuestion:)", user, re.S)
            a.text = json.dumps(
                {
                    "claims": [
                        {
                            "text": "Fake answer",
                            "evidence": [{"passage": 1, "quote": first.group(1)}],
                        }
                    ]
                }
            )
            a.tokens_in, a.tokens_out = self.tokens.get(m["model_id"], (100, 10))
        for k, v in self.extra.get(m["model_id"], {}).items():
            setattr(a, k, v)
        return a


@pytest.fixture
def llm():
    return FakeCaller()


@pytest.fixture
def client(llm):
    from fastapi.testclient import TestClient

    from app.api.deps import get_caller
    from app.main import app

    app.dependency_overrides[get_caller] = lambda: llm
    with TestClient(app) as c:  # the with-block runs startup, which checks the environment
        yield c
    app.dependency_overrides.clear()
