import threading
import time

import numpy as np
import pytest

from app.core import limits
from app.core.config import load_config
from app.retrieval import embeddings, reranker


class SlowModel:
    """Fake model that records how many calls overlap."""

    def __init__(self, delay=0.15):
        self.delay, self.now, self.peak, self.lock = delay, 0, 0, threading.Lock()

    def run(self):
        with self.lock:
            self.now += 1
            self.peak = max(self.peak, self.now)
        time.sleep(self.delay)
        with self.lock:
            self.now -= 1

    def encode(self, texts, **kwargs):
        self.run()
        return np.zeros((len(texts), 384), dtype=np.float32)

    def predict(self, pairs, **kwargs):
        self.run()
        return [0.0] * len(pairs)


@pytest.fixture(autouse=True)
def fresh_limits():
    limits.reset()
    yield
    limits.reset()


def run_threads(fn, n=6):
    threads = [threading.Thread(target=fn) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()


def test_embedding_calls_never_exceed_embed_max(monkeypatch):
    monkeypatch.setitem(load_config()["concurrency"], "embed_max", 2)
    model = SlowModel()
    monkeypatch.setattr(embeddings, "_model", model)
    run_threads(lambda: embeddings.embed(["x"]))
    assert model.peak == 2


def test_rerank_calls_never_exceed_rerank_max(monkeypatch):
    monkeypatch.setitem(load_config()["concurrency"], "rerank_max", 1)
    model = SlowModel()
    monkeypatch.setattr(reranker, "_model", lambda: model)
    hits = [(1, "d", "text", 0.5)]
    run_threads(lambda: reranker.rerank("q", hits, 1))
    assert model.peak == 1


def test_a_slot_that_stays_taken_raises_busy_after_the_wait(monkeypatch):
    monkeypatch.setitem(load_config()["concurrency"], "ingest_max", 1)
    with limits.slot("ingest"):
        started = time.perf_counter()
        with pytest.raises(limits.Busy):
            with limits.slot("ingest", wait=0.2):
                pass
        assert 0.15 < time.perf_counter() - started < 1.5
    with limits.slot("ingest", wait=0.2):  # released again
        pass


def test_ingest_limit_is_smaller_than_the_embed_limit():
    cfg = load_config()["concurrency"]
    assert cfg["ingest_max"] < cfg["embed_max"]
