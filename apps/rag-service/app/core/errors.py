from fastapi.responses import JSONResponse


# every error uses { "error": { "code", "message" } }
class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        extra: dict | None = None,
        error_fields: dict | None = None,  # added inside `error` (e.g. retry_after_seconds)
        headers: dict | None = None,
    ):
        self.status, self.code, self.message, self.extra = status, code, message, extra or {}
        self.error_fields, self.headers = error_fields or {}, headers


def error_response(
    status: int,
    code: str,
    message: str,
    extra: dict | None = None,
    error_fields: dict | None = None,
    headers: dict | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "error": {"code": code, "message": message, **(error_fields or {})},
            **(extra or {}),
        },
        headers=headers,
    )
