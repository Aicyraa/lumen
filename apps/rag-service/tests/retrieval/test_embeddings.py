import numpy as np

from app.retrieval.embeddings import embed


def test_embed_gives_normalized_384_vectors():
    out = embed(["hello world", "second text"])
    assert out.shape == (2, 384)
    assert np.allclose(np.linalg.norm(out, axis=1), 1.0, atol=1e-5)


def test_similar_text_scores_higher_than_unrelated():
    a, b, c = embed(["how do I reset my password", "password reset steps", "bananas grow in warm climates"])
    assert a @ b > a @ c
