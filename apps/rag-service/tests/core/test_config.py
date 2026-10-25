import pytest

from app.core.config import is_production, load_config


def test_config_has_no_prices_before_phase_7():
    text = str(load_config()).lower()
    assert not any(word in text for word in ("price", "cost", "usd"))


def test_config_has_the_router_keys_from_the_brief():
    router = load_config()["router"]
    assert {
        "k_cheap",
        "k_expensive",
        "long_query_words",
        "hard_words",
        "weak_score",
        "no_answer_score",
        "escalate_at",
        "hard_at",
    } <= set(router)


@pytest.mark.parametrize("value, expected", [
    (None, True), ("", True), ("production", True), ("staging", True),
    ("development", False), ("test", False),
])  # fmt: skip
def test_production_unless_node_env_is_explicitly_development_or_test(monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv("NODE_ENV", raising=False)
    else:
        monkeypatch.setenv("NODE_ENV", value)
    assert is_production() is expected


def test_unset_node_env_rejects_localhost_endpoints(monkeypatch):
    from app.llm.endpoint_guard import EndpointError, assert_endpoint

    monkeypatch.delenv("NODE_ENV", raising=False)
    with pytest.raises(EndpointError):
        assert_endpoint("http://localhost:11434/v1", is_production())


def test_unset_node_env_disables_the_env_default_model(monkeypatch):
    from app.api.routes import env_default

    monkeypatch.delenv("NODE_ENV", raising=False)
    assert env_default("cheap") == []


def test_node_env_is_a_required_variable():
    from app.core.config import REQUIRED_ENV

    assert "NODE_ENV" in REQUIRED_ENV
