import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

import { Docs } from "../../../src/features/docs/Docs";

describe("Docs provider rate limit", () => {
  it("lists 429 provider_rate_limited in the errors table and the Retry-After header in Limits", () => {
    render(
      <MemoryRouter>
        <Docs />
      </MemoryRouter>,
    );
    const errors = document.getElementById("errors") as HTMLElement;
    const row = within(errors).getByText("provider_rate_limited").parentElement;
    expect(row).toHaveTextContent("429");
    expect(row).toHaveTextContent(/Retry-After header and retry_after_seconds say how long to wait/);
    const limits = document.getElementById("limits") as HTMLElement;
    expect(within(limits).getByText("Retry-After")).toBeInTheDocument();
    expect(limits).toHaveTextContent("provider_rate_limited");
  });
});
