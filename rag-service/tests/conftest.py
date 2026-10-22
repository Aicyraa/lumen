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
