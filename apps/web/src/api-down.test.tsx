import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real auth client, with every network call failing: the API is not running.
import { App } from "./App";

const mount = (route: string) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></QueryClientProvider>);

describe("API unreachable", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); })); vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => vi.unstubAllGlobals());

  it.each([["/", /Answers from your documents/], ["/docs", /API reference/], ["/privacy", /What Lumen does with your data/]])("%s renders fully with no API", async (route, heading) => {
    mount(route);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 150)); // give the failed session fetch time to settle
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("/signin renders and shows no error on load, only 'Cannot reach the server' after a failed attempt", async () => {
    mount("/signin");
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.test");
    await user.type(screen.getByLabelText("Password"), "correct horse 123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");
  });

  it("/dashboard shows a retry state, not a blank page or a redirect to sign-in", async () => {
    mount("/dashboard/documents");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach the server"));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });
});

// Vite answers unknown paths with index.html (HTTP 200) when the web origin is used by mistake.
describe("API misconfigured: an HTML answer instead of JSON", () => {
  const html = () => new Response("<!doctype html><html><body>app</body></html>", { status: 200, headers: { "content-type": "text/html" } });
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => vi.unstubAllGlobals());

  it("an HTML get-session answer is not a session: dashboard shows 'Cannot reach the server', public pages render", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html()));
    mount("/dashboard/documents");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot reach the server"));
    expect(screen.queryByText(/Continue with Google/)).not.toBeInTheDocument();
  });

  it("an HTML answer to Continue with Google (wrong origin, 404) says the sign-in server is not reachable (dev builds)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input).includes("get-session") ? new Response("null", { status: 200, headers: { "content-type": "application/json" } }) : new Response("<!doctype html>", { status: 404, headers: { "content-type": "text/html" } }))));
    mount("/signin");
    await userEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in server not reachable (check VITE_API_URL)");
  });

  it("a JSON error from the server is shown as the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => (String(input).includes("get-session") ? new Response("null", { status: 200, headers: { "content-type": "application/json" } }) : new Response(JSON.stringify({ message: "Provider not found", code: "PROVIDER_NOT_FOUND" }), { status: 404, headers: { "content-type": "application/json" } }))));
    mount("/signin");
    await userEvent.click(await screen.findByRole("button", { name: "Continue with GitHub" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider not found");
  });

  it("the dashboard fetch wrapper treats an HTML 200 as unreachable, not as data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html()));
    const { api } = await import("./lib/api");
    await expect(api("/api/dashboard/usage")).rejects.toMatchObject({ code: "network_error" });
  });
});
