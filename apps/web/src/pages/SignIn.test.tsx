import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const social = vi.fn();
const signInEmail = vi.fn();
const signUpEmail = vi.fn();
const useSession = vi.fn();
vi.mock("../lib/auth-client", () => ({
  authClient: { useSession: () => useSession(), signIn: { social: (a: unknown) => social(a), email: (a: unknown) => signInEmail(a) }, signUp: { email: (a: unknown) => signUpEmail(a) } },
}));

import { SignIn } from "./SignIn";

const page = () =>
  render(
    <MemoryRouter initialEntries={["/signin"]}>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/dashboard/*" element={<div>dashboard home</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("SignIn", () => {
  beforeEach(() => { [social, signInEmail, signUpEmail, useSession].forEach((f) => f.mockReset()); useSession.mockReturnValue({ data: null, isPending: false }); });

  it("starts Google and GitHub sign-in with a callback to this app's dashboard", async () => {
    page();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: `${window.location.origin}/dashboard` });
    await user.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(social).toHaveBeenLastCalledWith({ provider: "github", callbackURL: `${window.location.origin}/dashboard` });
  });

  it("signs in with email and password and lands on /dashboard", async () => {
    signInEmail.mockResolvedValue({ data: { user: {} }, error: null });
    page();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.test");
    await user.type(screen.getByLabelText("Password"), "correct horse 123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(signInEmail).toHaveBeenCalledWith({ email: "a@b.test", password: "correct horse 123" });
    expect(await screen.findByText("dashboard home")).toBeInTheDocument();
  });

  it("shows the error and stays on the page when sign-in fails", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { message: "Invalid email or password" } });
    page();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "a@b.test");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.queryByText("dashboard home")).not.toBeInTheDocument();
  });

  it("toggles to sign-up, asks for a name, and creates the account", async () => {
    signUpEmail.mockResolvedValue({ data: { user: {} }, error: null });
    page();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Name"), "Maya");
    await user.type(screen.getByLabelText("Email"), "maya@campus.test");
    await user.type(screen.getByLabelText("Password"), "correct horse 123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(signUpEmail).toHaveBeenCalledWith({ name: "Maya", email: "maya@campus.test", password: "correct horse 123" });
    expect(await screen.findByText("dashboard home")).toBeInTheDocument();
  });

  it("sends a visitor who already has a session straight to the dashboard", () => {
    useSession.mockReturnValue({ data: { user: {} }, isPending: false });
    page();
    expect(screen.getByText("dashboard home")).toBeInTheDocument();
  });
});
