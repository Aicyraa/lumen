import hmac
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import load_config
from app.env import load_env
from app.llm import make_llm

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
def ingest():
    raise ApiError(501, "not_implemented", "not built yet")


@internal.post("/query")
def query():
    raise ApiError(501, "not_implemented", "not built yet")


@internal.delete("/documents/{document_id}")
def delete_document(document_id: str):
    raise ApiError(501, "not_implemented", "not built yet")


app.include_router(internal)
