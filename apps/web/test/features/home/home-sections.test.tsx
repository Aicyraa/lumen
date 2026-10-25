import { readFileSync } from "node:fs";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

import { Home } from "../../../src/features/home/Home";
import { RF_TIMING, rfTotalSeconds } from "../../../src/features/home/RouteFlow";

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
    expect(sec.querySelectorAll(".orbit-node svg")).toHaveLength(4);
    expect(screen.queryByRole("region", { name: "Demo" })).toBeNull();
    expect(screen.getByRole("region", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Closing" })).toBeInTheDocument();
  });

  it("makes no customer or usage claims", () => {
    const { container } = view();
    expect(container.textContent).not.toMatch(/\d+[kKmM]?\+|\bcustomers\b|trusted by|uptime/i);
  });

  it("puts a decorative seam between Quickstart and Security as CSS only, so it is not in the DOM", () => {
    const { container } = view();
    expect(container.querySelector(".seam")).toBe(screen.getByRole("region", { name: "Security" }));
    expect(
      container.querySelector(".seam > *:not(.dot-grid):not(.sec-head):not(.sec-orbit)"),
    ).toBeNull();
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    expect(css).toMatch(/\.seam::before\s*\{[^}]*border-top:\s*1px dashed/);
    expect(css).toMatch(/\.seam::before,\s*\.seam::after\s*\{[^}]*position:\s*absolute/);
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
      o.cb(
        [
          {
            isIntersecting: true,
            intersectionRatio: 0.5,
            target: flow,
          } as IntersectionObserverEntry,
        ],
        o as never,
      ),
    );
    expect(flow.classList.contains("in-view")).toBe(true);
    act(() =>
      o.cb(
        [
          {
            isIntersecting: false,
            intersectionRatio: 0,
            target: flow,
          } as IntersectionObserverEntry,
        ],
        o as never,
      ),
    );
    expect(flow.classList.contains("in-view")).toBe(false);
    expect(flow.classList.contains("is-out")).toBe(true); // reset so it replays on re-entry
    act(() =>
      o.cb(
        [
          {
            isIntersecting: true,
            intersectionRatio: 0.5,
            target: flow,
          } as IntersectionObserverEntry,
        ],
        o as never,
      ),
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

const ITEMS = [
  "Cheap first",
  "Escalate when unsure",
  "A tier fails, the request fails",
  "No match, no model",
];
const items = () => within(screen.getByRole("list", { name: "Scenarios" })).getAllByRole("button");
const pressed = () =>
  items()
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => ITEMS[items().indexOf(b)]);
const active = (id: string) =>
  document.querySelector(`[data-node="${id}"]`)!.getAttribute("data-active");
const activeNodes = () =>
  Array.from(document.querySelectorAll('[data-node][data-active="true"]')).map((n) =>
    n.getAttribute("data-node"),
  );

describe("Section 07 is a list with a ring of the same icons", () => {
  const sec = () => screen.getByRole("region", { name: "Security" });
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("the four guarantees are a plain list with their icons, placed before the ring so the ring is on the right", () => {
    view();
    const items = sec().querySelectorAll(".sec-list > .sec-item");
    expect([...items].map((i) => i.querySelector("h3")?.textContent)).toEqual([
      "Isolated per workspace",
      "Keys shown once",
      "No document text in logs",
      "Documents treated as data",
    ]);
    for (const i of items) expect(i.querySelector(".icon-tile svg")).not.toBeNull();
    expect(within(sec()).queryAllByRole("button")).toHaveLength(0); // nothing to click or hover
    const grid = sec().querySelector(".sec-orbit")!;
    expect(grid.firstElementChild).toHaveClass("sec-list");
    expect(grid.lastElementChild).toHaveClass("orbit-stage");
  });

  it("the ring is drawing only: hidden from assistive tech, four icon nodes, nothing interactive", () => {
    view();
    const stage = sec().querySelector(".orbit-stage")!;
    expect(stage).toHaveAttribute("aria-hidden", "true");
    expect(stage.querySelectorAll(".orbit-node svg")).toHaveLength(4);
    expect(stage.querySelector("button, a, [tabindex]")).toBeNull();
    expect(css).not.toMatch(/\.orbit[^{]*:(?:hover|focus)/);
  });

  it("is drawn flat and moved by two eased translate animations a quarter turn apart, so the icons glide and stay sharp", () => {
    expect(css).not.toMatch(/preserve-3d|perspective:/);
    const node = css.match(/\n\.orbit-node\s*\{([^}]*)\}/)![1];
    const nodeY = css.match(/\n\.orbit-node-y\s*\{([^}]*)\}/)![1];
    expect(node).toMatch(/animation:\s*orbit-x[^;]*calc\(var\(--f\) \* -48s\)/);
    expect(nodeY).toMatch(/animation:\s*orbit-y[^;]*calc\(\(var\(--f\) \+ 0\.25\) \* -48s\)/);
    // keyframes are plain percentages of boxes as wide and as tall as the ellipse: no var(), so the compositor can run them
    expect(css).toMatch(
      /@keyframes orbit-x\s*\{[^@]*?from\s*\{\s*translate:\s*50% 0;[^@]*?to\s*\{\s*translate:\s*-50% 0;/,
    );
    expect(css).toMatch(
      /@keyframes orbit-y\s*\{[^@]*?from\s*\{\s*translate:\s*0 -50%;[^@]*?to\s*\{\s*translate:\s*0 50%;/,
    );
    const frames = [...css.matchAll(/@keyframes orbit-[xy]\s*\{(?:[^{}]*\{[^}]*\})*\s*\}/g)].map(
      (m) => m[0],
    );
    expect(frames).toHaveLength(2);
    for (const f of frames) expect(f).not.toMatch(/var\(/);
    // the same place without animation, so reduced motion keeps the nodes on the ring
    expect(node).toMatch(/\btranslate:\s*calc\(cos\(/);
    expect(nodeY).toMatch(/\btranslate:\s*0 calc\(sin\(/);
    // the ellipse's short radius (0.27 of the width, at least 300px wide) clears the shield (38px) and a node (26px) half-sizes
    expect(0.27 * 300).toBeGreaterThan(38 + 26);
  });
});

describe("Section 02 has more small content and a layout of its own", () => {
  it("tags each audience line, labels the three steps, and shows what a response looks like", () => {
    view();
    const what = screen.getByRole("region", { name: "What Lumen is" });
    expect([...what.querySelectorAll(".aud-tag")].map((e) => e.textContent)).toEqual([
      "TEAMS",
      "DEVELOPERS",
      "YOUR KEYS",
    ]);
    expect(what).toHaveTextContent("FIRST ANSWER IN THREE STEPS");
    expect(what).not.toHaveTextContent("AT A GLANCE");
    expect(what.querySelector(".facts")).toBeNull();
    // the audience is alone on the left; the response comes first on the right, the three steps (a horizontal line) under it
    const grid = what.querySelector(".what-grid")!;
    expect(grid.children[0].querySelectorAll(".audience li")).toHaveLength(3);
    const right = grid.children[1];
    expect(right.children[0]).toHaveClass("resp");
    expect(right.children[1].querySelectorAll(".mini-steps li")).toHaveLength(3);
    const resp = what.querySelector(".resp")!;
    expect(resp.querySelector(".term-bar")).not.toBeNull();
    expect(resp.querySelector(".tk-key")).toHaveTextContent('"answer"');
    expect(resp).toHaveTextContent("model_tier");
  });
});

describe("Routing diagram is interactive", () => {
  it("has no row of scenario chips above the diagram: the four numbered items are the only switch", () => {
    view();
    expect(screen.queryByRole("group", { name: "Scenario" })).toBeNull();
    expect(document.querySelector(".route-bar")).toBeNull();
    expect(items().map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^01Cheap first/),
      expect.stringMatching(/^02Escalate when unsure/),
      expect.stringMatching(/^03A tier fails, the request fails/),
      expect.stringMatching(/^04No match, no model/),
    ]);
    expect(pressed()).toEqual(["Cheap first"]);
    expect(activeNodes()).toEqual(["question", "router", "cheap", "answer"]);
  });

  it.each([
    [1, "Escalate when unsure", ["question", "router", "expensive", "answer"]],
    [2, "A tier fails, the request fails", ["question", "router", "error"]],
    [3, "No match, no model", ["question", "router", "answer"]],
    [0, "Cheap first", ["question", "router", "cheap", "answer"]],
  ])("selecting item %i (%s) highlights its path", async (i, name, path) => {
    view();
    await userEvent.click(items()[i]);
    expect(pressed()).toEqual([name]);
    expect(items()[i]).toHaveAttribute("aria-pressed", "true");
    expect(activeNodes()).toEqual(path);
    for (const id of ["question", "router", "cheap", "expensive", "answer", "error"])
      expect(active(id)).toBe(path.includes(id) ? "true" : "false");
  });

  it("the diagram has no description paragraph under it and its nodes are labelled images, not hover targets", () => {
    view();
    expect(screen.queryByTestId("route-desc")).toBeNull();
    const sec = screen.getByRole("region", { name: "How routing works" });
    expect(sec.querySelector(".route-main p")).toBeNull();
    const router = document.querySelector('[data-node="router"]') as SVGElement;
    expect(router).toHaveAttribute("role", "img");
    expect(router).toHaveAttribute("aria-label", expect.stringMatching(/picks the tier/i));
    expect(router).not.toHaveAttribute("tabindex");
    const error = document.querySelector('[data-node="error"]') as SVGElement;
    expect(error).toHaveAttribute("aria-label", expect.stringMatching(/502 provider_error/));
  });

  it("the nodes sit in four equal, evenly spaced columns and the two buses mirror each other", () => {
    view();
    const box = (id: string) => {
      const r = document.querySelector(`[data-node="${id}"] rect`)!;
      return { x: Number(r.getAttribute("x")), w: Number(r.getAttribute("width")) };
    };
    const ids = ["question", "router", "cheap", "expensive", "error", "answer"];
    for (const id of ids) expect(box(id).w).toBe(170);
    expect(["cheap", "expensive", "error"].map((id) => box(id).x)).toEqual([520, 520, 520]);
    const cols = [box("question"), box("router"), box("cheap"), box("answer")];
    const gaps = cols.slice(1).map((c, i) => c.x - (cols[i].x + cols[i].w));
    expect(new Set(gaps).size).toBe(1); // the same gap between every pair of columns
    const d = (id: string) => document.querySelector(`[data-edge="${id}"]`)!.getAttribute("d")!;
    // curves with horizontal tangents (cubic Béziers), the same 40 px reach on both sides, so the drawing mirrors left to right
    expect(d("r-c")).toBe("M440 152 C480 152 480 40 520 40");
    expect(d("c-a")).toBe("M690 40 C730 40 730 152 770 152");
    expect(d("r-x")).toBe("M440 152 C480 152 480 264 520 264");
    for (const id of ["r-c", "r-x", "r-a", "c-a"]) expect(d(id), id).toMatch(/ C/);
    expect(document.querySelector("svg.route-flow")!.innerHTML).not.toMatch(/ Q\d/); // no corner arcs
  });

  it("the lime path is a copy drawn above every grey edge, so shared stretches never show the wrong colour", async () => {
    view();
    const lime = () => document.querySelectorAll("path.rf-on");
    expect(document.querySelectorAll("[data-edge].rf-on")).toHaveLength(0);
    expect(lime()).toHaveLength(3); // question→router, router→cheap, cheap→answer
    await userEvent.click(items()[2]);
    expect(lime()).toHaveLength(2); // question→router, router→error
    const all = [...document.querySelectorAll("svg.route-flow > path")];
    expect(all.at(-1)).toHaveClass("rf-on");
  });
});

describe("Routing diagram timing and labels", () => {
  const css = readFileSync("src/shared/styles/styles.css", "utf8");
  it("the whole staggered entrance (delays plus durations) takes at most 600 ms", () => {
    expect(rfTotalSeconds()).toBeLessThanOrEqual(0.6);
    expect(RF_TIMING.duration).toBeLessThanOrEqual(0.3);
  });

  it("the CSS entrance duration is the same constant", () => {
    const m = /\.route-flow \.rf-node,[^{]*\{[^}]*animation-duration:\s*([\d.]+)s/.exec(css);
    expect(Number(m![1])).toBe(RF_TIMING.duration);
  });

  it("clicking a scenario only changes the highlight: the same elements stay, with no new entrance delays", async () => {
    view();
    const edge = document.querySelector('[data-edge="r-c"]')!;
    const node = document.querySelector('[data-node="cheap"]')!;
    const delay = (edge as SVGElement).style.animationDelay;
    await userEvent.click(items()[1]);
    expect(document.querySelector('[data-edge="r-c"]')).toBe(edge);
    expect(document.querySelector('[data-node="cheap"]')).toBe(node);
    expect((edge as SVGElement).style.animationDelay).toBe(delay);
    expect(edge.getAttribute("data-active")).toBe("false");
    expect(document.querySelector('[data-edge="r-e"]')!.getAttribute("data-active")).toBe("true");
  });

  it("highlight changes use a short transition of at most 250 ms", () => {
    for (const sel of [".rf-edge", ".route-flow .rf-node rect", ".rf-node"]) {
      const re = new RegExp(
        `(?:^|\\n)${sel.replace(/\./g, "\\.")}\\s*\\{[^}]*transition:[^;]*?([\\d.]+)s`,
      );
      const m = re.exec(css);
      expect(m, sel).not.toBeNull();
      expect(Number(m![1]), sel).toBeLessThanOrEqual(0.25);
    }
  });

  it("the one label sits on a chip with the card colour so text never lies on a stroke", () => {
    view();
    const labels = document.querySelectorAll(".rf-chip");
    expect(labels.length).toBe(1);
    expect(labels[0].querySelector("rect.rf-chip-bg")).not.toBeNull();
    expect(labels[0].querySelector("text.rf-label")).toHaveTextContent("no match: no model called");
    expect(css).toMatch(/\.rf-chip-bg\s*\{[^}]*fill:\s*var\(--surface\)/);
  });

  it("the label is centred on the lowest point of the no-match curve", () => {
    view();
    const d = document.querySelector('[data-edge="r-a"]')!.getAttribute("d")!;
    const text = document.querySelector(".rf-chip text")!;
    const x = Number(text.getAttribute("x"));
    const y = Number(text.getAttribute("y")) - 4; // the baseline sits 4 below the chip centre
    const [x0, y0, cx, cy, , , x1] = d.match(/-?\d+/g)!.map(Number);
    expect(x).toBe((x0 + x1) / 2);
    expect(Math.abs(y - (2 * y0 + 6 * cy) / 8)).toBeLessThanOrEqual(1); // a cubic with both controls at height cy bottoms out there at t = ½
    expect(cx).toBe(x0);
  });
});
