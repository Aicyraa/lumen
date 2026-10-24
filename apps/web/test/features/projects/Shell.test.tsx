import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
let getSessionImpl: () => unknown = () => Promise.resolve({ data: null });
let signOutImpl: () => unknown = () => signOut(); // a plain function: vitest 5 flags a vi.fn that throws or rejects
vi.mock("../../../src/features/auth/session", () => ({ useOrgId: () => "o1" }));
vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { id: "u1", email: "maya@campus.test", name: "Maya" },
        session: { activeOrganizationId: "o1" },
      },
      isPending: false,
    }),
    useActiveOrganization: () => ({ data: { id: "o1", name: "Maya's workspace" } }),
    signOut: () => signOutImpl(),
    getSession: () => getSessionImpl(),
  },
}));

import { ProjectContext } from "../../../src/features/projects/projectsContext";
import { Shell } from "../../../src/features/projects/Shell";
import { mockFetch, renderWithProviders } from "../../helpers";

const PROJECT = {
  id: "o1",
  name: "Maya's workspace",
  slug: "mayas",
  description: null,
  role: "owner" as const,
  created_at: "2026-10-24T08:00:00Z",
  documents: 0,
  requests_this_month: 0,
};
const tree = (extra?: React.ReactNode) => (
  <Routes>
    {extra}
    <Route path="/" element={<div>public home</div>} />
    <Route
      path="/projects/:slug"
      element={
        <ProjectContext.Provider value={PROJECT}>
          <Shell />
        </ProjectContext.Provider>
      }
    >
      <Route path="documents" element={<div>docs page</div>} />
    </Route>
  </Routes>
);
const usage = {
  documents: { used: 0, max: 1 },
  requests_per_minute: { used: 0, max: 1 },
  requests_per_minute_x: 0,
  requests_this_month: { used: 0, max: 1 },
};
const handler = (url: string) => (url.endsWith("/workspaces") ? { workspaces: [PROJECT] } : usage);

describe("Shell", () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue({ data: { success: true } });
    signOutImpl = () => signOut();
    getSessionImpl = () => Promise.resolve({ data: null });
  });

  it("lists the tabs in the required order, the workspace chip and the usage meters", async () => {
    mockFetch(handler);
    renderWithProviders(tree(), { route: "/projects/mayas/documents" });
    const nav = screen.getByRole("navigation", { name: "Dashboard" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent?.replace(/\d+$/, "")),
    ).toEqual(["Documents", "API keys", "Try it", "Analytics", "Requests", "Models", "Settings"]);
    expect(screen.getByText("docs page")).toBeInTheDocument();
    expect(screen.getAllByText("Maya's workspace").length).toBeGreaterThan(0); // switcher option and chip
    expect(screen.getByText("maya@campus.test")).toBeInTheDocument();
    expect(await screen.findByRole("meter", { name: "Documents" })).toBeInTheDocument();
  });

  it("signs out and leaves the dashboard", async () => {
    mockFetch(handler);
    renderWithProviders(tree(), { route: "/projects/mayas/documents" });
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByText("public home")).toBeInTheDocument();
  });

  const mount = () => {
    mockFetch(handler);
    const r = renderWithProviders(tree(), { route: "/projects/mayas/documents" });
    r.client.setQueryData(["documents", "o1"], [{ filename: "a-secret.md" }]);
    return r;
  };

  it.each([
    [
      "signOut rejects",
      () => {
        signOutImpl = () => Promise.reject(new Error("network down"));
      },
    ],
    [
      "signOut returns an error",
      () => {
        signOutImpl = () => Promise.resolve({ data: null, error: { message: "nope" } });
      },
    ],
    [
      "the session still exists afterwards",
      () => {
        getSessionImpl = () => Promise.resolve({ data: { user: { id: "u" } } });
      },
    ],
  ])(
    "does not pretend sign-out worked when %s: clears the cache, stays, shows an alert with retry",
    async (_n, setup) => {
      setup();
      const { client } = mount();
      await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not sign out, please try again",
      );
      expect(screen.getByText("docs page")).toBeInTheDocument(); // still on the dashboard
      expect(screen.queryByText("public home")).not.toBeInTheDocument();
      expect(
        JSON.stringify(
          client
            .getQueryCache()
            .getAll()
            .map((q) => q.state.data),
        ),
      ).not.toContain("a-secret.md");
      // retry succeeds and leaves
      signOutImpl = () => signOut();
      getSessionImpl = () => Promise.resolve({ data: null });
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByText("public home")).toBeInTheDocument();
    },
  );
});
