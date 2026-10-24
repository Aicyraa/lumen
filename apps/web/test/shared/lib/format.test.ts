import { describe, expect, it } from "vitest";
import { fmtCost, isNearLimit } from "../../../src/shared/lib/format";

describe("fmtCost (estimated provider cost)", () => {
  it("says 'no price set' for null and never shows a misleading $0 for a tiny real cost", () => {
    expect(fmtCost(null)).toBe("no price set");
    expect(fmtCost(0)).toBe("$0");
    expect(fmtCost(0.00001)).toBe("<$0.0001");
    expect(fmtCost(0.0012)).toBe("$0.0012");
    expect(fmtCost(82.5)).toBe("$82.50");
  });
  it("amber threshold is strictly above 80%", () => {
    expect(isNearLimit(80, 100)).toBe(false);
    expect(isNearLimit(81, 100)).toBe(true);
    expect(isNearLimit(1, 0)).toBe(false);
  });
});
