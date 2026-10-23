import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

// useSession can return odd shapes when the API is down or answers with an error body. Nothing may throw.
let result: unknown;
const refetch = vi.fn();
vi.mock("./lib/auth-client", () => ({
  authClient: { useSession: () => result, useActiveOrganization: () => ({ data: null }), signIn: { social: vi.fn(), email: vi.fn() }, signUp: { email: vi.fn() }, signOut: vi.fn(), getSession: vi.fn(), apiKey: { list: vi.fn().mockResolvedValue({ data: { apiKeys: [] } }) } },
}));

import { ApiKeys } from "./pages/dashboard/ApiKeys";
import { Home } from "./pages/Home";
import { RequireSession } from "./components/RequireSession";
import { SessionCacheGuard } from "./components/SessionCacheGuard";
import { Shell } from "./pages/dashboard/Shell";
import { ProjectContext } from "./lib/projects";
import { SignIn } from "./pages/SignIn";
import { useOrgId } from "./lib/session";

const good = { data: { user: { id: "u1", email: "a@b.test" }, session: { activeOrganizationId: "o1" } }, isPending: false, error: null };
const SHAPES: [string, unknown][] = [
  ["null", null], ["{}", {}], ["{ data: {} }", { data: {} }], ["{ user: undefined }", { data: { user: undefined, session: { activeOrganizationId: "o" } } }],
["a body without user or session", { data: { error: "x", message: "bad gateway" } }],
];
const wrap = (ui: React.ReactElement, route = "/") => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></QueryClientProvider>
);
const Probe = () => <div>org:[{useOrgId()}]</div>;
const dash = (
  <Routes>
    <Route path="/signin" element={<div>sign-in page</div>} />
    <Route element={<RequireSession />}><Route path="/dashboard" element={<div>dashboard secret</div>} /></Route>
  </Routes>
);

describe("odd useSession shapes never throw", () => {
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

  it.each(SHAPES)("%s: guard, org id, public pages and sign-in render; the dashboard redirects to /signin", (_n, shape) => {
    result = shape;
    render(wrap(<><SessionCacheGuard /><Probe /><Home /></>));
    expect(screen.getByText("org:[]")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    render(wrap(<SignIn />, "/signin"));
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    render(wrap(dash, "/dashboard"));
    expect(screen.getByText("sign-in page")).toBeInTheDocument();
    expect(screen.queryByText("dashboard secret")).not.toBeInTheDocument();
  });

  it("a user whose session has no organization renders without throwing (and must not redirect-loop with sign-in)", () => {
    result = { data: { user: { id: "u1" }, session: undefined }, isPending: false };
    render(wrap(<><SessionCacheGuard /><Probe /></>));
    expect(screen.getByText("org:[]")).toBeInTheDocument();
    render(wrap(dash, "/dashboard"));
    expect(screen.getByText("dashboard secret")).toBeInTheDocument();
    render(wrap(<Routes><Route path="/signin" element={<SignIn />} /><Route path="/projects" element={<div>dashboard home</div>} /></Routes>, "/signin"));
    expect(screen.getByText("dashboard home")).toBeInTheDocument();
  });

  it("Shell and API keys tolerate a session without a user", () => {
    result = { data: { session: { activeOrganizationId: "o" } }, isPending: false };
    render(wrap(<Routes><Route path="/dashboard" element={<ProjectContext.Provider value={{ id: "o", name: "P", slug: "p", description: null, role: "owner", created_at: "2026-10-24T08:00:00Z", documents: 0, requests_this_month: 0 }}><Shell /></ProjectContext.Provider>}><Route index element={<ApiKeys />} /></Route></Routes>, "/dashboard"));
    expect(screen.getByRole("navigation", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("pending shows nothing for the dashboard and no redirect", () => {
    result = { data: null, isPending: true, error: null };
    render(wrap(dash, "/dashboard"));
    expect(screen.queryByText("sign-in page")).not.toBeInTheDocument();
    expect(screen.queryByText("dashboard secret")).not.toBeInTheDocument();
  });

  it("an error result (API unreachable) shows a retry state on the dashboard instead of redirecting", async () => {
    result = { data: null, isPending: false, error: { status: 0, message: "Failed to fetch" }, refetch };
    render(wrap(dash, "/dashboard"));
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach the server");
    expect(screen.queryByText("sign-in page")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("a good session still reaches the dashboard", () => {
    result = good;
    render(wrap(dash, "/dashboard"));
    expect(screen.getByText("dashboard secret")).toBeInTheDocument();
  });
});
