"""One psycopg connection pool per process; every store function borrows a connection from it."""

import atexit
import os
import threading

from pgvector.psycopg import register_vector
from psycopg_pool import ConnectionPool

from app.core.config import load_config

_pool: ConnectionPool | None = None
_lock = threading.Lock()


def _configure(conn) -> None:
    register_vector(conn)
    # set_config (not a startup "options" parameter) so poolers that reject startup options still work
    ms = load_config()["database"]["statement_timeout_ms"]
    conn.execute("SELECT set_config('statement_timeout', %s, false)", (str(ms),))
    conn.commit()  # the pool wants the connection idle after configure


def open_pool(wait: bool = False) -> ConnectionPool:
    """Create the pool once. DATABASE_URL is read here, so tests can point it at the test database."""
    global _pool
    with _lock:
        if _pool is None:
            cfg = load_config()["database"]
            pool = ConnectionPool(
                os.environ["DATABASE_URL"],
                min_size=cfg["pool_min_size"],
                max_size=cfg["pool_max_size"],
                timeout=cfg["pool_timeout_seconds"],
                kwargs={"connect_timeout": cfg["connect_timeout_seconds"]},
                configure=_configure,
                open=False,
            )
            pool.open(wait=wait, timeout=cfg["pool_timeout_seconds"])
            _pool = pool
        return _pool


def close_pool() -> None:
    global _pool
    with _lock:
        pool, _pool = _pool, None
    if pool is not None:
        pool.close()


def connection(timeout: float | None = None):
    """Context manager: commits on success, rolls back on error, returns the connection to the pool.
    `timeout` overrides how long to wait for a free connection (default: database.pool_timeout_seconds)."""
    return (_pool or open_pool()).connection(timeout=timeout)


atexit.register(close_pool)  # CLI commands and tests never call close_pool; avoids a noisy exit
