import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../helpers";

let verified = true;
const listAccounts = vi.fn();
const linkSocial = vi.fn();
vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { id: "u1", email: "maya@x.test", name: "Maya", emailVerified: verified },
        session: { activeOrganizationId: "p1" },
      },
      isPending: false,
    }),
    listAccounts: () => listAccounts(),
    linkSocial: (a: unknown) => linkSocial(a),
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
}));

import { Account } from "../../../src/features/account/Account";

describe("Account", () => {
  beforeEach(() => {
    verified = true;
    listAccounts.mockReset();
    linkSocial.mockReset().mockResolvedValue({ data: {} });
  });

  it("shows the email, its verification state and the linked sign-in methods with Link buttons for the rest", async () => {
    listAccounts.mockResolvedValue({
      data: [{ providerId: "credential" }, { providerId: "github" }],
    });
    renderWithProviders(<Account />);
    expect(screen.getByText("maya@x.test")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(await screen.findByText("Email and password")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link GitHub" })).not.toBeInTheDocument();
  });

  it("an unverified email is shown as not verified", async () => {
    verified = false;
    listAccounts.mockResolvedValue({ data: [{ providerId: "credential" }] });
    renderWithProviders(<Account />);
    expect(await screen.findByText("Not verified")).toBeInTheDocument();
  });

  it("Link Google starts linking with a callback back to /account", async () => {
    listAccounts.mockResolvedValue({ data: [{ providerId: "credential" }] });
    renderWithProviders(<Account />);
    await userEvent.click(await screen.findByRole("button", { name: "Link Google" }));
    expect(linkSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: `${window.location.origin}/account`,
    });
  });

  it("shows why linking failed", async () => {
    listAccounts.mockResolvedValue({ data: [{ providerId: "credential" }] });
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

  it("has a sign-out button", async () => {
    listAccounts.mockResolvedValue({ data: [] });
    renderWithProviders(<Account />);
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
