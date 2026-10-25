from contextlib import asynccontextmanager
from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from psycopg_pool import PoolTimeout
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import routes
from app.core.config import load_config, load_settings
from app.core.errors import ApiError, error_response
from app.core.logging import configure_logging
from app.retrieval import db, reranker


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    app.state.settings = SimpleNamespace(
        **load_settings()
    )  # refuse to start when anything is missing
    db.open_pool(wait=True)  # fail at startup, not on the first request, when the database is down
    if load_config()["reranker"]["enabled"]:
        reranker.load()  # with the embedder (loaded on import), so no query pays for it
    try:
        yield
    finally:
        db.close_pool()


async def api_error_handler(request: Request, exc: ApiError):
    return error_response(
        exc.status, exc.code, exc.message, exc.extra, exc.error_fields, exc.headers
    )


async def busy_handler(request: Request, exc: PoolTimeout):
    return error_response(
        503, "busy", "The service is busy. Try again shortly.", headers={"Retry-After": "2"}
    )


async def http_error_handler(request: Request, exc: StarletteHTTPException):
    code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
    return error_response(exc.status_code, code, str(exc.detail))


async def validation_error_handler(request: Request, exc: RequestValidationError):
    # field names and messages only: the submitted values may be document text
    first = exc.errors()[0]
    where = ".".join(str(p) for p in first["loc"] if p not in ("body", "query", "path"))
    return error_response(
        422, "invalid_request", f"{where}: {first['msg']}" if where else first["msg"]
    )


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(PoolTimeout, busy_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(routes.public)
    app.include_router(routes.internal)
    return app
