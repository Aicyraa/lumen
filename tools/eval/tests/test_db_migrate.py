"""scripts/db.mjs migrate against a scratch database (created and dropped here; dev data is never touched)."""

import subprocess
import threading
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import pytest

ROOT = Path(__file__).resolve().parents[3]
NAME = "lumen_polish_eval_test"


def dev_url():
    for line in (
        (ROOT / "apps/api/.env").read_text().splitlines()
        if (ROOT / "apps/api/.env").exists()
        else []
    ):
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip("\"'")
    return None


@pytest.fixture
def scratch():
    psycopg = pytest.importorskip("psycopg")
    url = dev_url()
    if not url or urlparse(url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        pytest.skip("no local DATABASE_URL in apps/api/.env")
    p = urlparse(url)
    admin = urlunparse(p._replace(path="/postgres"))
    try:
        c = psycopg.connect(admin, autocommit=True, connect_timeout=3)
    except psycopg.OperationalError:
        pytest.skip("dev Postgres is not running (pnpm db:up)")
    with c:
        c.execute(f'DROP DATABASE IF EXISTS "{NAME}" WITH (FORCE)')
        c.execute(f'CREATE DATABASE "{NAME}"')
        try:
            yield urlunparse(p._replace(path=f"/{NAME}"))
        finally:
            c.execute(f'DROP DATABASE IF EXISTS "{NAME}" WITH (FORCE)')


def migrate(url):
    return subprocess.run(
        ["node", "scripts/db.mjs", "migrate"], cwd=ROOT, capture_output=True, text=True,
        env={"PATH": "/usr/bin:/usr/local/bin", "HOME": "/tmp", "DATABASE_URL": url},
        timeout=120,
    )  # fmt: skip


def applied(url):
    import psycopg

    with psycopg.connect(url) as c:
        return [r[0] for r in c.execute("SELECT name FROM schema_migrations ORDER BY name")]


def sql_files():
    return sorted(p.name for p in (ROOT / "infra/sql").glob("[0-9]*_*.sql"))


def test_running_twice_is_a_no_op(scratch):
    first = migrate(scratch)
    assert first.returncode == 0, first.stderr
    assert applied(scratch) == sql_files()  # includes 011 and any later file
    second = migrate(scratch)
    assert second.returncode == 0, second.stderr
    assert "applied    " not in second.stdout and applied(scratch) == sql_files()


def test_two_concurrent_runs_both_succeed(scratch):
    out = []
    ts = [threading.Thread(target=lambda: out.append(migrate(scratch))) for _ in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert [r.returncode for r in out] == [0, 0], [r.stderr for r in out]
    assert applied(scratch) == sql_files()
    # one run applied everything, the other found nothing to do
    assert sorted(r.stdout.count("applied    ") for r in out) == [0, len(sql_files())]


def test_the_database_port_is_bound_to_loopback_only():
    compose = (ROOT / "docker-compose.yml").read_text()
    assert '"127.0.0.1:5433:5432"' in compose and '"5433:5432"' not in compose
    script = (ROOT / "scripts/db.mjs").read_text()
    assert '"127.0.0.1:5433:5432"' in script and '"5433:5432"' not in script
