import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("describes routing with two tiers and an accessible diagram, and never mentions a fallback", () => {
    view();
    const sec = screen.getByRole("region", { name: "How routing works" });
    const diagram = within(sec).getByRole("group", { name: /router.*cheap.*expensive/i });
    expect(diagram.tagName.toLowerCase()).toBe("svg");
    for (const n of ["Question", "Router", "Cheap model", "Expensive model", "Answer", "502 error"])
      expect(diagram).toHaveTextContent(n);
    expect(document.body.textContent).not.toMatch(/fallback/i);
  });

  it("has a features grid, security and a closing call to action, and no use-cases section", () => {
    view();
    const built = screen.getByRole("region", { name: "Built in" });
    expect(built.querySelectorAll(".feature-card svg")).toHaveLength(6); // each feature has an illustration
    expect(screen.queryByRole("region", { name: "Use cases" })).toBeNull();
    const sec = screen.getByRole("region", { name: "Security" });
    expect(sec.querySelectorAll(".sec-card svg")).toHaveLength(4);
    expect(screen.queryByRole("region", { name: "Demo" })).toBeNull();
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

describe("Home section headings", () => {
  it.each(["What Lumen is", "How routing works", "Security"])(
    "%s: the heading sits directly under its label, stacked and left-aligned",
    (name) => {
      view();
      const sec = screen.getByRole("region", { name });
      const head = sec.querySelector(".sec-head")!;
      expect(head).not.toBeNull();
      expect(head.firstElementChild).toHaveClass("label");
      expect(head.children[1].tagName).toBe("H2");
      expect(sec.querySelector(".head-grid")).toBeNull();
    },
  );
});

const pressed = () =>
  within(screen.getByRole("group", { name: "Scenario" }))
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);
const active = (id: string) =>
  document.querySelector(`[data-node="${id}"]`)!.getAttribute("data-active");
const activeNodes = () =>
  Array.from(document.querySelectorAll('[data-node][data-active="true"]')).map((n) =>
    n.getAttribute("data-node"),
  );

describe("Routing diagram is interactive", () => {
  it("has the four scenario buttons, Easy question selected first", () => {
    view();
    const group = screen.getByRole("group", { name: "Scenario" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Easy question", "Hard question", "Every model in the tier fails", "No match"]);
    expect(pressed()).toEqual(["Easy question"]);
    expect(activeNodes()).toEqual(["question", "router", "cheap", "answer"]);
  });

  it.each([
    ["Hard question", ["question", "router", "expensive", "answer"]],
    ["Every model in the tier fails", ["question", "router", "error"]],
    ["No match", ["question", "router", "answer"]],
    ["Easy question", ["question", "router", "cheap", "answer"]],
  ])("selecting %s highlights its path", async (name, path) => {
    view();
    await userEvent.click(
      within(screen.getByRole("group", { name: "Scenario" })).getByRole("button", { name }),
    );
    expect(pressed()).toEqual([name]);
    expect(activeNodes()).toEqual(path);
    for (const id of ["question", "router", "cheap", "expensive", "answer", "error"])
      expect(active(id)).toBe(path.includes(id) ? "true" : "false");
  });

  it("the four explanation items are linked to the scenarios", async () => {
    view();
    const sec = screen.getByRole("region", { name: "How routing works" });
    const items = within(sec).getAllByRole("button", { name: /^0\d/ });
    expect(items).toHaveLength(4);
    await userEvent.click(items[1]);
    expect(pressed()).toEqual(["Hard question"]);
    expect(items[1]).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(items[2]);
    expect(pressed()).toEqual(["Every model in the tier fails"]);
    expect(activeNodes()).toEqual(["question", "router", "error"]);
    await userEvent.click(items[3]);
    expect(pressed()).toEqual(["No match"]);
    await userEvent.click(items[0]);
    expect(pressed()).toEqual(["Easy question"]);
  });

  it("hovering or focusing a node shows what it does", async () => {
    view();
    const desc = screen.getByTestId("route-desc");
    const router = document.querySelector('[data-node="router"]') as SVGElement;
    expect(router).toHaveAttribute("tabindex", "0");
    await userEvent.hover(router);
    expect(desc).toHaveTextContent(/picks the tier/i);
    await userEvent.unhover(router);
    const expensive = document.querySelector('[data-node="expensive"]') as SVGElement;
    act(() => expensive.focus());
    expect(desc).toHaveTextContent(/hard or weakly matched/i);
    const error = document.querySelector('[data-node="error"]') as SVGElement;
    act(() => error.focus());
    expect(desc).toHaveTextContent(/502 provider_error/);
  });

  it("without hover or focus the description explains the selected scenario", async () => {
    view();
    const desc = screen.getByTestId("route-desc");
    expect(desc).toHaveTextContent(/cheap tier/i);
    await userEvent.click(screen.getByRole("button", { name: "No match" }));
    expect(desc).toHaveTextContent(/no model is called/i);
  });
});
