import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Logo } from "../../../src/shared/ui/Logo";

describe("Logo", () => {
  it("renders the SVG mark and the wordmark as one home link, in both variants", () => {
    for (const variant of ["dark", "light"] as const) {
      const { container, unmount } = render(
        <MemoryRouter>
          <Logo variant={variant} />
        </MemoryRouter>,
      );
      const link = screen.getByRole("link", { name: "Lumen home" });
      expect(link).toHaveAttribute("href", "/");
      expect(link).toHaveTextContent("lumen");
      // leaf body + folded corner, and three text lines cut out
      expect(container.querySelectorAll("svg path")).toHaveLength(2);
      expect(container.querySelectorAll("svg rect")).toHaveLength(3);
      unmount();
    }
  });

  it("the inline SVG has no script, no event handler and no external reference", () => {
    const { container } = render(
      <MemoryRouter>
        <Logo />
      </MemoryRouter>,
    );
    const svg = container.querySelector("svg")!.outerHTML;
    expect(svg).not.toMatch(/<script|\son\w+=|href=|url\(|<image|<foreignObject|https?:/i);
  });
});

describe("public/favicon.svg", () => {
  const file = readFileSync("public/favicon.svg", "utf8");
  it("has no script, handler or external reference", () => {
    expect(file).not.toMatch(/<script|\son\w+=|href=|url\(|<image|<foreignObject/i);
    expect(file.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:/i);
  });
  it("is the leaf mark: a folded corner and three text lines of different lengths", () => {
    expect(file.match(/<path/g)).toHaveLength(2);
    expect(file.match(/<rect/g)).toHaveLength(3);
    const widths = [...file.matchAll(/<rect[^>]* width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(new Set(widths).size).toBe(3);
    expect(file).toMatch(/data-part="fold"/);
  });
  it("has a plain hex fill before the oklch token so older Safari renders it", () => {
    expect(file).toMatch(/<path fill="#[0-9a-f]{6}"[^>]*style="fill:\s*oklch\(0\.88 0\.17 118\)"/i);
  });
});
