import numpy as np
import psycopg
import pytest
from pgvector import Vector

from app.core.config import load_config
from app.retrieval import db, store
from tests.conftest import add_document


@pytest.fixture(autouse=True)
def fresh_pool():
    db.close_pool()  # each test builds its own pool from the config it patched
    yield
    db.close_pool()


def pid():
    with db.connection() as conn:
        return conn.execute("SELECT pg_backend_pid()").fetchone()[0]


def test_store_calls_reuse_one_pooled_connection():
    db.open_pool(
        wait=True
    )  # without the wait, the first call and the pool's own startup can each open a connection
    first = pid()
    doc = add_document("t", "f.txt")  # runs through the same pool
    store.add_chunks("t", doc, ["x"], np.array([np.eye(384, dtype=np.float32)[0]]))
    store.filenames("t", [doc])
    assert pid() == first  # sequential calls get the one idle connection back


def test_a_slow_statement_hits_the_statement_timeout(monkeypatch):
    monkeypatch.setitem(load_config()["database"], "statement_timeout_ms", 200)
    with pytest.raises(psycopg.errors.QueryCanceled):
        with db.connection() as conn:
            conn.execute("SELECT pg_sleep(3)")


def test_pool_size_and_timeouts_come_from_config(monkeypatch):
    cfg = load_config()["database"]
    monkeypatch.setitem(cfg, "pool_min_size", 1)
    monkeypatch.setitem(cfg, "pool_max_size", 3)
    pool = db.open_pool()
    assert (pool.min_size, pool.max_size) == (1, 3)
    assert pool.timeout == cfg["pool_timeout_seconds"]


def test_close_pool_releases_it_and_a_later_call_reopens():
    pid()
    assert db.is_open()
    db.close_pool()
    assert not db.is_open()
    pid()
    assert db.is_open()


def test_connections_have_the_vector_type_registered():
    with db.connection() as conn:
        v = conn.execute("SELECT '[1,2,3]'::vector").fetchone()[0]
    assert isinstance(v, Vector)


def test_service_opens_the_pool_at_startup_and_closes_it_at_shutdown(client):
    assert db.is_open()
    client.__exit__(None, None, None)  # run shutdown while the fixture still holds the client
    assert not db.is_open()
    client.__enter__()  # restore for the fixture's own exit


def test_pool_timeout_is_503_busy_with_retry_after(client, monkeypatch):
    from psycopg_pool import PoolTimeout

    from tests.conftest import AUTH

    def boom(*a, **k):
        raise PoolTimeout("no connection")

    monkeypatch.setattr(store, "filenames", boom)
    monkeypatch.setattr("app.api.routes.store.delete_document", boom)
    resp = client.delete(
        "/internal/documents/00000000-0000-0000-0000-000000000001?tenant_id=t", headers=AUTH
    )
    assert resp.status_code == 503 and resp.json()["error"]["code"] == "busy"
    assert resp.headers["Retry-After"] == str(load_config()["concurrency"]["retry_after_seconds"])
