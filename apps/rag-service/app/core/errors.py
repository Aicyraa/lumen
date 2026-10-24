from fastapi.responses import JSONResponse


# every error uses { "error": { "code", "message" } }
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict | None = None):
        self.status, self.code, self.message, self.extra = status, code, message, extra or {}


def error_response(status: int, code: str, message: str, extra: dict | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"error": {"code": code, "message": message}, **(extra or {})}
    )
