import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../src/app/queryClient";
import { ApiError } from "../../src/shared/lib/api";

const retryOf = (c: ReturnType<typeof createQueryClient>) =>
  c.getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;

describe("query client defaults", () => {
  const c = createQueryClient(() => {});
  it("does not retry 4xx answers (nothing changes on a second try)", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429])
      expect(retryOf(c)(0, new ApiError(status, "x", "m"))).toBe(false);
  });
  it("retries a server or network failure once", () => {
    expect(retryOf(c)(0, new ApiError(500, "x", "m"))).toBe(true);
    expect(retryOf(c)(0, new ApiError(0, "network_error", "m"))).toBe(true);
    expect(retryOf(c)(1, new ApiError(500, "x", "m"))).toBe(false);
  });
  it("asks for a session refresh when a query or mutation gets 401", async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient(onUnauthorized);
    await client
      .fetchQuery({
        queryKey: ["a"],
        queryFn: () => Promise.reject(new ApiError(401, "unauthorized", "m")),
        retry: false,
      })
      .catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new ApiError(401, "unauthorized", "m")) })
      .execute(undefined)
      .catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
    await client
      .fetchQuery({
        queryKey: ["b"],
        queryFn: () => Promise.reject(new ApiError(403, "x", "m")),
        retry: false,
      })
      .catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });
});
