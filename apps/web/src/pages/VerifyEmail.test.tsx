import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resend = vi.fn();
const useSession = vi.fn();
vi.mock("../lib/auth-client", () => ({ authClient: { useSession: () => useSession(), sendVerificationEmail: (a: unknown) => resend(a) } }));

import { VerifyEmail } from "./VerifyEmail";

const page = (query: string) => render(<MemoryRouter initialEntries={[`/verify-email${query}`]}><Routes><Route path="/verify-email" element={<VerifyEmail />} /></Routes></MemoryRouter>);

describe("VerifyEmail", () => {
  beforeEach(() => { resend.mockReset(); useSession.mockReset().mockReturnValue({ data: null, isPending: false }); });

  it("status=verified shows success and a way on (sign-in when signed out)", () => {
    page("?status=verified");
    expect(screen.getByRole("heading", { name: "Email verified" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute("href", "/signin");
  });

  it("status=verified while signed in goes on to Projects", () => {
    useSession.mockReturnValue({ data: { user: { id: "u" } }, isPending: false });
    page("?status=verified");
    expect(screen.getByRole("link", { name: "Continue to Projects" })).toHaveAttribute("href", "/projects");
  });

  it("an error wins over status=verified: TOKEN_EXPIRED says the link expired and offers a new one", async () => {
    resend.mockResolvedValue({ data: {}, error: null });
    page("?status=verified&error=TOKEN_EXPIRED");
    expect(screen.getByRole("heading", { name: "This link has expired" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Email verified" })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "maya@campus.test");
    await user.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(resend).toHaveBeenCalledWith({ email: "maya@campus.test", callbackURL: `${window.location.origin}/verify-email` });
    expect(await screen.findByRole("status")).toHaveTextContent(/sent/i);
  });

  it.each(["INVALID_TOKEN", "USER_NOT_FOUND", "SOMETHING_ELSE"])("%s shows the invalid-link state", (code) => {
    page(`?status=verified&error=${code}`);
    expect(screen.getByRole("heading", { name: "This link is not valid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a new link" })).toBeInTheDocument();
  });

  it("the resend 429 is explained", async () => {
    resend.mockResolvedValue({ data: null, error: { status: 429, message: "Too many" } });
    page("?error=TOKEN_EXPIRED");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "maya@campus.test");
    await user.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many|wait/i);
  });

  it("without any query it still renders something useful", () => {
    page("");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
