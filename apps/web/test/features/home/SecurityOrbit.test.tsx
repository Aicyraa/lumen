import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { animate, made } = vi.hoisted(() => {
  const made: { play: () => void; pause: () => void; cancel: () => void }[] = [];
  const animate = vi.fn((..._args: unknown[]) => {
    const c = { play: vi.fn(), pause: vi.fn(), cancel: vi.fn() };
    made.push(c);
    return c;
  });
  return { animate, made };
});
vi.mock("motion/react", async (orig) => ({ ...(await orig<object>()), animate }));

import { SecurityOrbit } from "../../../src/features/home/SecurityOrbit";

const ITEMS = [
  ["A", "a body", "a"],
  ["B", "b body", "b"],
  ["C", "c body", "c"],
  ["D", "d body", "d"],
] as const;
const ICONS = ["shield", "key", "doc", "code"];
const mount = () => render(<SecurityOrbit items={ITEMS} icons={ICONS} />);

const realMatchMedia = window.matchMedia;
const realIO = window.IntersectionObserver;
const reduced = (on: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: on && /prefers-reduced-motion/.test(q),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
};
// An observer the test drives by hand.
let fire: (visible: boolean) => void = () => {};
const handObserver = () => {
  class IO {
    constructor(cb: IntersectionObserverCallback) {
      fire = (v) => cb([{ isIntersecting: v } as IntersectionObserverEntry], this as never);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
};

describe("SecurityOrbit motion", () => {
  beforeEach(() => {
    animate.mockClear();
    made.length = 0;
    reduced(false);
    handObserver();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.IntersectionObserver = realIO;
  });

  it("moves each of the four nodes with one 48 s linear, endless motion animation", () => {
    const { container } = mount();
    const nodes = [...container.querySelectorAll(".orbit-node")];
    expect(nodes).toHaveLength(4);
    expect(animate).toHaveBeenCalledTimes(4);
    animate.mock.calls.forEach((call, i) => {
      expect(call[0]).toBe(nodes[i]);
      expect(call[2]).toMatchObject({
        duration: 48,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      });
    });
  });

  it("traces the ellipse clockwise from a quarter-turn-spaced start, as a seamless loop", () => {
    mount();
    expect(animate.mock.calls).toHaveLength(4);
    const pct = (s: string) => Number.parseFloat(s);
    animate.mock.calls.forEach((call, i) => {
      const { x, y } = call[1] as { x: string[]; y: string[] };
      const f = i / 4 + 0.125;
      expect(x).toHaveLength(y.length);
      expect(pct(x[0])).toBeCloseTo(50 * Math.cos(2 * Math.PI * f), 3);
      expect(pct(y[0])).toBeCloseTo(50 * Math.sin(2 * Math.PI * f), 3);
      expect(x.at(-1)).toBe(x[0]); // the last frame is the first: no jump when it repeats
      expect(y.at(-1)).toBe(y[0]);
      for (const v of [...x, ...y]) expect(Math.abs(pct(v))).toBeLessThanOrEqual(50.0001);
      // every frame sits on the ellipse (radius 50% in both axes)
      for (const [k, xv] of x.entries()) expect(pct(xv) ** 2 + pct(y[k]) ** 2).toBeCloseTo(2500, 0);
      // the next frame is further round the circle (y grows first from the right-hand side), never backwards
      const a = (k: number) => Math.atan2(pct(y[k]), pct(x[k]));
      let turn = 0;
      for (let k = 1; k < x.length; k++)
        turn += ((a(k) - a(k - 1) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      expect(turn).toBeCloseTo(2 * Math.PI, 3);
    });
  });

  it("pauses when the ring leaves the viewport and resumes when it returns", () => {
    mount();
    expect(made).toHaveLength(4);
    fire(false);
    for (const c of made) expect(c.pause).toHaveBeenCalledTimes(1);
    fire(true);
    for (const c of made) expect(c.play).toHaveBeenCalledTimes(1);
  });

  it("cancels the animations on unmount, which puts the nodes back on their static places", () => {
    const { unmount } = mount();
    expect(made).toHaveLength(4);
    unmount();
    for (const c of made) expect(c.cancel).toHaveBeenCalledTimes(1);
  });

  it("does not animate at all under prefers-reduced-motion, and the ring and the list are still there", () => {
    reduced(true);
    const { container } = mount();
    expect(animate).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".orbit-node svg")).toHaveLength(4);
    expect(container.querySelector(".orbit-stage")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".sec-list > li")).toHaveLength(4);
  });

  it("without IntersectionObserver the nodes just keep moving", () => {
    (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    mount();
    expect(animate).toHaveBeenCalledTimes(4);
    for (const c of made) expect(c.pause).not.toHaveBeenCalled();
  });
});
