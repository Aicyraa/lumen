import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Sess = {
  data: {
    user: { id: string; email: string; emailVerified: boolean };
    session: { activeOrganizationId: string | null };
  } | null;
  isPending: boolean;
  error: null;
};
const signedIn = (org: string | null): Sess => ({
  data: {
    user: { id: "u1", email: "maya@x.test", emailVerified: true },
    session: { activeOrganizationId: org },
  },
  isPending: false,
  error: null,
});
let sess: Sess;
const setActive = vi.fn();
const refetch = vi.fn();
vi.mock("../../src/shared/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ ...sess, refetch }),
    useActiveOrganization: () => ({ data: { name: "active" } }),
    organization: { setActive: (a: unknown) => setActive(a) },
    getSession: vi.fn(),
    signOut: vi.fn(),
    signIn: { social: vi.fn(), email: vi.fn() },
    signUp: { email: vi.fn() },
    sendVerificationEmail: vi.fn(),
    apiKey: { list: vi.fn().mockResolvedValue({ data: { apiKeys: [] } }) },
  },
}));

import { App } from "../../src/app/App";
import { mockFetch, reply } from "../helpers";

const P1 = {
  id: "p1",
  name: "My project",
  slug: "my-project",
  description: null,
  role: "owner",
  created_at: "2026-10-24T08:00:00Z",
  documents: 2,
  requests_this_month: 14,
};
const P2 = {
  id: "p2",
  name: "Shop support",
  slug: "shop-support-3fa9c1",
  description: "Orders",
  role: "owner",
  created_at: "2026-10-24T09:00:00Z",
  documents: 0,
  requests_this_month: 0,
};
const usage = {
  documents: { used: 1, max: 5 },
  requests_per_minute: { used: 0, max: 5 },
  requests_this_month: { used: 0, max: 5 },
};

let client: QueryClient;
const mount = (route: string) =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const api =
  (extra?: (url: string, init?: RequestInit) => unknown) => (url: string, init?: RequestInit) => {
    const x = extra?.(url, init);
    if (x !== undefined) return x;
    if (url.endsWith("/workspaces")) return { workspaces: [P1, P2] };
    if (url.endsWith("/usage")) return usage;
    if (url.endsWith("/documents")) return { documents: [] };
    return {};
  };

