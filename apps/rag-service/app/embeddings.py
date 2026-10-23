from pathlib import Path

import numpy as np
import yaml
from sentence_transformers import SentenceTransformer

_CONFIG = yaml.safe_load((Path(__file__).parent / "config.yaml").read_text())
_model = SentenceTransformer(_CONFIG["embedding"]["model"])  # loaded once, at import


def embed(texts: list[str]) -> np.ndarray:
    """Return one L2-normalized 384-number vector per text (cosine similarity = dot product)."""
    return _model.encode(texts, normalize_embeddings=True)
