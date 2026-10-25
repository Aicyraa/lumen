"""Command handler for this app: python -m app.cli <command>."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from app.core.config import REQUIRED_ENV, load_config, missing_env, model_path
from app.core.env import load_env

SERVICE_DIR = Path(__file__).resolve().parents[1]
OPTIONAL_ENV = ["RAG_PORT", "RAG_HOST", "RAG_WORKERS", "LOG_LEVEL", "TEST_DATABASE_URL", "LLM_BASE_URL", "LLM_API_KEY",
                "LLM_MODEL_CHEAP", "LLM_MODEL_EXPENSIVE"]  # fmt: skip


def _run(*cmd: str) -> int:
    return subprocess.call([sys.executable, "-m", *cmd], cwd=SERVICE_DIR)


def test(args) -> int:
    return _run("pytest", *args.extra)


def download_models(args) -> int:
    from sentence_transformers import CrossEncoder, SentenceTransformer

    cfg = load_config()
    for section, model_class in (("embedding", SentenceTransformer), ("reranker", CrossEncoder)):
        if section == "reranker" and not cfg[section]["enabled"]:
            continue
        model = model_class(cfg[section]["model"], revision=cfg[section]["revision"], device="cpu")
        path = model_path(section)
        model.save_pretrained(str(path))
        print(f"Saved {section} model to {path}")
    return 0


def dev(args) -> int:
    import uvicorn  # imported here so other commands stay fast

    if not os.environ.get("NODE_ENV"):  # local dev only; an explicit value wins
        os.environ["NODE_ENV"] = "development"
    uvicorn.run("app.main:app", port=int(os.environ.get("RAG_PORT") or 8000), reload=True)
    return 0


def serve(args) -> int:
    """Production start: no reload, localhost by default, NODE_ENV left as the operator set it."""
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.environ.get("RAG_HOST") or "127.0.0.1",
        port=int(os.environ.get("RAG_PORT") or 8000),
        workers=int(os.environ.get("RAG_WORKERS") or 1),  # every worker loads both models
        reload=False,
    )
    return 0


def check_env(args) -> int:
    missing = missing_env()
    for name in REQUIRED_ENV:  # names and status only: never a value
        print(f"{name}: {'MISSING or empty' if name in missing else 'set'}")
    for name in OPTIONAL_ENV:
        print(f"{name} (optional): {'set' if os.environ.get(name) else 'not set'}")
    return 1 if missing else 0


def ingest(args) -> int:
    from app.ingest.service import ingest_file  # loads the embedding model
    from app.retrieval.store import ensure_tenant

    try:
        ensure_tenant(
            args.tenant_id
        )  # local testing only: the API creates the tenants row in production
        document_id, count = ingest_file(args.tenant_id, args.file)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    print(f"document {document_id}: {count} chunks stored for tenant {args.tenant_id}")
    return 0


def ask(args) -> int:
    from app.retrieval.ask import ask_chunks

    for rank, (chunk_id, _doc, content, score) in enumerate(
        ask_chunks(args.tenant_id, args.question), 1
    ):
        print(f"#{rank} score={score:.3f} chunk={chunk_id}\n    {content[:200]}...\n")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("dev", help="uvicorn with reload on RAG_PORT (default 8000)").set_defaults(
        run=dev
    )
    sub.add_parser(
        "serve",
        help="uvicorn without reload on RAG_HOST (default 127.0.0.1), RAG_PORT, RAG_WORKERS",
    ).set_defaults(run=serve)
    sub.add_parser("test", help="pytest; extra arguments are passed through").set_defaults(run=test)
    sub.add_parser("download-models", help="bundle pinned models for offline runtime").set_defaults(
        run=download_models
    )
    sub.add_parser("lint", help="ruff check").set_defaults(run=lambda a: _run("ruff", "check", "."))
    sub.add_parser("format", help="ruff format").set_defaults(
        run=lambda a: _run("ruff", "format", ".")
    )
    sub.add_parser(
        "check-env", help="report missing required variables (never values)"
    ).set_defaults(run=check_env)
    i = sub.add_parser("ingest", help="ingest a .txt, .md or .pdf for a tenant")
    i.add_argument("tenant_id")
    i.add_argument("file")
    i.set_defaults(run=ingest)
    a = sub.add_parser("ask", help="print the top 3 chunks for a question (no LLM)")
    a.add_argument("tenant_id")
    a.add_argument("question")
    a.set_defaults(run=ask)
    return p


def main(argv=None) -> int:
    parser = build_parser()
    args, extra = parser.parse_known_args(argv)
    if extra and args.command != "test":  # only `test` forwards unknown arguments
        parser.error(f"unrecognized arguments: {' '.join(extra)}")
    args.extra = extra
    load_env()  # the app's own .env; real environment variables win
    return args.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
