import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/shared/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: null, isPending: false }) } }));

import { Home } from "../../../src/features/home/Home";

describe("Home layout", () => {
  it("turns on CSS scroll-snap for the page while it is shown and turns it off when it leaves", () => {
    const { unmount } = render(<MemoryRouter><Home /></MemoryRouter>);
    expect(document.documentElement.classList.contains("snap-home")).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("snap-home")).toBe(false);
  });

  it("is made of full-screen snap sections (hero, preview, how it works, demo, quickstart, built in, security, closing)", () => {
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>);
    const sections = Array.from(container.querySelectorAll("main > section"));
    expect(sections.length).toBeGreaterThanOrEqual(8);
    for (const s of sections) expect(s.classList.contains("snap-section")).toBe(true);
    expect(sections[0].classList.contains("hero")).toBe(true);
  });

  it("keeps the screenshot placeholder out of the hero so it cannot push the headline, text and buttons off screen", () => {
    const { container } = render(<MemoryRouter><Home /></MemoryRouter>);
    const hero = container.querySelector("main > section.hero")!;
    expect(hero.querySelector(".image-slot")).toBeNull();
    expect(hero.querySelector("h1")).not.toBeNull();
    expect(hero.querySelectorAll("a.btn").length).toBe(2);
    expect(container.querySelector(".image-slot")).not.toBeNull();
  });
});
