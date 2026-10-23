import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
vi.mock("../../lib/session", () => ({ useOrgId: () => "o1" }));
vi.mock("../../lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { email: "maya@campus.test", name: "Maya" }, session: { activeOrganizationId: "o1" } }, isPending: false }),
    useActiveOrganization: () => ({ data: { id: "o1", name: "Maya's workspace" } }),
    signOut: () => signOut(),
  },
}));

import { mockFetch, renderWithProviders } from "../../test/helpers";
import { Shell } from "./Shell";

describe("Shell", () => {
  beforeEach(() => signOut.mockReset().mockResolvedValue({ data: { success: true } }));

  it("lists the tabs in the required order, the workspace chip and the usage meters", async () => {
    mockFetch(() => ({ documents: { used: 1, max: 5 }, requests_per_minute: { used: 0, max: 5 }, requests_this_month: { used: 0, max: 5 } }));
    renderWithProviders(<Routes><Route path="/dashboard" element={<Shell />}><Route path="documents" element={<div>docs page</div>} /></Route></Routes>, { route: "/dashboard/documents" });
    const nav = screen.getByRole("navigation", { name: "Dashboard" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent?.replace(/\d+$/, ""))).toEqual(["Documents", "API keys", "Try it", "Analytics", "Requests", "Models"]);
    expect(screen.getByText("docs page")).toBeInTheDocument();
    expect(screen.getByText("Maya's workspace")).toBeInTheDocument();
    expect(screen.getByText("maya@campus.test")).toBeInTheDocument();
    expect(await screen.findByRole("meter", { name: "Documents" })).toBeInTheDocument();
  });

  it("signs out and leaves the dashboard", async () => {
    mockFetch(() => ({ documents: { used: 0, max: 1 }, requests_per_minute: { used: 0, max: 1 }, requests_this_month: { used: 0, max: 1 } }));
    renderWithProviders(<Routes><Route path="/" element={<div>public home</div>} /><Route path="/dashboard" element={<Shell />}><Route path="documents" element={<div>docs page</div>} /></Route></Routes>, { route: "/dashboard/documents" });
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByText("public home")).toBeInTheDocument();
  });

  it("clears every cached query on sign-out, even when signOut rejects", async () => {
    signOut.mockRejectedValue(new Error("network down"));
    mockFetch(() => ({ documents: { used: 0, max: 1 }, requests_per_minute: { used: 0, max: 1 }, requests_this_month: { used: 0, max: 1 } }));
    const { client } = renderWithProviders(<Routes><Route path="/" element={<div>public home</div>} /><Route path="/dashboard" element={<Shell />}><Route path="documents" element={<div>docs page</div>} /></Route></Routes>, { route: "/dashboard/documents" });
    client.setQueryData(["documents", "o1"], [{ filename: "a-secret.md" }]);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0));
    expect(await screen.findByText("public home")).toBeInTheDocument();
  });
});
