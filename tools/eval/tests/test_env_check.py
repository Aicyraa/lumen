"""scripts/env.mjs check against a temporary repo root (LUMEN_ROOT); no real .env is read."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HEX = "ab" * 32
API = {
    "DATABASE_URL": "postgresql://u:p@localhost:5433/x", "BETTER_AUTH_SECRET": "s" * 32,
    "BETTER_AUTH_URL": "http://localhost:3000", "DASHBOARD_ORIGIN": "http://localhost:5173",
    "INTERNAL_SECRET": "i", "RAG_SERVICE_URL": "http://localhost:8000",
    "MAX_DOCUMENTS_PER_TENANT": "1", "RATE_LIMIT_PER_MINUTE": "1", "MAX_REQUESTS_PER_MONTH": "1",
    "MAX_PROJECTS_PER_USER": "1", "MODEL_KEY_ENCRYPTION_SECRET": HEX, "NODE_ENV": "development",
}  # fmt: skip


def check(tmp, api, rag=None):
    rag = rag or {
        "DATABASE_URL": API["DATABASE_URL"],
        "INTERNAL_SECRET": "i",
        "NODE_ENV": "development",
    }
    for d, env in {
        "apps/api": api,
        "apps/rag-service": rag,
        "apps/web": {},
        "infra": {"POSTGRES_PASSWORD": "p"},
    }.items():
        (tmp / d).mkdir(parents=True, exist_ok=True)
        (tmp / d / ".env").write_text("".join(f"{k}={v}\n" for k, v in env.items()))
    return subprocess.run(
        ["node", str(ROOT / "scripts/env.mjs"), "check"], capture_output=True, text=True,
        env={"PATH": "/usr/bin:/usr/local/bin", "LUMEN_ROOT": str(tmp)},
    )  # fmt: skip


def test_a_complete_api_env_passes(tmp_path):
    r = check(tmp_path, API)
    assert r.returncode == 0 and "env:check OK" in r.stdout


def test_node_env_is_required_for_the_api(tmp_path):
    r = check(tmp_path, {k: v for k, v in API.items() if k != "NODE_ENV"})
    assert r.returncode == 1 and "MISSING apps/api: NODE_ENV" in r.stdout


def test_optional_limits_may_be_unset_but_must_be_numbers_when_set(tmp_path):
    ok = check(tmp_path, {**API, "MAX_MODELS_PER_TIER": "7", "INGEST_BUSY_BACKOFF_MS": "2000"})
    assert ok.returncode == 0
    bad = check(tmp_path, {**API, "MAX_MODELS_PER_TIER": "many"})
    assert bad.returncode == 1 and "MAX_MODELS_PER_TIER" in bad.stdout and "many" not in bad.stdout
