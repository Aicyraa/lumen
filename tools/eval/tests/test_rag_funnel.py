"""scripts/rag-funnel.mjs --check against a temporary repo root (LUMEN_ROOT); it validates apps/rag-service/.env.funnel and never prints values."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SECRET = "ab" * 32
GOOD = {
    "DATABASE_URL": "postgresql://u:p@db.example.com:5432/x?sslmode=require",
    "INTERNAL_SECRET": SECRET,
}


def check(tmp, env=None, venv=True):
    d = tmp / "apps/rag-service"
    d.mkdir(parents=True, exist_ok=True)
    if venv:
        (d / ".venv/bin").mkdir(parents=True, exist_ok=True)
        (d / ".venv/bin/python").write_text("")
    if env is not None:
        (d / ".env.funnel").write_text("".join(f"{k}={v}\n" for k, v in env.items()))
    return subprocess.run(
        ["node", str(ROOT / "scripts/rag-funnel.mjs"), "--check"],
        env={"LUMEN_ROOT": str(tmp), "PATH": "/usr/bin:/usr/local/bin"},
        capture_output=True,
        text=True,
    )


def test_a_complete_file_passes_and_prints_no_value(tmp_path):
    r = check(tmp_path, GOOD)
    assert r.returncode == 0, r.stderr
    assert SECRET not in r.stdout + r.stderr and "postgresql://" not in r.stdout + r.stderr


def test_a_missing_file_says_where_to_create_it(tmp_path):
    r = check(tmp_path, None)
    assert r.returncode == 1 and ".env.funnel" in r.stderr


def test_a_short_secret_is_refused_without_echoing_it(tmp_path):
    r = check(tmp_path, {**GOOD, "INTERNAL_SECRET": "qzq9"})
    assert r.returncode == 1 and "INTERNAL_SECRET" in r.stderr and "qzq9" not in r.stderr


def test_a_missing_database_url_is_refused(tmp_path):
    r = check(tmp_path, {"INTERNAL_SECRET": SECRET})
    assert r.returncode == 1 and "DATABASE_URL" in r.stderr


def test_a_local_database_is_refused(tmp_path):
    r = check(tmp_path, {**GOOD, "DATABASE_URL": "postgresql://u:p@localhost:5433/x"})
    assert r.returncode == 1 and "DATABASE_URL" in r.stderr


def test_a_missing_venv_says_to_bootstrap(tmp_path):
    r = check(tmp_path, GOOD, venv=False)
    assert r.returncode == 1 and "bootstrap" in r.stderr
