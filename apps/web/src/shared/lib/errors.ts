import { ApiError } from "./api";

const wait = (s?: number) =>
  s == null
    ? "in a moment"
    : s < 90
      ? `in ${s} ${s === 1 ? "second" : "seconds"}`
      : `in ${Math.ceil(s / 60)} minutes`;

// Text for an error shown to the user. Limits and their numbers come from the server; this only adds what to do next.
export function friendlyError(e: unknown, fallback = "Something went wrong."): string {
  if (e instanceof ApiError) {
    const w = wait(e.retryAfterSeconds);
    switch (e.code) {
      case "model_limit":
        return `${e.message} Remove one to add another.`;
      case "rate_limited":
        return `Too many requests. Try again ${w}.`;
      case "upload_rate_limited":
        return `You are uploading too fast. Try again ${w}.`;
      case "ingest_limit":
        return `Your other documents are still being processed. Try again ${w}.`;
    }
  }
  return e instanceof Error ? e.message : fallback;
}
