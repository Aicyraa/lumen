import { act } from "@testing-library/react";
import { vi } from "vitest";

// A controllable IntersectionObserver: the test decides when an element enters or leaves the viewport.
export const observers: {
  cb: IntersectionObserverCallback;
  el?: Element;
  opts?: IntersectionObserverInit;
  disconnect: () => void;
}[] = [];

// Installs the fake and returns the function that puts the real one back.
export function installFakeIntersectionObserver() {
  const original = window.IntersectionObserver;
  observers.length = 0;
  class IO {
    el?: Element;
    disconnect = vi.fn();
    constructor(
      public cb: IntersectionObserverCallback,
      public opts?: IntersectionObserverInit,
    ) {
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
  return () => {
    window.IntersectionObserver = original;
  };
}

// Reports one entry to the most recent observer.
export const fire = (isIntersecting: boolean, intersectionRatio = isIntersecting ? 1 : 0) =>
  act(() => {
    const o = observers[observers.length - 1];
    o.cb(
      [{ isIntersecting, intersectionRatio, target: o.el! } as IntersectionObserverEntry],
      o as never,
    );
  });
