import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");
const links = [...html.matchAll(/<link\s+rel="([^"]*icon[^"]*)"[^>]*>/g)].map((m) => {
  const tag = m[0];
  return { rel: m[1], href: /href="([^"]+)"/.exec(tag)![1], tag };
});
describe("icons", () => {
  it("index.html links an svg icon, a 32px png, an ico and an apple-touch icon", () => {
    const rels = links.map((l) => `${l.rel}:${l.href.split("?")[0].split(".").pop()}`);
    expect(rels).toEqual(
      expect.arrayContaining(["icon:svg", "icon:png", "icon:ico", "apple-touch-icon:png"]),
    );
  });

  it("every icon link is cache-busted and points at a file that exists in public/", () => {
    for (const l of links) {
      expect(l.href, l.tag).toMatch(/^\/[\w.-]+\?v=[\w-]+$/);
      expect(existsSync(`public${l.href.split("?")[0]}`), l.href).toBe(true);
    }
  });

  it("the cache-busting version is the same on every link", () => {
    expect(new Set(links.map((l) => l.href.split("?v=")[1])).size).toBe(1);
  });

  it("the svg icon is the three-line mark", () => {
    const svg = readFileSync("public/favicon.svg", "utf8");
    expect(svg.match(/<rect/g)).toHaveLength(3);
    expect(svg).toMatch(/data-part="fold"/);
  });

  it("favicon.ico is a real ICO with 16, 32 and 48 pixel images", () => {
    const b = readFileSync("public/favicon.ico");
    expect(b.readUInt16LE(0)).toBe(0); // reserved
    expect(b.readUInt16LE(2)).toBe(1); // type: icon
    const n = b.readUInt16LE(4);
    const sizes = Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("the old image files are gone", () => {
    for (const old of ["favicon-32.png", "apple-touch-icon.png"])
      expect(existsSync(`public/${old}`)).toBe(false);
  });
});
