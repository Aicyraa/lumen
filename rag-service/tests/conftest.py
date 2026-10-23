import os
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest

from app.env import load_env

SCHEMA = Path(__file__).resolve().parents[2] / "infra" / "sql" / "001_app_tables.sql"


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
        conn.execute(SCHEMA.read_text())
    return url


@pytest.fixture(autouse=True)
def clean(test_db):
    with psycopg.connect(test_db, autocommit=True) as conn:
        conn.execute("TRUNCATE documents, chunks, request_logs RESTART IDENTITY CASCADE")


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


class FakeLLM:
    """Records every call; the no-answer tests assert it was never used."""

    def __init__(self):
        self.calls = []
        self.error = None  # set to an exception to make the next call fail

    def complete(self, tier, system, user):
        from app.llm import LLMResult

        self.calls.append({"tier": tier, "system": system, "user": user})
        if self.error:
            raise self.error
        return LLMResult("Fake answer [1]", 100, 10)


@pytest.fixture
def llm():
    return FakeLLM()


@pytest.fixture
def client(llm):
    from fastapi.testclient import TestClient

    from app.main import app, get_llm

    app.dependency_overrides[get_llm] = lambda: llm
    with TestClient(app) as c:  # the with-block runs startup, which checks the environment
        yield c
    app.dependency_overrides.clear()
