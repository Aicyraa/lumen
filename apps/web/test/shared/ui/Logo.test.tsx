import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Logo } from "../../../src/shared/ui/Logo";

describe("Logo", () => {
  it("renders the SVG mark and the wordmark as one home link, in both variants", () => {
    for (const variant of ["dark", "light"] as const) {
      const { container, unmount } = render(
        <MemoryRouter>
          <Logo variant={variant} />
        </MemoryRouter>,
      );
      const link = screen.getByRole("link", { name: "Lumen home" });
      expect(link).toHaveAttribute("href", "/");
      expect(link).toHaveTextContent("lumen");
      expect(container.querySelectorAll("svg rect")).toHaveLength(3);
      unmount();
    }
  });
});
