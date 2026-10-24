import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

import { Home } from "../../../src/features/home/Home";

const view = () =>
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );

describe("Home content", () => {
  it("explains what Lumen is and who it is for", () => {
    view();
    const what = screen.getByRole("region", { name: "What Lumen is" });
    expect(within(what).getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(what).toHaveTextContent(/who it.s for/i);
    expect(what).toHaveTextContent(/PDF/);
  });

  it("describes routing as cheap, then expensive, then fallback, with an accessible diagram", () => {
    view();
    const sec = screen.getByRole("region", { name: "How routing works" });
    const diagram = within(sec).getByRole("img", { name: /router.*cheap.*expensive.*fallback/i });
    expect(diagram.tagName.toLowerCase()).toBe("svg");
    for (const n of ["Question", "Router", "Cheap model", "Expensive model", "Fallback", "Answer"])
      expect(diagram).toHaveTextContent(n);
  });

  it("has a features grid, use cases, security and a closing call to action", () => {
    view();
    expect(screen.getByRole("region", { name: "Built in" })).toBeInTheDocument();
    const uses = screen.getByRole("region", { name: "Use cases" });
    expect(within(uses).getAllByRole("heading", { level: 3 }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("region", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Closing" })).toBeInTheDocument();
  });

  it("figures come from real product facts only (no customer or usage numbers)", () => {
    const { container } = view();
    const figs = Array.from(container.querySelectorAll(".fact-num")).map((e) => e.textContent);
    expect(figs.length).toBeGreaterThanOrEqual(3);
    for (const f of figs) expect(f).toMatch(/^\d$/);
    expect(container.textContent).not.toMatch(/\d+[kKmM]?\+|\bcustomers\b|trusted by|uptime/i);
  });
});

describe("Home animation starts when seen", () => {
  let observers: { cb: IntersectionObserverCallback; el?: Element }[] = [];
  const original = window.IntersectionObserver;
  beforeEach(() => {
    observers = [];
    class IO {
      el?: Element;
      constructor(public cb: IntersectionObserverCallback) {
        observers.push(this as never);
      }
      observe(el: Element) {
        this.el = el;
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  });
  afterEach(() => {
    window.IntersectionObserver = original;
  });

  it("the routing diagram is idle on load and plays once it enters the viewport", () => {
    view();
    const flow = document.querySelector(".route-flow")!;
    expect(flow).not.toBeNull();
    expect(flow.classList.contains("in-view")).toBe(false);
    const o = observers.find((x) => x.el === flow)!;
    expect(o).toBeTruthy();
    act(() =>
      o.cb([{ isIntersecting: true, target: flow } as IntersectionObserverEntry], o as never),
    );
    expect(flow.classList.contains("in-view")).toBe(true);
  });
});
