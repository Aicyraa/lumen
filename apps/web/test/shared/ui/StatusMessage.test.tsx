import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StatusMessage } from "../../../src/shared/ui/StatusMessage";

describe("StatusMessage", () => {
  it("announces loading politely and has no retry", () => {
    render(<StatusMessage state="loading">Loading documents…</StatusMessage>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading documents…");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the empty state as a status", () => {
    render(<StatusMessage state="empty">No documents yet. Upload one to start.</StatusMessage>);
    expect(screen.getByRole("status")).toHaveTextContent("No documents yet");
  });

  it("shows an error as an alert with a Retry button that calls onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <StatusMessage state="error" onRetry={onRetry}>
        Could not load documents.
      </StatusMessage>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load documents.");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("is centred in the content area via the status-msg class", () => {
    render(<StatusMessage state="empty">Nothing here</StatusMessage>);
    expect(screen.getByRole("status")).toHaveClass("status-msg");
  });
});
