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
let observers: { cb: (e: Entry[]) => void; els: Element[] }[] = [];
const original = window.IntersectionObserver;

beforeEach(() => {
  observers = [];
  class FakeIO {
    els: Element[] = [];
    constructor(public cb: (e: Entry[]) => void) {
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

describe("Docs tabs", () => {
  it("has one tab per section, in order, with the first selected and exactly one panel visible", () => {
    view(<Docs />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(NAMES);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs.slice(1).every((t) => t.getAttribute("aria-selected") === "false")).toBe(true);
    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAccessibleName("Getting started");
    expect(tabs[0]).toHaveAttribute("aria-controls", panels[0].id);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("selecting a tab shows only its panel and puts the section in the URL hash", async () => {
    view(<Docs />);
    await userEvent.click(screen.getByRole("tab", { name: "Errors" }));
    expect(screen.getByTestId("hash")).toHaveTextContent("#errors");
    expect(screen.getByRole("tab", { name: "Errors" })).toHaveAttribute("aria-selected", "true");
    const panels = screen.getAllByRole("tabpanel");
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAccessibleName("Errors");
    expect(screen.getByRole("table", { name: "Error codes" })).toBeInTheDocument();
    expect(screen.getByText("Quickstart")).not.toBeVisible();
  });

  it("opens the tab named in the hash, so links work (also in the page's own URL)", () => {
    view(<Docs />, "/docs#chat");
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tabpanel")[0]).toHaveAccessibleName("Chat");
  });

  it("falls back to the first tab for an unknown hash", () => {
    view(<Docs />, "/docs#nope");
    expect(screen.getByRole("tab", { name: "Getting started" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("is keyboard operable: arrows, Home and End move focus and select; only the selected tab is in the tab order", async () => {
    view(<Docs />);
    const user = userEvent.setup();
    const tab = (n: string) => screen.getByRole("tab", { name: n });
    expect(tab("Getting started")).toHaveAttribute("tabindex", "0");
    expect(tab("Chat")).toHaveAttribute("tabindex", "-1");
    tab("Getting started").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Authentication")).toHaveFocus();
    expect(tab("Authentication")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(tab("Chat")).toHaveFocus();
    await user.keyboard("{End}");
    expect(tab("Limits")).toHaveFocus();
    await user.keyboard("{ArrowRight}"); // wraps
    expect(tab("Getting started")).toHaveFocus();
    await user.keyboard("{ArrowLeft}"); // wraps back
    expect(tab("Limits")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tab("Getting started")).toHaveFocus();
    expect(screen.getByTestId("hash")).toHaveTextContent("#getting-started");
  });

  it("opens directly on the tabs: no visible DOCS / API reference / description block", () => {
    const { container } = view(<Docs />);
    const h1 = screen.getByRole("heading", { level: 1, name: "API reference" });
    expect(h1).toHaveClass("visually-hidden");
    expect(container.querySelector(".doc-h1")).toBeNull();
    expect(container.querySelector(".doc-content > .lead")).toBeNull();
    expect(screen.queryByText(/Everything your chatbot's backend needs/)).toBeNull();
    expect(screen.queryByText("DOCS", { selector: ".label" })).toBeNull();
    expect(document.title).toBe("API reference · Lumen");
  });

  it("has no scroll-spy table of contents any more", () => {
    view(<Docs />);
    expect(screen.queryByRole("navigation", { name: "On this page" })).toBeNull();
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

  it("has an error-code table, a Limits section that quotes no numbers of its own, and a readable content column", async () => {
    view(<Docs />, "/docs#limits");
    const limits = document.getElementById("limits")!;
    const text = limits.querySelector("p")!.textContent!;
    expect(text).toMatch(/usage/i);
    expect(text).not.toMatch(/\d+\s*(requests|documents|MB|per)/i); // no limit values of its own (status codes are fine)
    expect(document.querySelector(".doc-content")).not.toBeNull();
  });
});

describe("Privacy layout", () => {
  it("uses the same layout with its own table of contents", () => {
    view(<Privacy />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(within(toc).getAllByRole("link").length).toBeGreaterThanOrEqual(5);
    expect(document.querySelector(".doc-content")).not.toBeNull();
  });
});
