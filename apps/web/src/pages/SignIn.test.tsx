import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const client = new QueryClient();
const page = () =>
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/signin"]}>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/projects" element={<div>dashboard home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("SignIn", () => {
  beforeEach(() => { [social, signInEmail, signUpEmail, useSession].forEach((f) => f.mockReset()); useSession.mockReturnValue({ data: null, isPending: false }); });

  it("starts Google and GitHub sign-in with a callback to Projects", async () => {
    page();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(social).toHaveBeenCalledWith({ provider: "google", callbackURL: `${window.location.origin}/projects`, errorCallbackURL: `${window.location.origin}/signin` });
    await user.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(social).toHaveBeenLastCalledWith({ provider: "github", callbackURL: `${window.location.origin}/projects`, errorCallbackURL: `${window.location.origin}/signin` });
  });

  it("signs in with email and password and lands on /projects", async () => {
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
    signInEmail.mockResolvedValue({ data: null, error: { status: 401, message: "Invalid email or password" } });
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
    expect(signUpEmail).toHaveBeenCalledWith({ name: "Maya", email: "maya@campus.test", password: "correct horse 123", callbackURL: `${window.location.origin}/verify-email` });
  });

  it("sends a visitor who already has a session straight to the dashboard", () => {
    useSession.mockReturnValue({ data: { user: {} }, isPending: false });
    page();
    expect(screen.getByText("dashboard home")).toBeInTheDocument();
  });

  it("clears the whole query cache when sign-in succeeds, so nothing from an earlier account survives", async () => {
    signInEmail.mockResolvedValue({ data: { user: {} }, error: null });
    client.setQueryData(["documents", "orgA"], [{ filename: "a-secret.md" }]);
    page();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "b@b.test");
    await user.type(screen.getByLabelText("Password"), "correct horse 123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("dashboard home");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
