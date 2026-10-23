import hmac
import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Depends, FastAPI, Form, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pypdf.errors import PyPdfError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import store
from app.chunking import chunk
from app.config import load_config, router_cfg
from app.embeddings import embed  # loads the model at import, before the server starts listening
from app.env import load_env
from app.extract import extract_text
from app.llm import build_prompt, call_model
from app.router import decide

load_env()  # DATABASE_URL etc. from the repo-root .env; real environment variables win

log = logging.getLogger("lumen.rag")  # never log secrets, keys or document text


def load_settings() -> dict:
    names = ["INTERNAL_SECRET", "DATABASE_URL"]
    missing = [n for n in names if not os.environ.get(n)]
    if missing:  # names only: never print values
        raise RuntimeError(f"missing required environment variables: {', '.join(missing)}")
    return {"internal_secret": os.environ["INTERNAL_SECRET"]}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.settings = SimpleNamespace(**load_settings())  # refuse to start when anything is missing
    yield


app = FastAPI(lifespan=lifespan)


# ---- errors: every error uses { "error": { "code", "message" } } ----
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict | None = None):
        self.status, self.code, self.message, self.extra = status, code, message, extra or {}


def error_response(status: int, code: str, message: str, extra: dict | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}, **(extra or {})})


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    return error_response(exc.status, exc.code, exc.message, exc.extra)


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
    return error_response(exc.status_code, code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # field names and messages only: the submitted values may be document text
    first = exc.errors()[0]
    where = ".".join(str(p) for p in first["loc"] if p not in ("body", "query", "path"))
    return error_response(422, "invalid_request", f"{where}: {first['msg']}" if where else first["msg"])


# ---- dependencies ----
def require_secret(request: Request, x_internal_secret: Annotated[str | None, Header()] = None):
    expected = request.app.state.settings.internal_secret.encode()
    given = (x_internal_secret or "").encode()  # bytes: compare_digest rejects non-ASCII str
    if not hmac.compare_digest(given, expected):  # constant time
        raise ApiError(401, "unauthorized", "Missing or invalid X-Internal-Secret.")


def get_caller():
    return lambda m, tier, system, user: call_model(m, tier, system, user, load_config()["llm"], is_production())


internal = APIRouter(prefix="/internal", dependencies=[Depends(require_secret)])


@app.get("/internal/health")  # no secret; async because it does no blocking work
async def health():
    return {"status": "ok"}


@internal.post("/ingest")
def ingest(tenant_id: Annotated[str, Form(min_length=1)], document_id: Annotated[UUID, Form()], file: UploadFile):
    # plain def: FastAPI runs it in its thread pool, so the blocking embed does not stall /internal/health
    suffix = Path(file.filename or "").suffix.lower()  # only the extension is used; the name never touches disk
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp.flush()
        try:
            text = extract_text(tmp.name)
        except (UnicodeDecodeError, PyPdfError):  # UnicodeDecodeError is a ValueError, so catch it first
            text = ""
        except ValueError:
            raise ApiError(415, "unsupported_type", "Only PDF, .txt and .md files are supported.")
    if "\x00" in text:  # Postgres text cannot hold NUL; treat the file as unreadable text
        text = ""
    chunks = chunk(text) if text.strip() else []
    if not chunks:
        raise ApiError(422, "no_text_extracted", "No text could be extracted from the file.")
    vectors = embed(chunks)
    try:  # one transaction: a failure leaves no chunks
        store.add_chunks(tenant_id, str(document_id), chunks, vectors)
    except psycopg.errors.ForeignKeyViolation:  # no such document for this tenant
        raise ApiError(404, "not_found", "Document not found.")
    log.info("ingested tenant=%s document=%s chunks=%d", tenant_id, document_id, len(chunks))
    return {"chunk_count": len(chunks)}


class ModelSpec(BaseModel):
    provider: Literal["openai", "anthropic", "google", "openai_compatible"]
    model_id: str = Field(min_length=1)
    endpoint_url: str = Field(min_length=1)
    api_key: str = Field(min_length=1)
    tenant_model_id: str | None = None


class TenantModels(BaseModel):
    cheap: list[ModelSpec] = []
    expensive: list[ModelSpec] = []
    fallback: list[ModelSpec] = []


class QueryRequest(BaseModel):
    tenant_id: str = Field(min_length=1)
    query: str = Field(min_length=1)  # the upper length limit is enforced by Express (400/422 there)
    session_id: str | None = None  # accepted for the contract; Express stores it in request_logs
    models: TenantModels | None = None  # absent: use the dev/test default from the LLM_* environment
    include_snippets: bool = False  # Try it only: adds filename and snippet to each source


def is_production() -> bool:
    return os.environ.get("NODE_ENV") == "production"


def query_response(started: float, answer: str, sources: list, route: dict, tokens_in=0, tokens_out=0, attempts=None) -> dict:
    return {
        "request_id": str(uuid4()),
        "answer": answer,
        "sources": sources,
        "route": route,
        "usage": {
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": None,  # Express computes the tenant's estimated cost from its own prices
            "latency_ms": int((time.perf_counter() - started) * 1000),
        },
        "attempts": attempts or [],
    }


def env_default(tier: str) -> list[dict]:
    """The dev/test default model from LLM_* (never in production); empty when not fully set."""
    model_id = os.environ.get(f"LLM_MODEL_{tier.upper()}")
    url, key = os.environ.get("LLM_BASE_URL"), os.environ.get("LLM_API_KEY")
    if is_production() or not (model_id and url and key):
        return []
    return [{"provider": "openai_compatible", "model_id": model_id, "endpoint_url": url, "api_key": key, "tenant_model_id": None}]


def plan_models(tier: str, models: TenantModels | None) -> list[tuple[str, dict]]:
    """Ordered (attempt tier label, model) pairs: the chosen tier, else the other tier, then the fallback group."""
    if models is None:
        return [("default", m) for m in env_default(tier)]
    other = "expensive" if tier == "cheap" else "cheap"
    group = tier if getattr(models, tier) else other  # a tier with no models borrows the other tier's
    return [(g, m.model_dump()) for g in (group, "fallback") for m in getattr(models, g)]


@internal.post("/query")
def query(req: QueryRequest, caller=Depends(get_caller)):
    # plain def: embedding and database calls block, so FastAPI runs this in its thread pool
    started = time.perf_counter()
    messages = load_config()["messages"]
    none_route = {"model_tier": "none", "k": 0, "escalated": False, "difficulty": 0.0, "top_score": None}
    qvec = embed([req.query])[0]
    probe = store.search(req.tenant_id, qvec, 1)  # best match only, to learn best_score
    if not probe:  # this tenant has no chunks at all
        return query_response(started, messages["no_documents"], [], none_route)
    best_score = probe[0][3]
    cfg = router_cfg()
    if best_score < cfg.no_answer_score:  # nothing relevant: do not spend a model call
        return query_response(started, messages["not_found"], [], {**none_route, "top_score": best_score})
    route = {**decide(req.query, best_score, cfg), "top_score": best_score}
    plan = plan_models(route["model_tier"], req.models)
    if not plan:
        raise ApiError(422, "no_models_configured", "No models are configured. Add a model in the Models tab.")
    hits = store.search(req.tenant_id, qvec, route["k"])
    system, user = build_prompt(req.query, [content for _, _, content, _ in hits])
    attempts = []
    for label, m in plan:  # top to bottom; the first model that answers wins
        attempts.append(caller(m, label, system, user))
        if attempts[-1].outcome == "ok":
            break
    public = [a.public() for a in attempts]
    won = attempts[-1]
    if won.outcome != "ok":
        raise ApiError(502, "provider_error", "The language model provider failed. Try again shortly.", {"attempts": public})
    sources = [{"document_id": doc_id, "chunk_id": chunk_id, "score": score} for chunk_id, doc_id, _, score in hits]
    if req.include_snippets:  # live to the owner only: never stored, never logged
        names = store.filenames(req.tenant_id, [s["document_id"] for s in sources])
        n = load_config()["llm"]["snippet_chars"]
        for s, (_, _, content, _) in zip(sources, hits):
            s["filename"], s["snippet"] = names.get(s["document_id"]), content[:n]
    log.info("query tenant=%s tier=%s k=%d top=%.3f attempts=%d", req.tenant_id, route["model_tier"], route["k"], best_score, len(attempts))
    return query_response(started, won.text, sources, route, won.tokens_in, won.tokens_out, public)


@internal.delete("/documents/{document_id}")
def delete_document(document_id: UUID, tenant_id: str):
    # tenant_id is a required query parameter; another tenant's id simply matches nothing
    return {"deleted_chunks": store.delete_document(tenant_id, str(document_id))}


app.include_router(internal)
