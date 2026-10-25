"""Settings from tools/eval/.env plus the real environment (real variables win). Never prints values."""

import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path

PROVIDERS = {"openai", "anthropic", "google", "openai_compatible"}  # the rag-service ModelSpec set
REQUIRED = [
    "EVAL_BASE_URL", "EVAL_API_KEY", "EVAL_PROVIDER", "EVAL_MODEL_CHEAP", "EVAL_MODEL_EXPENSIVE",
    "EVAL_JUDGE_MODEL", "TENANT_IDS", "RAG_URL", "INTERNAL_SECRET", "EVAL_CONFIDENT_TOP_SCORE",
]  # fmt: skip
DEFAULT_ROUTER_CONFIG = Path(__file__).resolve().parents[3] / "apps/rag-service/app/config.yaml"
DEFAULT_ENV = Path(__file__).resolve().parents[1] / ".env"


class ConfigError(ValueError):
    pass


def parse_env_file(path) -> dict[str, str]:
    out = {}
    p = Path(path)
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip().strip("\"'")
    return out


@dataclass
class Config:
    base_url: str = ""
    api_key: str = field(default="", repr=False)
    provider: str = ""
    model_cheap: str = ""
    model_expensive: str = ""
    judge_model: str = ""
    judge_base_url: str = ""
    judge_api_key: str = field(default="", repr=False)
    prices: dict = field(default_factory=lambda: {"cheap": None, "expensive": None})
    tenant_ids: dict = field(default_factory=dict)
    rag_url: str = ""
    internal_secret: str = field(default="", repr=False)
    confident_top_score: float = 0.0
    not_found_message: str = "I could not find that in the documents."
    timeout_seconds: float = 120.0
    backoff_retries: int = 6
    quota_wait_seconds: float = (
        900.0  # a provider asking to wait longer than this has hit a daily cap
    )
    max_consecutive_failures: int = 5  # abort after this many unreachable-service failures in a row
    router_hash: str = (
        ""  # of the `router:` section of the rag-service config; part of the resume key
    )

    def models_payload(self) -> dict:
        def one(model):
            return [{"provider": self.provider, "model_id": model,
                     "endpoint_url": self.base_url, "api_key": self.api_key}]  # fmt: skip

        return {"cheap": one(self.model_cheap), "expensive": one(self.model_expensive)}


def _price(env, tier):
    a, b = env.get(f"EVAL_PRICE_{tier}_INPUT", ""), env.get(f"EVAL_PRICE_{tier}_OUTPUT", "")
    return (float(a), float(b)) if a and b else None


def _router_hash(path) -> str:
    """Hash of the top-level `router:` block of the rag-service config ('' when there is none)."""
    p = Path(path)
    if not p.exists():
        return ""
    block, inside = [], False
    for line in p.read_text().splitlines():
        if line and not line[0].isspace() and not line.startswith("#"):
            inside = line.startswith("router:")
        if inside:
            block.append(line)
    return hashlib.sha256("\n".join(block).encode()).hexdigest()[:16]


def load_config(path=DEFAULT_ENV, *, require: bool = True) -> Config:
    env = {**parse_env_file(path), **{k: v for k, v in os.environ.items() if v}}
    missing = [k for k in REQUIRED if not env.get(k)]
    if require and missing:
        raise ConfigError("missing variables in tools/eval/.env: " + ", ".join(missing))
    provider = env.get("EVAL_PROVIDER", "")
    if provider and provider not in PROVIDERS:
        raise ConfigError(f"EVAL_PROVIDER must be one of {sorted(PROVIDERS)}")
    tenants = {}
    for pair in filter(None, (p.strip() for p in env.get("TENANT_IDS", "").split(","))):
        name, sep, tid = pair.partition("=")
        if not sep or not name.strip() or not tid.strip():
            raise ConfigError("TENANT_IDS must look like 'Name=tenant_id,Other=tenant_id'")
        tenants[name.strip()] = tid.strip()
    try:
        return Config(
            base_url=env.get("EVAL_BASE_URL", "").rstrip("/"),
            api_key=env.get("EVAL_API_KEY", ""),
            provider=provider,
            model_cheap=env.get("EVAL_MODEL_CHEAP", ""),
            model_expensive=env.get("EVAL_MODEL_EXPENSIVE", ""),
            judge_model=env.get("EVAL_JUDGE_MODEL", ""),
            judge_base_url=(env.get("EVAL_JUDGE_BASE_URL") or env.get("EVAL_BASE_URL", "")).rstrip(
                "/"
            ),
            judge_api_key=env.get("EVAL_JUDGE_API_KEY") or env.get("EVAL_API_KEY", ""),
            prices={"cheap": _price(env, "CHEAP"), "expensive": _price(env, "EXPENSIVE")},
            tenant_ids=tenants,
            rag_url=env.get("RAG_URL", "").rstrip("/"),
            internal_secret=env.get("INTERNAL_SECRET", ""),
            confident_top_score=float(env.get("EVAL_CONFIDENT_TOP_SCORE") or 0),
            not_found_message=env.get("EVAL_NOT_FOUND_MESSAGE") or Config.not_found_message,
            timeout_seconds=float(env.get("EVAL_TIMEOUT_SECONDS") or Config.timeout_seconds),
            backoff_retries=int(env.get("EVAL_BACKOFF_RETRIES") or Config.backoff_retries),
            quota_wait_seconds=float(
                env.get("EVAL_QUOTA_WAIT_SECONDS") or Config.quota_wait_seconds
            ),
            router_hash=_router_hash(env.get("EVAL_ROUTER_CONFIG") or DEFAULT_ROUTER_CONFIG),
            max_consecutive_failures=int(
                env.get("EVAL_MAX_CONSECUTIVE_FAILURES") or Config.max_consecutive_failures
            ),
        )
    except ValueError as e:
        raise ConfigError(
            f"a numeric EVAL_* variable is not a number ({type(e).__name__})"
        ) from None
