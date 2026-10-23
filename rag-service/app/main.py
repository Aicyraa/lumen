import hmac
import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated
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
from app.llm import ProviderError, build_prompt, make_llm
from app.router import decide

load_env()  # DATABASE_URL etc. from the repo-root .env; real environment variables win

log = logging.getLogger("lumen.rag")  # never log secrets, keys or document text


@dataclass
class Settings:
    internal_secret: str
    llm_base_url: str
    llm_api_key: str
    model_cheap: str
    model_expensive: str


def load_settings() -> Settings:
    names = ["INTERNAL_SECRET", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL_CHEAP", "LLM_MODEL_EXPENSIVE", "DATABASE_URL"]
    missing = [n for n in names if not os.environ.get(n)]
    if missing:  # names only: never print values
        raise RuntimeError(f"missing required environment variables: {', '.join(missing)}")
    return Settings(*(os.environ[n] for n in names[:5]))


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()  # refuse to start when anything is missing
    app.state.settings = settings
    models = {"cheap": settings.model_cheap, "expensive": settings.model_expensive}
    app.state.llm = make_llm(settings.llm_base_url, settings.llm_api_key, models, load_config()["llm"])
    yield


app = FastAPI(lifespan=lifespan)


# ---- errors: every error uses { "error": { "code", "message" } } ----
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    return error_response(exc.status, exc.code, exc.message)


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


def get_llm(request: Request):
    return request.app.state.llm


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


class QueryRequest(BaseModel):
    tenant_id: str = Field(min_length=1)
    query: str = Field(min_length=1)  # the upper length limit is enforced by Express (400/422 there)
    session_id: str | None = None  # accepted for the contract; Express stores it in request_logs


def query_response(started: float, answer: str, sources: list, route: dict, tokens_in=0, tokens_out=0) -> dict:
    return {
        "request_id": str(uuid4()),
        "answer": answer,
        "sources": sources,
        "route": route,
        "usage": {
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": None,  # Phase 7 fills this in
            "latency_ms": int((time.perf_counter() - started) * 1000),
        },
    }


@internal.post("/query")
def query(req: QueryRequest, llm=Depends(get_llm)):
    # plain def: embedding and database calls block, so FastAPI runs this in its thread pool
    started = time.perf_counter()
    messages = load_config()["messages"]
    none_route = {"model_tier": "none", "k": 0, "escalated": False, "difficulty": 0.0}
    qvec = embed([req.query])[0]
    probe = store.search(req.tenant_id, qvec, 1)  # best match only, to learn best_score
    if not probe:  # this tenant has no chunks at all
        return query_response(started, messages["no_documents"], [], none_route)
    best_score = probe[0][3]
    cfg = router_cfg()
    if best_score < cfg.no_answer_score:  # nothing relevant: do not spend a model call
        return query_response(started, messages["not_found"], [], none_route)
    route = decide(req.query, best_score, cfg)
    hits = store.search(req.tenant_id, qvec, route["k"])
    system, user = build_prompt(req.query, [content for _, _, content, _ in hits])
    try:
        result = llm.complete(route["model_tier"], system, user)
    except ProviderError:
        raise ApiError(502, "provider_error", "The language model provider failed. Try again shortly.")
    sources = [{"document_id": doc_id, "chunk_id": chunk_id, "score": score} for chunk_id, doc_id, _, score in hits]
    log.info("query tenant=%s tier=%s k=%d top=%.3f", req.tenant_id, route["model_tier"], route["k"], best_score)
    return query_response(started, result.text, sources, route, result.tokens_in, result.tokens_out)


@internal.delete("/documents/{document_id}")
def delete_document(document_id: str):
    raise ApiError(501, "not_implemented", "not built yet")


app.include_router(internal)
