import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom has neither matchMedia nor IntersectionObserver. Tests run as "reduced motion" so numbers and reveals
// are in their final state immediately; the observer fires at once so in-view content is shown.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({ matches: /prefers-reduced-motion/.test(query), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}
if (!("IntersectionObserver" in window)) {
  class IO { constructor(private cb: IntersectionObserverCallback) {} observe(el: Element) { this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver); } unobserve() {} disconnect() {} takeRecords() { return []; } }
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
