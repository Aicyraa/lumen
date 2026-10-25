import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Privacy page and the app's no-third-party stance depend on the browser never calling a font host.
describe("self-hosted fonts", () => {
  const html = readFileSync("index.html", "utf8");
  const main = readFileSync("src/app/main.tsx", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  it("index.html loads nothing from Google Fonts or any other host", () => {
    expect(html).not.toMatch(/googleapis|gstatic/i);
    expect(html).not.toMatch(/<(link|script)[^>]+(href|src)="https?:/i);
  });
  it("imports exactly the Geist weights the stylesheet uses", () => {
    for (const w of [400, 500, 600]) expect(main).toContain(`@fontsource/geist/latin-${w}.css`);
    for (const w of [400, 500]) expect(main).toContain(`@fontsource/geist-mono/latin-${w}.css`);
  });
  it("the stylesheet asks for no weight that is not imported", () => {
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    const used = new Set([...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1])));
    for (const w of used) expect([400, 500, 600]).toContain(w);
  });
  it("pins both font packages to an exact version", () => {
    for (const n of ["@fontsource/geist", "@fontsource/geist-mono"])
      expect(pkg.dependencies[n]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
