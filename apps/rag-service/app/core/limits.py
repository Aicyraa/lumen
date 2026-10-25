"""Bounded semaphores around the CPU-heavy model calls, sized from config.yaml (`concurrency`)."""

import threading
from contextlib import contextmanager

from app.core.config import load_config


class Busy(Exception):
    """No slot became free within the wait."""


_sems: dict[str, threading.BoundedSemaphore] = {}
_lock = threading.Lock()


def reset() -> None:
    """Forget the semaphores so the next use re-reads the config (tests)."""
    with _lock:
        _sems.clear()


def _get(name: str) -> threading.BoundedSemaphore:
    with _lock:
        if name not in _sems:
            _sems[name] = threading.BoundedSemaphore(load_config()["concurrency"][f"{name}_max"])
        return _sems[name]


@contextmanager
def slot(name: str, wait: float | None = None):
    """Hold one slot of `name` (embed, rerank or ingest). wait=None blocks; otherwise Busy after `wait` seconds."""
    sem = _get(name)
    if not sem.acquire(timeout=wait):
        raise Busy(name)
    try:
        yield
    finally:
        sem.release()
