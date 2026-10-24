import { describe, expect, it } from "vitest";
import { resolveApiBase } from "../../../src/shared/lib/config";

describe("resolveApiBase", () => {
  it("uses VITE_API_URL when set, without a trailing slash", () => {
    expect(resolveApiBase({ VITE_API_URL: "https://api.example.test/", DEV: false })).toBe(
      "https://api.example.test",
    );
    expect(resolveApiBase({ VITE_API_URL: "http://localhost:4000///", DEV: true })).toBe(
      "http://localhost:4000",
    );
  });
  it("defaults to http://localhost:3000 in dev when it is unset or blank", () => {
    expect(resolveApiBase({ DEV: true })).toBe("http://localhost:3000");
    expect(resolveApiBase({ VITE_API_URL: "  ", DEV: true })).toBe("http://localhost:3000");
  });
  it("fails loudly in a production build when it is unset: never falls back to the page's own origin", () => {
    expect(() => resolveApiBase({ DEV: false })).toThrow(/VITE_API_URL/);
    expect(() => resolveApiBase({ VITE_API_URL: "", DEV: false })).toThrow(/VITE_API_URL/);
  });
});
