from app.config import load_config


def test_config_has_no_prices_before_phase_7():
    text = str(load_config()).lower()
    assert not any(word in text for word in ("price", "cost", "usd"))


def test_config_has_the_router_keys_from_the_brief():
    router = load_config()["router"]
    assert {"k_cheap", "k_expensive", "long_query_words", "hard_words", "weak_score",
            "no_answer_score", "escalate_at", "hard_at"} <= set(router)
