import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../src/app/ErrorBoundary";

const Boom = (): never => {
  throw new Error("secret-token-123 at /internal/stack");
};

describe("ErrorBoundary", () => {
  it("shows a visible alert with a reload button and no stack or error text when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/something went wrong/i);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("secret-token-123");
    expect(document.body.textContent).not.toMatch(/\bat \//);
  });
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>fine</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("fine")).toBeInTheDocument();
  });
});
