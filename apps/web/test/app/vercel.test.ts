import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The placeholder stays until deploy; set LUMEN_REQUIRE_API_HOST=1 in the deploy check to refuse it.
describe("vercel.json", () => {
  it.skipIf(process.env.LUMEN_REQUIRE_API_HOST !== "1")(
    "has the real API host, not the REPLACE-WITH-API-HOST placeholder",
    () => {
      expect(readFileSync("vercel.json", "utf8")).not.toContain("REPLACE-WITH-API-HOST");
    },
  );
});
