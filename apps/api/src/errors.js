// One error shape for the whole API: { error: { code, message } }
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const sendError = (res, status, code, message) => res.status(status).json({ error: { code, message } });

export const notFoundHandler = (req, res) => sendError(res, 404, "not_found", "Not found.");

// Express 5 forwards async rejections here. Never echo internals or request bodies.
export function errorHandler(log) {
  return (err, req, res, _next) => {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    if (err?.name === "ZodError") return sendError(res, 422, "invalid_request", "Invalid request.");
    if (err?.type === "entity.parse.failed") return sendError(res, 422, "invalid_request", "Body must be valid JSON.");
    log.error({ err: { name: err?.name, message: err?.message } }, "unhandled error");
    return sendError(res, 500, "internal_error", "Something went wrong.");
  };
}
