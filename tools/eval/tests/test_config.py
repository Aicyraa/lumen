import pytest

from evalkit.config import ConfigError, load_config

BASE = {
    "EVAL_BASE_URL": "https://api.example/v1", "EVAL_API_KEY": "k", "EVAL_PROVIDER": "openai",
    "EVAL_MODEL_CHEAP": "small", "EVAL_MODEL_EXPENSIVE": "big", "EVAL_JUDGE_MODEL": "judge",
    "TENANT_IDS": "Lumen=t1, Other=t2", "RAG_URL": "http://localhost:1", "INTERNAL_SECRET": "s",
    "EVAL_CONFIDENT_TOP_SCORE": "0.5",
}  # fmt: skip


def write_env(tmp_path, values):
    p = tmp_path / ".env"
    p.write_text("# c\n" + "\n".join(f'{k}="{v}"' for k, v in values.items()) + "\n")
    return p


def test_loads_file_and_builds_models_payload(tmp_path, monkeypatch):
    monkeypatch.delenv("EVAL_PRICE_CHEAP_INPUT", raising=False)
    cfg = load_config(write_env(tmp_path, BASE))
    assert cfg.tenant_ids == {"Lumen": "t1", "Other": "t2"}
    assert cfg.models_payload() == {
        "cheap": [{"provider": "openai", "model_id": "small",
                   "endpoint_url": "https://api.example/v1", "api_key": "k"}],
        "expensive": [{"provider": "openai", "model_id": "big",
                       "endpoint_url": "https://api.example/v1", "api_key": "k"}],
    }  # fmt: skip
    assert cfg.prices == {"cheap": None, "expensive": None}


def test_prices_need_both_input_and_output(tmp_path):
    env = {**BASE, "EVAL_PRICE_CHEAP_INPUT": "0.1", "EVAL_PRICE_CHEAP_OUTPUT": "0.4",
           "EVAL_PRICE_EXPENSIVE_INPUT": "3"}  # fmt: skip
    cfg = load_config(write_env(tmp_path, env))
    assert cfg.prices == {"cheap": (0.1, 0.4), "expensive": None}


@pytest.mark.parametrize("secret,expected", [("runner-secret", "runner-secret"), ("", "s")])
def test_nonempty_environment_overrides_file(tmp_path, monkeypatch, secret, expected):
    monkeypatch.setenv("INTERNAL_SECRET", secret)
    cfg = load_config(write_env(tmp_path, BASE))
    assert cfg.internal_secret == expected


def test_missing_variable_is_named_but_never_its_value(tmp_path):
    env = {k: v for k, v in BASE.items() if k != "EVAL_MODEL_BIG"}
    del env["RAG_URL"]
    with pytest.raises(ConfigError) as e:
        load_config(write_env(tmp_path, env))
    assert "RAG_URL" in str(e.value) and "INTERNAL_SECRET" not in str(e.value)


def test_provider_must_be_a_known_one(tmp_path):
    with pytest.raises(ConfigError, match="EVAL_PROVIDER"):
        load_config(write_env(tmp_path, {**BASE, "EVAL_PROVIDER": "nope"}))


def test_lenient_load_for_dry_run(tmp_path):
    cfg = load_config(write_env(tmp_path, {}), require=False)
    assert cfg.tenant_ids == {}