describe("project routes", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    sess = signedIn("p1");
    setActive.mockReset().mockResolvedValue({ data: {} });
    refetch.mockReset().mockImplementation(async () => {
      sess = signedIn("p2");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("signed out: /projects goes to sign-in", async () => {
    sess = { data: null, isPending: false, error: null };
    mockFetch(api());
    mount("/projects");
    expect(await screen.findByText("Welcome to Lumen")).toBeInTheDocument();
  });

  it.each(["/dashboard", "/dashboard/documents", "/dashboard/models"])(
    "%s redirects to /projects",
    async (route) => {
      mockFetch(api());
      mount(route);
      expect(
        await screen.findByRole("heading", { level: 1, name: "Projects" }),
      ).toBeInTheDocument();
    },
  );

  it("entering another project activates it, re-reads the session without the cookie cache, clears cached data, then shows the page", async () => {
    mockFetch(api());
    client.setQueryData(["documents", "p1"], [{ filename: "p1-secret.md" }]);
    mount("/projects/shop-support-3fa9c1/documents");
    expect(await screen.findByText("Drop files to upload")).toBeInTheDocument();
    expect(setActive).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledWith({ organizationId: "p2" });
    expect(refetch).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("p1-secret.md");
  });

  it("does not re-activate a project that is already active", async () => {
    mockFetch(api());
    mount("/projects/my-project/documents");
    expect(await screen.findByText("Drop files to upload")).toBeInTheDocument();
    expect(setActive).not.toHaveBeenCalled();
  });

  it("an unknown project slug says so and links back to Projects", async () => {
    mockFetch(api());
    mount("/projects/nope/documents");
    expect(await screen.findByText("Project not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All projects" })).toHaveAttribute("href", "/projects");
  });

  it("a failed activation shows an error with retry and does not show the project", async () => {
    setActive.mockResolvedValue({ data: null, error: { status: 403, message: "not a member" } });
    mockFetch(api());
    mount("/projects/shop-support-3fa9c1/documents");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open this project");
    expect(screen.queryByText("Drop files to upload")).not.toBeInTheDocument();
  });

  it("403 no_active_project from the API sends the user to /projects", async () => {
    mockFetch(
      api((url) =>
        url.endsWith("/documents")
          ? reply(403, { error: { code: "no_active_project", message: "Choose a project first." } })
          : undefined,
      ),
    );
    mount("/projects/my-project/documents");
    expect(await screen.findByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument();
  });

  it("sends X-Project-Id on project calls and not on /workspaces", async () => {
    const { calls } = mockFetch(api());
    mount("/projects/my-project/documents");
    expect(await screen.findByText("Drop files to upload")).toBeInTheDocument();
    const header = (path: string) =>
      new Headers(calls.find((c) => c.url.endsWith(path))!.init?.headers).get("x-project-id");
    expect(header("/api/dashboard/documents")).toBe("p1");
    expect(header("/api/dashboard/usage")).toBe("p1");
    expect(header("/api/dashboard/workspaces")).toBeNull();
  });

  it("409 project_mismatch shows a persistent banner with Reload", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    mockFetch(
      api((url) =>
        url.endsWith("/documents")
          ? reply(409, {
              error: { code: "project_mismatch", message: "The active project changed." },
            })
          : undefined,
      ),
    );
    mount("/projects/my-project/documents");
    const banner = await screen.findByText("This tab's project changed in another tab. Reload.");
    expect(banner.closest("[role=alert]")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("the sidebar shows the current project as a plain label and the way to switch is the Projects page", async () => {
    mockFetch(api());
    mount("/projects/my-project/requests");
    const side = await screen.findByRole("complementary");
    expect(within(side).getByText("My project")).toHaveClass("project-label");
    expect(within(side).queryByRole("combobox")).toBeNull();
    expect(within(side).queryByRole("listbox")).toBeNull();
    expect(within(side).queryByRole("link", { name: "Docs" })).toBeNull();
    expect(within(side).getByRole("link", { name: /^Requests/ })).toHaveAttribute(
      "href",
      "/projects/my-project/requests",
    );
    await userEvent.click(within(side).getByRole("link", { name: "Projects" }));
    await userEvent.click(await screen.findByRole("link", { name: /Shop support/ }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ organizationId: "p2" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("complementary")).getByRole("link", {
          name: /^Documents/,
        }),
      ).toHaveAttribute("href", expect.stringContaining("/projects/shop-support-3fa9c1/")),
    );
    expect(within(screen.getByRole("complementary")).getByText("Shop support")).toHaveClass(
      "project-label",
    );
  });
});

describe("lazy routes", () => {
  it("shows an accessible loading status while a page's code loads, then the page", async () => {
    client = new QueryClient();
    mockFetch(() => ({}));
    sess = { data: null, isPending: false, error: null };
    mount("/docs");
    expect(screen.getByRole("status")).toHaveTextContent("Loading page…");
    expect(
      await screen.findByRole("heading", { level: 1, name: "API reference" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading page…")).not.toBeInTheDocument();
  });
});

describe("docs and nav, signed in and out", () => {
  beforeEach(() => {
    client = new QueryClient();
    mockFetch(() => ({}));
  });
  it("/docs is reachable signed out and the nav offers Sign in", async () => {
    sess = { data: null, isPending: false, error: null };
    mount("/docs");
    expect(
      await screen.findByRole("heading", { level: 1, name: "API reference" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Projects" })).not.toBeInTheDocument();
  });
  it("/docs is reachable signed in and the nav shows Projects instead of Sign in", async () => {
    sess = signedIn("p1");
    mount("/docs");
    expect(
      await screen.findByRole("heading", { level: 1, name: "API reference" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
    expect(screen.queryByRole("link", { name: "Get an API key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });
});
