import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfoTip } from "../../../src/shared/ui/InfoTip";

const setup = () =>
  render(<InfoTip label="About the cheap tier">Easy questions, tried top to bottom.</InfoTip>);

describe("InfoTip", () => {
  it("is a labelled button described by a tooltip that is hidden until needed", () => {
    setup();
    const btn = screen.getByRole("button", { name: "About the cheap tier" });
    const tip = document.getElementById(btn.getAttribute("aria-describedby")!)!;
    expect(tip).toHaveAttribute("role", "tooltip");
    expect(tip).toHaveTextContent("Easy questions, tried top to bottom.");
    expect(tip).not.toBeVisible();
  });

  it("shows on keyboard focus and hides on blur", async () => {
    setup();
    await userEvent.tab();
    expect(screen.getByRole("tooltip")).toBeVisible();
    await userEvent.tab();
    expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
  });

  it("shows on hover and hides when the pointer leaves", async () => {
    setup();
    const btn = screen.getByRole("button", { name: "About the cheap tier" });
    await userEvent.hover(btn);
    expect(screen.getByRole("tooltip")).toBeVisible();
    await userEvent.unhover(btn);
    expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
  });

  it("Escape closes it while the button keeps focus", async () => {
    setup();
    await userEvent.tab();
    expect(screen.getByRole("tooltip")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
    expect(screen.getByRole("button", { name: "About the cheap tier" })).toHaveFocus();
  });

  describe("stays inside the viewport", () => {
    afterEach(() => vi.restoreAllMocks());
    const rectAt = (left: number, width: number) =>
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.getAttribute("role") === "tooltip"
          ? ({
              left,
              right: left + width,
              width,
              top: 0,
              bottom: 0,
              height: 0,
              x: left,
              y: 0,
              toJSON() {},
            } as DOMRect)
          : ({
              left: 0,
              right: 0,
              width: 0,
              top: 0,
              bottom: 0,
              height: 0,
              x: 0,
              y: 0,
              toJSON() {},
            } as DOMRect);
      });

    it("shifts left just enough to end 16px inside the viewport when it would overflow on the right", async () => {
      rectAt(window.innerWidth - 100, 260); // right edge 160px past the viewport
      setup();
      await userEvent.tab();
      expect(screen.getByRole("tooltip")).toHaveStyle({ transform: "translateX(-176px)" });
    });

    it("is nudged right when it starts outside the left edge", async () => {
      rectAt(-30, 200);
      setup();
      await userEvent.tab();
      expect(screen.getByRole("tooltip")).toHaveStyle({ transform: "translateX(46px)" });
    });

    it("when it is wider than the room, the left edge wins (16px inside)", async () => {
      rectAt(30, 1200);
      setup();
      await userEvent.tab();
      expect(screen.getByRole("tooltip")).toHaveStyle({ transform: "translateX(-14px)" });
    });

    it("is not moved when it fits", async () => {
      rectAt(20, 200);
      setup();
      await userEvent.tab();
      expect(screen.getByRole("tooltip").style.transform).toBe("");
    });

    it("has a width cap that cannot exceed a 390px phone", () => {
      const css = readFileSync("src/shared/styles/styles.css", "utf8");
      expect(css).toMatch(
        /\.infotip-tip\s*\{[^}]*max-width:\s*min\(260px,\s*calc\(100vw - 32px\)\)/,
      );
    });
  });
});
