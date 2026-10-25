import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.config import model_path

_model = SentenceTransformer(str(model_path("embedding")), local_files_only=True)


def embed(texts: list[str]) -> np.ndarray:
    """Return one L2-normalized 384-number vector per text (cosine similarity = dot product)."""
    return _model.encode(texts, normalize_embeddings=True)


def is_loaded() -> bool:  # stub for the red run
    return False
