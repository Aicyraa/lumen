import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useInViewOnce } from "../../../src/shared/motion/useInViewOnce";
import { fire, installFakeIntersectionObserver, observers } from "./fakeIntersectionObserver";

let restore: () => void;
beforeEach(() => {
  restore = installFakeIntersectionObserver();
});
afterEach(() => restore());

function Probe() {
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="p" data-seen={String(seen)}>
      x
    </div>
  );
}
describe("useInViewOnce", () => {
  it("is false on load, becomes true when the element enters the viewport and stays true", () => {
    render(<Probe />);
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "false");
    fire(false);
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "false");
    fire(true);
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "true");
    fire(false); // leaving does not undo it: once only
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "true");
  });

  it("stops observing after the first time", () => {
    render(<Probe />);
    fire(true);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("is true at once when there is no IntersectionObserver (nothing stays hidden)", () => {
    (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    render(<Probe />);
    expect(screen.getByTestId("p")).toHaveAttribute("data-seen", "true");
  });
});
