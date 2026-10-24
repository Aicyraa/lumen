import type { ErrorRequestHandler, Request, Response } from "express";
import type { Logger } from "pino";

// One error shape for the whole API: { error: { code, message } }
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const sendError = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });

export const notFoundHandler = (_req: Request, res: Response) =>
  sendError(res, 404, "not_found", "Not found.");

// Express 5 forwards async rejections here. Never echo internals or request bodies.
export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message);
    if (err?.name === "ZodError") return sendError(res, 422, "invalid_request", "Invalid request.");
    if (err?.type === "entity.parse.failed")
      return sendError(res, 422, "invalid_request", "Body must be valid JSON.");
    log.error({ err: { name: err?.name, message: err?.message } }, "unhandled error");
    return sendError(res, 500, "internal_error", "Something went wrong.");
  };
}
