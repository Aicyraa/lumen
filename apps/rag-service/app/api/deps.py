import hmac
from typing import Annotated

from fastapi import Header, Request

from app.core.config import is_production, load_config
from app.core.errors import ApiError
from app.llm.client import call_model


def require_secret(request: Request, x_internal_secret: Annotated[str | None, Header()] = None):
    expected = request.app.state.settings.internal_secret.encode()
    given = (x_internal_secret or "").encode()  # bytes: compare_digest rejects non-ASCII str
    if not hmac.compare_digest(given, expected):  # constant time
        raise ApiError(401, "unauthorized", "Missing or invalid X-Internal-Secret.")


def get_caller():
    return lambda m, tier, system, user: call_model(m, tier, system, user, load_config()["llm"], is_production())
