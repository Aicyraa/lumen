import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const token = (name: string) =>
  readFileSync("src/shared/styles/styles.css", "utf8").match(
    new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"),
  )![1];

describe("text contrast (small text must reach 4.5:1)", () => {
  it.each(["text-2", "text-3", "text-4"])("%s on the page background and on cards", (t) => {
    expect(ratio(token(t), token("bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token(t), token("surface"))).toBeGreaterThanOrEqual(4.5);
  });

  describe("sidebar safety valve", () => {
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    it("never scrolls normally but may scroll on very short windows", () => {
      expect(css).toMatch(/\.sidebar\s*\{[^}]*overflow:\s*hidden/);
      expect(css).toMatch(
        /@media \(max-height: 560px\)\s*\{\s*\.sidebar\s*\{[^}]*overflow-y:\s*auto/,
      );
    });
  });
});

describe("Try it layout", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("is centred in the content area within a comfortable max width", () => {
    expect(css).toMatch(/\.try-grid\s*\{[^}]*max-width:\s*\d+px[^}]*margin-inline:\s*auto/);
  });
});

describe("Projects grid", () => {
  it("uses three columns on wide screens", () => {
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    expect(css).toMatch(/\.cards\s*\{[^}]*repeat\(3,/);
  });
});
