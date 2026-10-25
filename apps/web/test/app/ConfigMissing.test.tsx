import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfigMissing } from "../../src/app/ConfigMissing";

describe("ConfigMissing", () => {
  it("shows a visible alert naming the missing variable", () => {
    render(<ConfigMissing message="VITE_API_URL is not set." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Missing VITE_API_URL");
  });
});
