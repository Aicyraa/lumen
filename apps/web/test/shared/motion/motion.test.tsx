import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountUp, Reveal } from "../../../src/shared/motion/motion";

// The test setup reports prefers-reduced-motion: reduce, so this is the reduced-motion path.
describe("motion helpers under prefers-reduced-motion", () => {
  it("CountUp shows the final number at once", () => {
    render(
      <span data-testid="n">
        <CountUp value={12345} />
      </span>,
    );
    expect(screen.getByTestId("n")).toHaveTextContent("12,345");
  });
  it("Reveal renders its content visible, with no hidden starting state", () => {
    render(
      <Reveal>
        <p>always readable</p>
      </Reveal>,
    );
    const el = screen.getByText("always readable").parentElement!;
    expect(el.getAttribute("style") ?? "").not.toMatch(/opacity:\s*0/);
  });
});
