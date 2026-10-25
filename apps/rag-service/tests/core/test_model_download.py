import runpy
from pathlib import Path

import pytest
import sentence_transformers

from app import cli
from app.core import config


@pytest.mark.parametrize("reranker_enabled", [True, False])
def test_build_saves_pinned_models_and_skips_a_disabled_reranker(monkeypatch, tmp_path, reranker_enabled):
    cfg = {
        "embedding": {"model": "embedding-repo", "revision": "embedding-revision"},
        "reranker": {
            "model": "reranker-repo",
            "revision": "reranker-revision",
            "enabled": reranker_enabled,
        },
    }
    monkeypatch.setattr(cli, "load_config", lambda: cfg)
    monkeypatch.setattr(cli, "model_path", lambda section: tmp_path / section)
    loaded, saved = [], []

    class Model:
        def __init__(self, name, **kwargs):
            loaded.append((name, kwargs))

        def save_pretrained(self, path, **kwargs):
            saved.append(Path(path))

    monkeypatch.setattr(sentence_transformers, "SentenceTransformer", Model)
    monkeypatch.setattr(sentence_transformers, "CrossEncoder", Model)
    assert cli.main(["download-models"]) == 0
    expected = [("embedding-repo", {"revision": "embedding-revision", "device": "cpu"})]
    paths = [tmp_path / "embedding"]
    if reranker_enabled:
        expected.append(("reranker-repo", {"revision": "reranker-revision", "device": "cpu"}))
        paths.append(tmp_path / "reranker")
    assert loaded == expected
    assert saved == paths


def test_embedding_runtime_loads_only_the_bundled_model(monkeypatch):
    calls = []
    monkeypatch.setattr(
        sentence_transformers,
        "SentenceTransformer",
        lambda path, **kwargs: calls.append((path, kwargs)),
    )
    runpy.run_module("app.retrieval.embeddings", run_name="offline_embedding_test")
    assert calls == [(str(config.model_path("embedding")), {"local_files_only": True})]


def test_reranker_runtime_loads_only_the_bundled_model(monkeypatch):
    from app.retrieval import reranker

    calls = []
    monkeypatch.setattr(
        sentence_transformers,
        "CrossEncoder",
        lambda path, **kwargs: calls.append((path, kwargs)),
    )
    reranker._model.cache_clear()
    try:
        reranker._model()
        assert calls == [(str(config.model_path("reranker")), {"local_files_only": True})]
    finally:
        reranker._model.cache_clear()


def test_a_failed_download_fails_the_build(monkeypatch):
    def unavailable(*args, **kwargs):
        raise OSError("model download failed")

    monkeypatch.setattr(sentence_transformers, "SentenceTransformer", unavailable)
    with pytest.raises(OSError, match="model download failed"):
        cli.main(["download-models"])
