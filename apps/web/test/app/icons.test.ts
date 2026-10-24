import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");
const links = [...html.matchAll(/<link\s+rel="([^"]*icon[^"]*)"[^>]*>/g)].map((m) => {
  const tag = m[0];
  return { rel: m[1], href: /href="([^"]+)"/.exec(tag)![1], tag };
});
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

// Hashes of every icon PNG that shipped before the three-line logo (git history: 2bb62a0, b52a3e7).
const OLD_PNG_HASHES = new Set([
  "0232c23e05b4b3e70b85ab034c2cc46213750d80c2d3cb435a25da4071965424",
  "66a1b800ea14a854693bc2a7cd8283bc3e928331e4af5e47f8bb7fac4e354b77",
  "ef9ba1e3ae8c9123e9c61590c944d880849e46036193d6ef3ce27173060bf706",
  "33175c93e0013add5377aa61243a83186215283253807ca5f307346ed28919dd",
]);

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

  it("no png icon is one of the old marks (checked against git history hashes)", () => {
    for (const l of links.filter((x) => x.href.includes(".png"))) {
      expect(OLD_PNG_HASHES.has(sha(`public${l.href.split("?")[0]}`)), l.href).toBe(false);
    }
  });

  it("the old image files are gone", () => {
    for (const old of ["favicon-32.png", "apple-touch-icon.png"])
      expect(existsSync(`public/${old}`)).toBe(false);
  });
});
