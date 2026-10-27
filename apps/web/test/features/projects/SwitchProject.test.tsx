import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwitchProject } from "../../../src/features/projects/SwitchProject";
import { renderWithProviders } from "../../helpers";

const link = () => screen.getByRole("link", { name: "Switch project" });
const tip = () => screen.getByRole("tooltip", { hidden: true });

describe("SwitchProject", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is a link to Projects described by a tooltip that is hidden until needed", () => {
    renderWithProviders(<SwitchProject />);
    expect(link()).toHaveAttribute("href", "/projects");
    expect(link()).toHaveAttribute("aria-describedby", tip().id);
    expect(tip()).toHaveTextContent("Switch project");
    expect(tip()).toHaveTextContent("Open your projects");
    expect(tip()).not.toBeVisible();
  });

  it("shows after a short delay on hover and hides when the pointer leaves", () => {
    renderWithProviders(<SwitchProject />);
    fireEvent.mouseEnter(link());
    expect(tip()).not.toBeVisible();
    act(() => vi.advanceTimersByTime(500));
    expect(tip()).toBeVisible();
    fireEvent.mouseLeave(link().parentElement as HTMLElement);
    expect(tip()).not.toBeVisible();
  });

  it("shows after the delay on keyboard focus and hides on blur", () => {
    renderWithProviders(<SwitchProject />);
    act(() => link().focus());
    expect(tip()).not.toBeVisible();
    act(() => vi.advanceTimersByTime(500));
    expect(tip()).toBeVisible();
    act(() => link().blur());
    expect(tip()).not.toBeVisible();
  });

  it("does not show when the pointer leaves before the delay ends", () => {
    renderWithProviders(<SwitchProject />);
    fireEvent.mouseEnter(link());
    fireEvent.mouseLeave(link().parentElement as HTMLElement);
    act(() => vi.advanceTimersByTime(1000));
    expect(tip()).not.toBeVisible();
  });

  it("Escape dismisses it while the link keeps focus", () => {
    renderWithProviders(<SwitchProject />);
    act(() => link().focus());
    act(() => vi.advanceTimersByTime(500));
    fireEvent.keyDown(link(), { key: "Escape" });
    expect(tip()).not.toBeVisible();
    expect(link()).toHaveFocus();
  });
});
