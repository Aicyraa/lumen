import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

const linkSocial = vi.fn();
const signOut = vi.fn();
vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { id: "u1", email: "maya@x.test", name: "Maya" },
        session: { activeOrganizationId: "p1" },
      },
      isPending: false,
    }),
    linkSocial: (a: unknown) => linkSocial(a),
    signOut: () => signOut(),
    getSession: vi.fn(),
  },
}));

import { Account } from "../../../src/features/account/Account";

const body = (over: Record<string, unknown> = {}) => ({
  user: {
    name: "Maya Ortiz",
    email: "maya@x.test",
    email_verified: true,
    image: null,
    created_at: "2026-10-01T08:00:00.000Z",
  },
  providers: [
    { provider: "email", linked_at: "2026-10-01T08:00:00.000Z" },
    { provider: "github", linked_at: "2026-10-05T09:30:00.000Z" },
  ],
  projects: { owned: 2, max: 5 },
  totals: { documents: 12, requests_this_month: 340, api_keys: 3, models: 4 },
  ...over,
});

describe("Account", () => {
  beforeEach(() => {
    linkSocial.mockReset().mockResolvedValue({ data: {} });
    signOut.mockReset().mockResolvedValue({ data: { success: true } });
  });

  it("shows name, email with verification, member since and the totals from /api/dashboard/account", async () => {
    const { calls } = mockFetch(() => body());
    renderWithProviders(<Account />);
    expect(await screen.findByRole("heading", { name: "Maya Ortiz" })).toBeInTheDocument();
    expect(calls[0].url).toContain("/api/dashboard/account");
    expect(screen.getByText("maya@x.test")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText(/Member since/)).toHaveTextContent(/2026/);
    const totals = screen.getByRole("region", { name: "Totals across your projects" });
    for (const [label, n] of [
      ["Documents", "12"],
      ["Requests this month", "340"],
      ["API keys", "3"],
      ["Models", "4"],
    ])
      expect(within(totals).getByText(label).parentElement).toHaveTextContent(n);
    expect(screen.getByText(/2 of 5 projects/)).toBeInTheDocument();
  });

  it("lists sign-in methods with when each was linked, and Link buttons for the rest", async () => {
    mockFetch(() => body());
    renderWithProviders(<Account />);
    const methods = await screen.findByRole("region", { name: "Sign-in methods" });
    const email = within(methods).getByText("Email and password").closest("li")!;
    expect(email).toHaveTextContent(/Linked.*2026/);
    expect(within(methods).getByText("GitHub").closest("li")).toHaveTextContent(/Linked.*2026/);
    expect(within(methods).getByRole("button", { name: "Link Google" })).toBeInTheDocument();
    expect(within(methods).queryByRole("button", { name: "Link GitHub" })).toBeNull();
  });

  it("an unverified email is shown as not verified", async () => {
    mockFetch(() => body({ user: { ...body().user, email_verified: false } }));
    renderWithProviders(<Account />);
    expect(await screen.findByText("Not verified")).toBeInTheDocument();
  });

  it("falls back to the email name when the account has no name", async () => {
    mockFetch(() => body({ user: { ...body().user, name: "" } }));
    renderWithProviders(<Account />);
    expect(await screen.findByRole("heading", { name: "maya" })).toBeInTheDocument();
  });

  it("Link Google starts linking with a callback back to /account", async () => {
    mockFetch(() => body());
    renderWithProviders(<Account />);
    await userEvent.click(await screen.findByRole("button", { name: "Link Google" }));
    expect(linkSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: `${window.location.origin}/account`,
    });
  });

  it("shows why linking failed", async () => {
    mockFetch(() => body({ providers: [{ provider: "email", linked_at: "2026-10-01T08:00:00Z" }] }));
    linkSocial.mockResolvedValue({
      data: null,
      error: { status: 400, message: "Provider is not configured" },
    });
    renderWithProviders(<Account />);
    await userEvent.click(await screen.findByRole("button", { name: "Link GitHub" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Provider is not configured"),
    );
  });

  it("has a sign-out button that signs out", async () => {
    mockFetch(() => body());
    renderWithProviders(<Account />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("shows a loading status, then an error with Retry that refetches", async () => {
    let fail = true;
    mockFetch(() => (fail ? reply(500, { error: { code: "boom", message: "Server error." } }) : body()));
    renderWithProviders(<Account />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your account");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your account");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Maya Ortiz" })).toBeInTheDocument();
  });

  it("shows no price, savings or retention copy", async () => {
    mockFetch(() => body());
    const { container } = renderWithProviders(<Account />);
    await screen.findByRole("heading", { name: "Maya Ortiz" });
    expect(container.textContent).not.toMatch(/saving|pricing|retention|retain/i);
  });
});
