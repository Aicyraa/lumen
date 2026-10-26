import numpy as np
from sentence_transformers import SentenceTransformer

from app.core import limits
from app.core.config import model_path

_model = SentenceTransformer(str(model_path("embedding")), local_files_only=True)


def embed(texts: list[str], wait: float | None = None) -> np.ndarray:
    """Return one L2-normalized 384-number vector per text (cosine similarity = dot product).
    wait: seconds to wait for a slot before limits.Busy (None = wait for as long as it takes)."""
    with limits.slot("embed", wait):  # at most concurrency.embed_max encodes at once per process
        return _model.encode(texts, normalize_embeddings=True)
