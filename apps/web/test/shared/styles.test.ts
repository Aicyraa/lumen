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

describe("public page layout", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  const rule = (sel: string) =>
    css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  it("the public navbar is sticky with a solid fallback background and a backdrop blur", () => {
    const all = [...css.matchAll(/\.pub-nav\s*\{([^}]*)\}/g)].map((m) => m[1]).join(";");
    expect(all).toMatch(/position:\s*sticky/);
    expect(all).toMatch(/top:\s*0/);
    expect(all).toMatch(/background:\s*var\(--bg\)/);
    expect(all).toMatch(/backdrop-filter:\s*blur/);
  });
  it("only the hero fills a screen; other snap sections take their content height", () => {
    expect(rule(".snap-section")).not.toMatch(/min-height/);
    expect(rule(".hero")).toMatch(/min-height/);
  });
});

describe("sticky nav offsets and dead CSS", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("anchors and scroll padding leave room for the sticky nav", () => {
    expect(css).not.toMatch(/scroll-padding-top:\s*16px/);
    for (const m of css.matchAll(/scroll-(?:padding|margin)-top:\s*([^;]+);/g))
      expect(m[1]).toBe("calc(var(--nav-h) + 24px)");
    expect(css).toMatch(
      /\.doc-content section\s*\{[^}]*scroll-margin-top:\s*calc\(var\(--nav-h\) \+ 24px\)/,
    );
    expect(css).toMatch(
      /html\.snap-home\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--nav-h\) \+ 24px\)/,
    );
  });
  it("has no rules left for the removed native select, use cases or old header buttons", () => {
    for (const dead of [".switcher select", ".all-projects", ".usecase", ".nav-sub", ".image-slot"])
      expect(css).not.toContain(dead);
  });
});

describe("Home section 02 proportions", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("the stat cards are scaled down and the left column gets the wider track and larger text", () => {
    const num = /\.fact-num\s*\{[^}]*font-size:\s*clamp\((\d+)px,\s*[^,]+,\s*(\d+)px\)/.exec(css)!;
    expect(Number(num[2])).toBeLessThanOrEqual(68);
    expect(css).toMatch(
      /\.what-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.[5-9]fr\)\s*minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(/\.audience li\s*\{[^}]*font-size:\s*(?:1[89]|2\d)px/);
  });
});
