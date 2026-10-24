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
