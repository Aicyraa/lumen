"""Database access (stub for the red run: one new connection per call, as before the pool)."""

import os
from contextlib import contextmanager

import psycopg
from pgvector.psycopg import register_vector


@contextmanager
def connection():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        register_vector(conn)
        yield conn


def open_pool():
    raise NotImplementedError


def close_pool() -> None:
    pass


def is_open() -> bool:
    return False
