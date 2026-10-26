import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Reveal } from "../../../src/shared/motion/motion";
import { useInView } from "../../../src/shared/motion/useInViewOnce";
import { fire, installFakeIntersectionObserver, observers } from "./fakeIntersectionObserver";

const originalMatch = window.matchMedia;
let restore: () => void;
beforeEach(() => {
  restore = installFakeIntersectionObserver();
});
afterEach(() => {
  restore();
  window.matchMedia = originalMatch;
});

function Probe() {
  const [ref, state] = useInView<HTMLDivElement>();
  return <div ref={ref} data-testid="p" data-state={state} />;
}
const state = () => screen.getByTestId("p").getAttribute("data-state");

describe("useInView", () => {
  it("starts idle, goes in when well inside the viewport, out when fully outside, and in again", () => {
    render(<Probe />);
    expect(state()).toBe("idle");
    fire(false, 0);
    expect(state()).toBe("out");
    fire(true, 0.3);
    expect(state()).toBe("in");
    fire(false, 0);
    expect(state()).toBe("out");
    fire(true, 0.4);
    expect(state()).toBe("in"); // replayed
  });

  it("does not flicker at the edges: a sliver does not switch it in, and it stays in until fully gone", () => {
    render(<Probe />);
    fire(false, 0);
    fire(true, 0.04); // a sliver
    expect(state()).toBe("out");
    fire(true, 0.3);
    expect(state()).toBe("in");
    fire(true, 0.04); // leaving: still partly visible
    expect(state()).toBe("in");
  });

  it("observes with several thresholds so the sliver and the fully-gone moments are reported", () => {
    render(<Probe />);
    const t = observers[0].opts!.threshold as number[];
    expect(t[0]).toBe(0);
    expect(t.length).toBeGreaterThan(1);
  });

  it("is simply 'in' when there is no IntersectionObserver (nothing hidden)", () => {
    (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    render(<Probe />);
    expect(state()).toBe("in");
  });
});

describe("Reveal enters and leaves", () => {
  const motionOn = () => {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  };
  it("is visible before it is observed, hidden once it is known to be out of view, shown again on re-entry", () => {
    motionOn();
    render(
      <Reveal>
        <p>content</p>
      </Reveal>,
    );
    const el = screen.getByText("content").parentElement!;
    expect(el).toHaveClass("reveal");
    expect(el.getAttribute("data-state")).toBe("idle"); // idle = fully visible (no hidden state without a measurement)
    fire(false, 0);
    expect(el.getAttribute("data-state")).toBe("out");
    fire(true, 0.3);
    expect(el.getAttribute("data-state")).toBe("in");
    fire(false, 0);
    expect(el.getAttribute("data-state")).toBe("out");
  });

  it("under reduced motion it never hides anything", () => {
    render(
      <Reveal>
        <p>content</p>
      </Reveal>,
    );
    const el = screen.getByText("content").parentElement!;
    expect(el.getAttribute("data-state")).toBeNull();
    expect(el).not.toHaveClass("reveal");
  });

  it("the CSS hides only the out state, animates opacity and transform under 600ms, and nothing else", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    expect(css).toMatch(/\.reveal\[data-state="out"\]\s*\{[^}]*opacity:\s*0/);
    const base = /\.reveal\s*\{([^}]*)\}/.exec(css)![1];
    expect(base).toMatch(/transition:[^;]*opacity 0?\.\d+s/);
    expect(base).toMatch(/transform 0?\.\d+s/);
    for (const m of base.matchAll(/(\d*\.?\d+)s/g)) expect(Number(m[1])).toBeLessThan(0.6);
  });
});
