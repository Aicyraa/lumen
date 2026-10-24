"""pnpm eval:isolation: scratch database, own API + rag-service + stub model, leak checks, negative control."""

import atexit
import os
import secrets
import shutil
import signal
import sys
import tempfile
from pathlib import Path

import psycopg

from evalkit.config import parse_env_file
from isolation import suite
from isolation.data import TENANT_A, TENANT_B
from isolation.report import Outcome, exit_code, summary_lines
from isolation.sqlstrip import make_leaky_copy
from isolation.stack import Procs, StackError, derive_urls, free_port, scratch_name, wait_http
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


def say(msg=""):
    print(msg, flush=True)


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


def print_run(title, run: suite.Run, verbose=False):
    say(
        f"\n== {title}: {run.checks} checks, {len(run.leaks)} leak(s), {len(run.problems)} problem(s)"
    )
    for label, name, ok in run.results:
        if verbose and not name.startswith("chat["):
            say(f"  {'PASS' if ok else 'FAIL'} tenant {label} · {name}")
    for label, name, f in run.findings:
        say(f"  [{f.kind}] tenant {label} · {name} · {f.detail}")


def main() -> int:
    out = Outcome()
    tmp = Path(tempfile.mkdtemp(prefix="lumen_isolation_"))
    procs = Procs(tmp)
    dev_url = parse_env_file(ROOT / "apps/api/.env").get("DATABASE_URL", "")
    if not dev_url:
        say("apps/api/.env has no DATABASE_URL")
        return 2
    name = scratch_name()
    admin_url, scratch_url = derive_urls(dev_url, name)
    db_created = False
    stub = StubModel()

    def cleanup():
        nonlocal db_created
        procs.stop_all()
        stub.stop()
        if db_created:
            try:
                with psycopg.connect(admin_url, autocommit=True) as c:
                    c.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
                say(f"dropped scratch database {name}")
            except (
                Exception
            ) as e:  # report, never hide: a leftover database must be removed by hand
                say(f"WARNING: could not drop {name}: {type(e).__name__}")
            db_created = False
        shutil.rmtree(tmp, ignore_errors=True)

    atexit.register(cleanup)
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: sys.exit(130))
    try:
        sec = {
            "auth": secrets.token_hex(24),
            "internal": secrets.token_hex(16),
            "model": secrets.token_hex(32),
        }
        say(f"scratch database {name}; logs in {tmp}")
        with psycopg.connect(admin_url, autocommit=True) as c:
            c.execute(f'CREATE DATABASE "{name}"')
        db_created = True
        node_env = base_env({"DATABASE_URL": scratch_url})
        run_cmd(procs, "migrate", ["node", "scripts/db.mjs", "migrate"], ROOT, node_env)
        rag_port, api_port = free_port(), free_port()
        env_api = api_env(scratch_url, api_port, rag_port, sec, tmp / "uploads")
        run_cmd(
            procs,
            "auth-migrate",
            [str(ROOT / "apps/api/node_modules/.bin/tsx"), "scripts/migrate.ts"],
            ROOT / "apps/api",
            env_api,
        )
        say("migrations applied (app tables + Better Auth tables)")
        stub.start()
        env_rag = base_env(
            {
                "DATABASE_URL": scratch_url,
                "INTERNAL_SECRET": sec["internal"],
                "NODE_ENV": "development",
            }
        )
        say("starting rag-service and API ...")
        start_rag(procs, "rag", ROOT / "apps/rag-service", env_rag, rag_port)
        start_api(procs, "api", env_api, api_port)
        api = suite.Api(f"http://127.0.0.1:{api_port}", "http://localhost:5173", sec["internal"])
        tenants = suite.provision(api, [TENANT_A, TENANT_B], stub.url)
        say(f"provisioned tenants A and B with {sum(len(t.doc_ids) for t in tenants)} documents")
        run = suite.Run()
        suite.run_questions(api, tenants, run, positives=True)
        suite.run_object_checks(api, tenants, run)
        out.real_leaks, out.real_problems, out.real_checks = (
            len(run.leaks),
            len(run.problems),
            run.checks,
        )
        out.stub_answers = stub.answer_calls
        print_run("REAL STACK", run, verbose=True)
        say(
            f"cross-tenant questions: {run.cross}; positive checks: {run.positives}; "
            f"object-level and dashboard checks: {run.checks - run.cross - run.positives}; "
            f"chat calls in total: {sum(t.chat_calls for t in tenants)}"
        )

        out.cross_asked, out.positives_passed = run.cross, run.positives_passed
        # negative control: the same questions against a rag-service whose retrieval ignores tenant_id.
        # The combined mutation is mandatory; one control per predicate shows which path alone is enough to leak.
        variants = [
            ("combined", None),
            ("vector", ("search",)),  # the dense query; the probe is the same SQL
            ("keyword", ("keyword_search",)),
        ]
        for name, which in variants:
            say(f"\nnegative control '{name}': building the leaky copy ...")
            leaky_dir = tmp / f"leaky-{name}"
            removed = make_leaky_copy(ROOT / "apps/rag-service/app", leaky_dir, which)
            say(f"  removed {removed} tenant_id predicate(s) in the copy of store.py")
            leaky_port, api2_port = free_port(), free_port()
            start_rag(procs, f"rag-{name}", leaky_dir, env_rag, leaky_port)
            env_api2 = api_env(scratch_url, api2_port, leaky_port, sec, tmp / "uploads")
            start_api(procs, f"api-{name}", env_api2, api2_port)
            api2 = suite.Api(
                f"http://127.0.0.1:{api2_port}", "http://localhost:5173", sec["internal"]
            )
            for t in tenants:
                t.request_ids, t.chat_calls = [], 0
            control = suite.Run()
            suite.run_questions(api2, tenants, control, positives=False)
            per = {
                t.spec.label: sum(1 for lb, _, _ in control.leaks if lb == t.spec.label)
                for t in tenants
            }
            say(
                f"  {control.cross} cross-tenant questions, {len(control.leaks)} leak(s) detected {per}, {len(control.problems)} problem(s)"
            )
            for lb, nm, f in control.leaks[:3]:
                say(f"  [{f.kind}] tenant {lb} · {nm[:50]} · {f.detail[:90]}")
            if which is None:
                out.control_ran, out.control_leaks = True, per
            else:
                out.single_controls[name] = per
            procs.stop_all()  # free the ports and memory before the next copy
    except StackError as e:
        say(f"\nSTACK ERROR: {e}")
        out.real_problems += 1
    except Exception as e:
        say(f"\nERROR: {type(e).__name__}: {e}")
        out.real_problems += 1
    finally:
        cleanup()
    say()
    for line in summary_lines(out):
        say(line)
    return exit_code(out)


if __name__ == "__main__":
    sys.exit(main())
