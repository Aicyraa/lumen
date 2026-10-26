import { z } from "zod";
import { ApiError } from "./errors.js";

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && z.uuid().safeParse(v).success;

// A failed body parse becomes 422 invalid_request naming the first bad field.
export const invalidRequest = (e: z.ZodError) =>
  new ApiError(
    422,
    "invalid_request",
    `Invalid request: ${e.issues[0]?.path.join(".") || "body"}.`,
  );
