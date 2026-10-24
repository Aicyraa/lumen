import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
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

const view = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("Docs layout", () => {
  it("has a table of contents with a link to every grouped section, and the sections exist", () => {
    view(<Docs />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    const wanted = [
      "Getting started",
      "Authentication",
      "Chat",
      "Documents",
      "Feedback",
      "Errors",
      "Limits",
    ];
    expect(
      within(toc)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(wanted);
    for (const l of within(toc).getAllByRole("link")) {
      const id = l.getAttribute("href")!.slice(1);
      expect(document.getElementById(id)).not.toBeNull();
      expect(document.getElementById(id)!.tagName).toBe("SECTION");
    }
  });

  it("scroll-spy marks the section in view as current in the table of contents", () => {
    view(<Docs />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(within(toc).getByRole("link", { name: "Getting started" })).toHaveAttribute(
      "aria-current",
      "true",
    ); // first by default
    const errors = document.getElementById("errors")!;
    act(() =>
      observers.forEach((o) => {
        o.cb([{ target: errors, isIntersecting: true }]);
      }),
    );
    expect(within(toc).getByRole("link", { name: "Errors" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(toc).getByRole("link", { name: "Getting started" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("code blocks are copyable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    view(<Docs />);
    const first = screen.getAllByRole("button", { name: "Copy code" })[0];
    await userEvent.click(first);
    expect(writeText.mock.calls[0][0]).toContain("curl");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("has an error-code table, a Limits section that quotes no numbers of its own, and a readable content column", () => {
    view(<Docs />);
    const limits = document.getElementById("limits")!;
    const text = limits.querySelector("p")!.textContent!;
    expect(text).toMatch(/usage/i);
    expect(text).not.toMatch(/\d+\s*(requests|documents|MB|per)/i); // no limit values of its own (status codes are fine)
    expect(screen.getByRole("table", { name: "Error codes" })).toBeInTheDocument();
    expect(document.querySelector(".doc-content")).not.toBeNull();
    expect(document.querySelector(".doc-toc")).not.toBeNull();
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
