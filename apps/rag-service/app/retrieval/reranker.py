"""Rerank this request's already tenant-filtered candidates; never cache document text."""

import math
from functools import lru_cache

from app.core.config import load_config
from app.core.logging import log


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import CrossEncoder

    cfg = load_config()["reranker"]
    return CrossEncoder(cfg["model"], revision=cfg["revision"], local_files_only=True)


def rerank(query: str, hits: list, k: int) -> list:
    if not hits:
        return []
    try:
        scores = _model().predict(
            [(query, h[2]) for h in hits],
            batch_size=load_config()["reranker"]["batch_size"],
            show_progress_bar=False,
        )
        if len(scores) != len(hits) or not all(math.isfinite(float(s)) for s in scores):
            raise ValueError("Invalid reranker scores")
        order = sorted(range(len(hits)), key=lambda i: float(scores[i]), reverse=True)
        return [hits[i] for i in order[:k]]
    except (OSError, RuntimeError, ValueError):
        log.warning("reranker unavailable; using fused retrieval order")
        return hits[:k]
