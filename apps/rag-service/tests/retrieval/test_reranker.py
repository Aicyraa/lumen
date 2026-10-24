import pytest


HITS = [(1, "doc-a", "First passage", 0.9), (2, "doc-b", "Better passage", 0.2)]


def test_reranker_changes_order_without_replacing_cosine_scores(monkeypatch):
    from app.retrieval import reranker

    class Model:
        def predict(self, pairs, **kwargs):
            assert pairs == [("question", "First passage"), ("question", "Better passage")]
            return [-3.0, 7.0]

    monkeypatch.setattr(reranker, "_model", lambda: Model())
    assert reranker.rerank("question", HITS, 1) == [HITS[1]]
    assert HITS[0][0] == 1  # input order remains intact


@pytest.mark.parametrize("scores", [[float("nan"), 1.0], [1.0], [float("inf"), 1.0]])
def test_invalid_model_scores_fall_back_to_fused_order(monkeypatch, scores):
    from app.retrieval import reranker

    class Model:
        def predict(self, pairs, **kwargs):
            return scores

    monkeypatch.setattr(reranker, "_model", lambda: Model())
    assert reranker.rerank("question", HITS, 1) == HITS[:1]


def test_unavailable_reranker_falls_back_without_logging_document_text(monkeypatch, caplog):
    from app.retrieval import reranker

    def unavailable():
        raise OSError("private document text must not reach logs")

    monkeypatch.setattr(reranker, "_model", unavailable)
    assert reranker.rerank("question", HITS, 1) == HITS[:1]
    assert "private document text" not in caplog.text


def test_empty_candidates_do_not_load_the_model(monkeypatch):
    from app.retrieval import reranker

    def unexpected():
        raise AssertionError("must not load")

    monkeypatch.setattr(reranker, "_model", unexpected)
    assert reranker.rerank("question", [], 5) == []
