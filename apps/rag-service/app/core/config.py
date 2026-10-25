import os
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace

import yaml


@lru_cache
def load_config() -> dict:
    return yaml.safe_load((Path(__file__).parents[1] / "config.yaml").read_text())


def model_path(section: str) -> Path:
    """Keep each bundled revision separate so a config change cannot load stale weights."""
    cfg = load_config()[section]
    return Path(__file__).parents[1] / "models" / section / cfg["revision"]


def router_cfg() -> SimpleNamespace:
    """The router section with attribute access, as decide() expects (cfg.weak_score)."""
    return SimpleNamespace(**load_config()["router"])


def is_production() -> bool:
    # fail closed: a missing or misspelled NODE_ENV must never open the dev-only shortcuts
    return os.environ.get("NODE_ENV") not in ("development", "test")


REQUIRED_ENV = ["INTERNAL_SECRET", "DATABASE_URL", "NODE_ENV"]


def missing_env() -> list[str]:
    """Names of required variables that are unset or empty (never their values)."""
    return [n for n in REQUIRED_ENV if not os.environ.get(n)]


def load_settings() -> dict:
    missing = missing_env()
    if missing:  # names only: never print values
        raise RuntimeError(f"missing required environment variables: {', '.join(missing)}")
    return {"internal_secret": os.environ["INTERNAL_SECRET"]}
