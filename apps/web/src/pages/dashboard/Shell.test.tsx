import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
let getSessionImpl: () => unknown = () => Promise.resolve({ data: null });
let signOutImpl: () => unknown = () => signOut(); // a plain function: vitest 5 flags a vi.fn that throws or rejects
vi.mock("../../lib/session", () => ({ useOrgId: () => "o1" }));
vi.mock("../../lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { email: "maya@campus.test", name: "Maya" }, session: { activeOrganizationId: "o1" } }, isPending: false }),
    useActiveOrganization: () => ({ data: { id: "o1", name: "Maya's workspace" } }),
    signOut: () => signOutImpl(),
    getSession: () => getSessionImpl(),
  },
}));

import { mockFetch, renderWithProviders } from "../../test/helpers";
import { Shell } from "./Shell";

describe("Shell", () => {
  beforeEach(() => { signOut.mockReset().mockResolvedValue({ data: { success: true } }); signOutImpl = () => signOut(); getSessionImpl = () => Promise.resolve({ data: null }); });

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

  const mount = () => {
    mockFetch(() => ({ documents: { used: 0, max: 1 }, requests_per_minute: { used: 0, max: 1 }, requests_this_month: { used: 0, max: 1 } }));
    const r = renderWithProviders(<Routes><Route path="/" element={<div>public home</div>} /><Route path="/dashboard" element={<Shell />}><Route path="documents" element={<div>docs page</div>} /></Route></Routes>, { route: "/dashboard/documents" });
    r.client.setQueryData(["documents", "o1"], [{ filename: "a-secret.md" }]);
    return r;
  };

  it.each([
    ["signOut rejects", () => { signOutImpl = () => Promise.reject(new Error("network down")); }],
    ["signOut returns an error", () => { signOutImpl = () => Promise.resolve({ data: null, error: { message: "nope" } }); }],
    ["the session still exists afterwards", () => { getSessionImpl = () => Promise.resolve({ data: { user: { id: "u" } } }); }],
  ])("does not pretend sign-out worked when %s: clears the cache, stays, shows an alert with retry", async (_n, setup) => {
    setup();
    const { client } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out, please try again");
    expect(screen.getByText("docs page")).toBeInTheDocument(); // still on the dashboard
    expect(screen.queryByText("public home")).not.toBeInTheDocument();
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain("a-secret.md");
    // retry succeeds and leaves
    signOutImpl = () => signOut(); getSessionImpl = () => Promise.resolve({ data: null });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("public home")).toBeInTheDocument();
  });
});
