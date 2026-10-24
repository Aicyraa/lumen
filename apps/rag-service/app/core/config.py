import os
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace

import yaml


@lru_cache
def load_config() -> dict:
    return yaml.safe_load((Path(__file__).parents[1] / "config.yaml").read_text())


def router_cfg() -> SimpleNamespace:
    """The router section with attribute access, as decide() expects (cfg.weak_score)."""
    return SimpleNamespace(**load_config()["router"])


def is_production() -> bool:
    return os.environ.get("NODE_ENV") == "production"


def load_settings() -> dict:
    names = ["INTERNAL_SECRET", "DATABASE_URL"]
    missing = [n for n in names if not os.environ.get(n)]
    if missing:  # names only: never print values
        raise RuntimeError(f"missing required environment variables: {', '.join(missing)}")
    return {"internal_secret": os.environ["INTERNAL_SECRET"]}
