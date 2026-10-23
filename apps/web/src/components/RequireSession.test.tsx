import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSession = vi.fn();
vi.mock("../lib/auth-client", () => ({ authClient: { useSession: () => useSession() } }));

import { RequireSession } from "./RequireSession";

function app() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/signin" element={<div>sign-in page</div>} />
        <Route element={<RequireSession />}>
          <Route path="/dashboard" element={<div>dashboard secret</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireSession", () => {
  beforeEach(() => useSession.mockReset());

  it("redirects /dashboard to sign-in when there is no session", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    app();
    expect(screen.getByText("sign-in page")).toBeInTheDocument();
    expect(screen.queryByText("dashboard secret")).not.toBeInTheDocument();
  });

  it("shows nothing (no flash of the dashboard, no redirect) while the session loads", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    app();
    expect(screen.queryByText("sign-in page")).not.toBeInTheDocument();
    expect(screen.queryByText("dashboard secret")).not.toBeInTheDocument();
  });

  it("renders the dashboard when a session exists", () => {
    useSession.mockReturnValue({ data: { user: { email: "a@b.test" }, session: { activeOrganizationId: "org1" } }, isPending: false });
    app();
    expect(screen.getByText("dashboard secret")).toBeInTheDocument();
  });
});
