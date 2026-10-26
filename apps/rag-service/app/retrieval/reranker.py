"""Rerank this request's already tenant-filtered candidates; never cache document text."""

import math
import threading

from app.core import limits
from app.core.config import load_config, model_path
from app.core.logging import log

_loaded = None
_lock = threading.Lock()


def _model():
    """The cross-encoder, loaded once; the lock stops two threads from loading it twice."""
    global _loaded
    with _lock:
        if _loaded is None:
            from sentence_transformers import CrossEncoder

            _loaded = CrossEncoder(str(model_path("reranker")), local_files_only=True)
        return _loaded


def rerank(query: str, hits: list, k: int) -> list:
    if not hits:
        return []
    try:
        model = _model()
        # at most concurrency.rerank_max predictions at once per process; Busy is not caught below (503)
        with limits.slot("rerank", load_config()["concurrency"]["query_wait_seconds"]):
            scores = model.predict(
                [(query, h[2]) for h in hits],
                batch_size=load_config()["reranker"]["batch_size"],
                show_progress_bar=False,
            )
        if len(scores) != len(hits) or not all(math.isfinite(float(s)) for s in scores):
            raise ValueError("Invalid reranker scores")
        order = sorted(range(len(hits)), key=lambda i: float(scores[i]), reverse=True)
        return [hits[i] for i in order[:k]]
    except (OSError, RuntimeError, ValueError) as e:  # class only: the message may quote passages
        log.warning("reranker unavailable (%s); using fused retrieval order", type(e).__name__)
        return hits[:k]


def load() -> None:
    """Load the model at startup so the first query does not pay for it. A failure keeps the fused-order fallback."""
    try:
        _model()
    except (OSError, RuntimeError, ValueError) as e:
        log.warning(
            "reranker failed to load (%s); queries use fused retrieval order", type(e).__name__
        )


def is_loaded() -> bool:
    return _loaded is not None
