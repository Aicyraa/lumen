"""The real stack behind the isolation flow: scratch database, child processes, stub model."""

import os
import secrets
import shutil
import sys
import tempfile
from pathlib import Path

import psycopg

from isolation import suite
from isolation.sqlstrip import make_leaky_copy
from isolation.stack import (
    Procs,
    StackError,
    derive_urls,
    drop_statement,
    free_port,
    scratch_name,
    wait_http,
)
from isolation.stub_model import StubModel

ROOT = Path(__file__).resolve().parents[3]
KEEP_ENV = (
    "PATH",
    "HOME",
    "LANG",
    "USER",
    "TMPDIR",
    "XDG_CACHE_HOME",
    "HF_HOME",
    "HF_HUB_OFFLINE",
    "TRANSFORMERS_OFFLINE",
)


def base_env(extra: dict) -> dict:
    env = {k: os.environ[k] for k in KEEP_ENV if k in os.environ}
    return {**env, **extra}


def run_cmd(procs: Procs, name, argv, cwd, env, timeout=300):
    p = procs.start(name, argv, cwd=cwd, env=env)
    try:
        code = p.wait(timeout)
    except Exception:
        p.kill()
        raise
    if code != 0:
        raise StackError(f"{name} failed (exit {code}):\n{procs.tail(name)}")


def start_rag(procs, name, cwd, env, port):
    argv = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
    ]
    p = procs.start(name, argv, cwd=cwd, env=env)
    wait_http(f"http://127.0.0.1:{port}/internal/health", proc=p, what=name, timeout=240)
    return p


def start_api(procs, name, env, port):
    p = procs.start(
        name,
        [str(ROOT / "apps/api/node_modules/.bin/tsx"), "src/server.ts"],
        cwd=ROOT / "apps/api",
        env=env,
    )
    wait_http(f"http://127.0.0.1:{port}/v1/documents/x", ok=(401,), proc=p, what=name, timeout=120)
    return p


def api_env(scratch_url, port, rag_port, secrets_, uploads):
    return base_env({
        "NODE_ENV": "development", "PORT": str(port), "DATABASE_URL": scratch_url,
        "BETTER_AUTH_URL": f"http://localhost:{port}", "DASHBOARD_ORIGIN": "http://localhost:5173",
        "RAG_SERVICE_URL": f"http://127.0.0.1:{rag_port}", "UPLOAD_DIR": str(uploads),
        "BETTER_AUTH_SECRET": secrets_["auth"], "INTERNAL_SECRET": secrets_["internal"],
        "MODEL_KEY_ENCRYPTION_SECRET": secrets_["model"],
        # generous limits for this process only (the suite makes 100+ requests)
        "MAX_DOCUMENTS_PER_TENANT": "1000", "RATE_LIMIT_PER_MINUTE": "100000",
        "MAX_REQUESTS_PER_MONTH": "1000000", "MAX_PROJECTS_PER_USER": "10",
    })  # fmt: skip


class RealEnv:
    """Everything the flow needs, with the scratch database name fixed once in `db_name`."""

    def __init__(
        self, dev_url, say, connect=psycopg.connect, procs_factory=Procs, stub=None, tmp=None
    ):
        self.say, self.connect = say, connect
        self.tmp = Path(tmp) if tmp else Path(tempfile.mkdtemp(prefix="lumen_isolation_"))
        self.tmp.mkdir(parents=True, exist_ok=True)
        self.procs = procs_factory(self.tmp)
        self.stub = stub or StubModel()
        self.db_name = scratch_name()
        self.admin_url, self.scratch_url = derive_urls(dev_url, self.db_name)
        self.db_created = False
        self.sec = {
            "auth": secrets.token_hex(24),
            "internal": secrets.token_hex(16),
            "model": secrets.token_hex(32),
        }
        self.env_rag = base_env(
            {
                "DATABASE_URL": self.scratch_url,
                "INTERNAL_SECRET": self.sec["internal"],
                "NODE_ENV": "development",
            }
        )

    @property
    def stub_url(self):
        return self.stub.url

    def stub_answers(self):
        return self.stub.answer_calls

    def create_db(self):
        self.say(f"scratch database {self.db_name}; logs in {self.tmp}")
        with self.connect(self.admin_url, autocommit=True) as c:
            c.execute(f'CREATE DATABASE "{self.db_name}"')
        self.db_created = True

    def _api(self, name, rag_port):
        port = free_port()
        env = api_env(self.scratch_url, port, rag_port, self.sec, self.tmp / "uploads")
        return port, env

    def start_real(self):
        self.create_db()
        rag_port = free_port()
        port, env_api = self._api("api", rag_port)
        run_cmd(
            self.procs, "migrate", ["node", "scripts/db.mjs", "migrate"], ROOT,
            base_env({"DATABASE_URL": self.scratch_url}),
        )  # fmt: skip
        run_cmd(
            self.procs, "auth-migrate",
            [str(ROOT / "apps/api/node_modules/.bin/tsx"), "scripts/migrate.ts"],
            ROOT / "apps/api", env_api,
        )  # fmt: skip
        self.say("migrations applied (app tables + Better Auth tables)")
        self.stub.start()
        self.say("starting rag-service and API ...")
        start_rag(self.procs, "rag", ROOT / "apps/rag-service", self.env_rag, rag_port)
        start_api(self.procs, "api", env_api, port)
        return self._client(port)

    def start_control(self, variant, which):
        self.say(f"\nnegative control '{variant}': building the leaky copy ...")
        leaky_dir = self.tmp / f"leaky-{variant}"
        removed = make_leaky_copy(ROOT / "apps/rag-service/app", leaky_dir, which)
        self.say(f"  removed {removed} tenant_id predicate(s) in the copy of store.py")
        rag_port = free_port()
        start_rag(self.procs, f"rag-{variant}", leaky_dir, self.env_rag, rag_port)
        port, env_api = self._api(variant, rag_port)
        start_api(self.procs, f"api-{variant}", env_api, port)
        return self._client(port)

    def _client(self, port):
        return suite.Api(f"http://127.0.0.1:{port}", "http://localhost:5173", self.sec["internal"])

    def stop_services(self):
        self.procs.stop_all()  # free ports and memory before the next copy

    def cleanup(self):
        self.procs.stop_all()
        self.stub.stop()
        if self.db_created:
            try:
                with self.connect(self.admin_url, autocommit=True) as c:
                    c.execute(drop_statement(self.db_name))
                self.say(f"dropped scratch database {self.db_name}")
            except (
                Exception
            ) as e:  # report, never hide: a leftover database must be removed by hand
                self.say(f"WARNING: could not drop {self.db_name}: {type(e).__name__}")
            self.db_created = False
        shutil.rmtree(self.tmp, ignore_errors=True)
