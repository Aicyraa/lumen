"""Stub for the red run: no limit at all."""

from contextlib import contextmanager


class Busy(Exception):
    pass


def reset() -> None:
    pass


@contextmanager
def slot(name: str, wait: float | None = None):
    yield
