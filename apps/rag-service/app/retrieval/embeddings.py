import numpy as np
from sentence_transformers import SentenceTransformer

from app.core import limits
from app.core.config import model_path

_model = SentenceTransformer(str(model_path("embedding")), local_files_only=True)


def embed(texts: list[str]) -> np.ndarray:
    """Return one L2-normalized 384-number vector per text (cosine similarity = dot product)."""
    with limits.slot("embed"):  # at most concurrency.embed_max encodes at once per process
        return _model.encode(texts, normalize_embeddings=True)
