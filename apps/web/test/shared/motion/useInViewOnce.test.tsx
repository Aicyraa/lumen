import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInViewOnce } from "../../../src/shared/motion/useInViewOnce";

// A controllable IntersectionObserver: the test decides when an element enters the viewport.
let observers: { cb: IntersectionObserverCallback; el?: Element; disconnect: () => void }[] = [];
const original = window.IntersectionObserver;
beforeEach(() => {
  observers = [];
  class IO {
    el?: Element;
    disconnect = vi.fn();
    constructor(public cb: IntersectionObserverCallback) {
      observers.push(this as never);
    }
    observe(el: Element) {
      this.el = el;
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});
afterEach(() => {
  window.IntersectionObserver = original;
});

function Probe() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="p" data-seen={String(seen)}>
      x
    </div>
  );
}
const enter = (isIntersecting: boolean) =>
  act(() => {
    const o = observers[0];
    o.cb([{ isIntersecting, target: o.el! } as IntersectionObserverEntry], o as never);
  });

describe("useInViewOnce", () => {
  it("is false on load, becomes true when the element enters the viewport and stays true", () => {
    render(<Probe />);
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "false");
    enter(false);
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "false");
    enter(true);
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "true");
    enter(false); // leaving does not undo it: once only
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "true");
  });

  it("stops observing after the first time", () => {
    render(<Probe />);
    enter(true);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("is true at once when there is no IntersectionObserver (nothing stays hidden)", () => {
    (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    render(<Probe />);
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "true");
  });
});
