import { describe, expect, it } from "vitest";
import { ApiError } from "../../../src/shared/lib/api";
import { friendlyError } from "../../../src/shared/lib/errors";

const err = (status: number, code: string, message = "server text", retry?: number) =>
  new ApiError(status, code, message, retry);

describe("friendlyError", () => {
  it("model_limit keeps the server's limit and says what to do", () => {
    expect(
      friendlyError(err(422, "model_limit", "You can add at most 5 models to each tier.")),
    ).toBe("You can add at most 5 models to each tier. Remove one to add another.");
  });
  it.each([
    [err(429, "rate_limited", "x", 30), /Too many requests.*30 seconds/],
    [err(429, "rate_limited", "x", 150), /Too many requests.*3 minutes/],
    [err(429, "rate_limited"), /Too many requests.*in a moment/],
    [err(429, "upload_rate_limited", "x", 12), /uploading too fast.*12 seconds/],
    [err(429, "ingest_limit", "x", 10), /still being processed.*10 seconds/],
  ])("rate limits name the wait: %#", (e, re) => {
    expect(friendlyError(e)).toMatch(re);
  });
  it("uses one second, singular", () => {
    expect(friendlyError(err(429, "rate_limited", "x", 1))).toMatch(/in 1 second\b/);
  });
  it("passes any other message through, and a plain Error too", () => {
    expect(friendlyError(err(415, "unsupported_type", "Only PDF."))).toBe("Only PDF.");
    expect(friendlyError(new Error("boom"))).toBe("boom");
    expect(friendlyError("odd", "fallback")).toBe("fallback");
  });
});
