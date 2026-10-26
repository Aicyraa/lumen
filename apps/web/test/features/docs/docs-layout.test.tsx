import { readFileSync } from "node:fs";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

import { Docs } from "../../../src/features/docs/Docs";
import { Privacy } from "../../../src/features/docs/Privacy";

type Entry = { target: Element; isIntersecting: boolean };
let observers: { cb: (e: Entry[]) => void; els: Element[]; opts?: IntersectionObserverInit }[] = [];
const original = window.IntersectionObserver;

beforeEach(() => {
  observers = [];
  class FakeIO {
    els: Element[] = [];
    constructor(
      public cb: (e: Entry[]) => void,
      public opts?: IntersectionObserverInit,
    ) {
      observers.push(this);
    }
    observe(el: Element) {
      this.els.push(el);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
});
afterEach(() => {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = original;
});

function Where() {
  return <div data-testid="hash">{useLocation().hash}</div>;
}
const view = (ui: React.ReactElement, route = "/") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
      <Where />
    </MemoryRouter>,
  );
const NAMES = [
  "Getting started",
  "Authentication",
  "Chat",
  "Documents",
  "Feedback",
  "Errors",
  "Limits",
];

describe("Docs page", () => {
  it("is one scrolling page like Privacy: a table of contents with one link per section, in order, and every section on the page", () => {
    view(<Docs />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    const links = within(toc).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(NAMES);
    for (const l of links) expect(document.getElementById(l.getAttribute("href")!.slice(1))).toBeVisible();
    expect(links[0]).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });

  it("marks the section in view as current in the table of contents", () => {
    view(<Docs />);
    const links = within(screen.getByRole("navigation", { name: "On this page" })).getAllByRole(
      "link",
    );
    const target = document.getElementById("errors")!;
    act(() =>
      observers.forEach((o) => {
        o.cb([{ target, isIntersecting: true }]);
      }),
    );
    expect(links[5]).toHaveAttribute("aria-current", "true");
    expect(links[0]).not.toHaveAttribute("aria-current");
  });

  it("has the same head as Privacy: a label, the title as the page heading, a lead, and the page title", () => {
    const { container } = view(<Docs />);
    expect(screen.getByRole("heading", { level: 1, name: "API reference" })).toHaveClass("doc-h1");
    expect(screen.getByText("DOCS", { selector: ".label" })).toBeInTheDocument();
    expect(container.querySelector(".doc-content > .lead")).not.toBeNull();
    expect(document.title).toBe("API reference · Lumen");
  });

  it("scrolls inside the same long page, with room at the bottom so Limits can become current", () => {
    view(<Docs />);
    expect(document.querySelector(".doc-scroll")).toHaveClass("doc-spy");
  });
});

describe("Privacy scroll-spy", () => {
  it("marks the section in view as current in the table of contents", () => {
    view(<Privacy />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    const links = within(toc).getAllByRole("link");
    expect(links[0]).toHaveAttribute("aria-current", "true"); // first by default
    const target = document.getElementById(links[3].getAttribute("href")!.slice(1))!;
    act(() =>
      observers.forEach((o) => {
        o.cb([{ target, isIntersecting: true }]);
      }),
    );
    expect(links[3]).toHaveAttribute("aria-current", "true");
    expect(links[0]).not.toHaveAttribute("aria-current");
  });
});

describe("current-section indicator", () => {
  it("Docs: the lime line sits on the first entry and follows the section in view", () => {
    view(<Docs />);
    const links = within(screen.getByRole("navigation", { name: "On this page" })).getAllByRole(
      "link",
    );
    expect(links[0].querySelector(".toc-ind")).not.toBeNull();
    const target = document.getElementById("limits")!;
    act(() =>
      observers.forEach((o) => {
        o.cb([{ target, isIntersecting: true }]);
      }),
    );
    expect(links[6].querySelector(".toc-ind")).not.toBeNull();
    expect(document.querySelectorAll(".toc-ind")).toHaveLength(1);
  });

  it("Privacy: the lime line follows the section in view", () => {
    view(<Privacy />);
    const links = within(screen.getByRole("navigation", { name: "On this page" })).getAllByRole(
      "link",
    );
    const target = document.getElementById(links[6].getAttribute("href")!.slice(1))!;
    act(() =>
      observers.forEach((o) => {
        o.cb([{ target, isIntersecting: true }]);
      }),
    );
    expect(links[6].querySelector(".toc-ind")).not.toBeNull();
    expect(document.querySelectorAll(".toc-ind")).toHaveLength(1);
  });

  it("the Privacy page can scroll its last sections up into the scroll-spy band, and the scrollbar keeps clear of the content", () => {
    view(<Privacy />);
    expect(document.querySelector(".doc-scroll")).toHaveClass("doc-spy");
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    expect(css).toMatch(/\.doc-spy\s*\{[^}]*padding-bottom:\s*50dvh/);
    expect(css).toMatch(/\.doc-scroll\s*\{[^}]*padding:[^;]*\s2\dpx\s\d+px\s0;/);
    expect(css).toMatch(/\.doc-content table\.data\s*\{[^}]*min-width:\s*0/);
  });
});

describe("Docs content", () => {
  it("code blocks are copyable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    view(<Docs />);
    const first = screen.getAllByRole("button", { name: "Copy code" })[0];
    await userEvent.click(first);
    expect(writeText.mock.calls[0][0]).toContain("curl");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("code blocks are terminal windows: dots, a language title, line numbers by CSS and syntax colours", () => {
    view(<Docs />);
    const first = document.querySelector(".term")!;
    expect(first.querySelector(".term-dots")).not.toBeNull();
    expect(first.querySelector(".term-title")).toHaveTextContent("bash");
    expect(first.querySelector("pre.code")).toHaveAttribute("data-lang", "bash");
    expect(first.querySelector(".tk-kw")).toHaveTextContent("curl");
    expect(first.querySelector(".tk-flag")).toHaveTextContent("-X");
    expect(first.querySelector(".tk-var")).toHaveTextContent("$LUMEN_URL");
    expect(first.querySelectorAll(".ln")).toHaveLength(4);
    const langs = [...document.querySelectorAll(".term-title")].map((e) => e.textContent);
    expect(langs).toContain("http");
    expect(langs).toContain("json");
  });

  it("a refused clipboard write shows a manual-copy message, not Copied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    view(<Docs />);
    await userEvent.click(screen.getAllByRole("button", { name: "Copy code" })[0]);
    expect(await screen.findByText(/Copy failed, select and copy manually/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  });

  it("has an error-code table, a Limits section that quotes no numbers of its own, and a readable content column", async () => {
    view(<Docs />, "/docs#limits");
    const limits = document.getElementById("limits")!;
    const text = limits.querySelector("p")!.textContent!;
    expect(text).toMatch(/usage/i);
    expect(text).not.toMatch(/\d+\s*(requests|documents|MB|per)/i); // no limit values of its own (status codes are fine)
    expect(document.querySelector(".doc-content")).not.toBeNull();
  });

  it("lists 429 provider_rate_limited in the errors table and the Retry-After header in Limits", () => {
    view(<Docs />);
    const errors = document.getElementById("errors") as HTMLElement;
    const row = within(errors).getByText("provider_rate_limited").parentElement;
    expect(row).toHaveTextContent("429");
    expect(row).toHaveTextContent(/Retry-After header and retry_after_seconds say how long to wait/);
    const limits = document.getElementById("limits") as HTMLElement;
    expect(within(limits).getByText("Retry-After")).toBeInTheDocument();
    expect(limits).toHaveTextContent("provider_rate_limited");
  });
});

describe("Privacy layout", () => {
  it("uses the same layout with its own table of contents", () => {
    view(<Privacy />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(within(toc).getAllByRole("link").length).toBeGreaterThanOrEqual(5);
    expect(document.querySelector(".doc-content")).not.toBeNull();
  });

  it("never mentions a fallback model", () => {
    view(<Docs />);
    expect(document.body.textContent).not.toMatch(/fallback/i);
  });
});

describe("full-height layout: only the content region scrolls", () => {
  it("Docs: the public shell fills the screen and the labelled, focusable content region scrolls", () => {
    const { container } = view(<Docs />);
    expect(container.querySelector(".public")).toHaveClass("public-fill");
    const region = screen.getByRole("region", { name: "API reference content" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("doc-scroll");
    expect(region.querySelector("section#getting-started")).not.toBeNull();
    const pub = container.querySelector(".public")!;
    expect(pub.querySelector("header.pub-nav")).not.toBeNull();
    expect(pub.lastElementChild!.tagName).toBe("FOOTER"); // footer last: stays at the bottom of the screen
  });

  it("Privacy has the same layout", () => {
    const { container } = view(<Privacy />);
    expect(container.querySelector(".public")).toHaveClass("public-fill");
    const region = screen.getByRole("region", { name: /content$/ });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("doc-scroll");
    expect(container.querySelector(".public")!.lastElementChild!.tagName).toBe("FOOTER");
  });

  it("the CSS makes the shell non-scrolling and the region the only scroller, with a visible focus style", () => {
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    expect(css).toMatch(/\.public-fill\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.doc-scroll\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.doc-scroll:focus-visible\s*\{[^}]*outline/);
  });

  it("the scroll-spy watches the inner scroller (not the window) and anchors sit 16px below its top", () => {
    view(<Privacy />);
    const scroller = document.querySelector(".doc-scroll");
    expect(scroller).not.toBeNull();
    expect(observers.length).toBeGreaterThan(0);
    for (const o of observers) expect(o.opts?.root).toBe(scroller);
    const css = readFileSync("src/shared/styles/styles.css", "utf8");
    expect(css).toMatch(/\.doc-content section\s*\{[^}]*scroll-margin-top:\s*16px/);
  });
});
