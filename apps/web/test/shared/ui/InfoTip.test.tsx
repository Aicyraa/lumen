import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InfoTip } from "../../../src/shared/ui/InfoTip";

const setup = () =>
  render(<InfoTip label="About the cheap tier">Easy questions, tried top to bottom.</InfoTip>);

describe("InfoTip", () => {
  it("is a labelled button described by a tooltip that is hidden until needed", () => {
    setup();
    const btn = screen.getByRole("button", { name: "About the cheap tier" });
    const tip = document.getElementById(btn.getAttribute("aria-describedby")!)!;
    expect(tip).toHaveAttribute("role", "tooltip");
    expect(tip).toHaveTextContent("Easy questions, tried top to bottom.");
    expect(tip).not.toBeVisible();
  });

  it("shows on keyboard focus and hides on blur", async () => {
    setup();
    await userEvent.tab();
    expect(screen.getByRole("tooltip")).toBeVisible();
    await userEvent.tab();
    expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
  });

  it("shows on hover and hides when the pointer leaves", async () => {
    setup();
    const btn = screen.getByRole("button", { name: "About the cheap tier" });
    await userEvent.hover(btn);
    expect(screen.getByRole("tooltip")).toBeVisible();
    await userEvent.unhover(btn);
    expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
  });

  it("Escape closes it while the button keeps focus", async () => {
    setup();
    await userEvent.tab();
    expect(screen.getByRole("tooltip")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
    expect(screen.getByRole("button", { name: "About the cheap tier" })).toHaveFocus();
  });
});
