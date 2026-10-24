import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "u1", email: "m@x.test" }, session: { activeOrganizationId: "p1" } },
      isPending: false,
    }),
    signOut: vi.fn(),
  },
}));

import { Projects } from "../../../src/features/projects/Projects";

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
  description: "Orders and returns",
  role: "member",
  created_at: "2026-10-20T09:00:00Z",
  documents: 0,
  requests_this_month: 1234,
};
const page = () =>
  renderWithProviders(
    <Routes>
      <Route path="/projects" element={<Projects />} />
      <Route path="/projects/:slug/documents" element={<div>entered project</div>} />
    </Routes>,
    { route: "/projects" },
  );

describe("Projects", () => {
  it("lists projects as cards with name, description, role, created date and counts", async () => {
    mockFetch(() => ({ workspaces: [P1, P2] }));
    page();
    const card = await screen.findByRole("link", { name: /Shop support/ });
    expect(within(card).getByText("Orders and returns")).toBeInTheDocument();
    expect(within(card).getByText("member")).toBeInTheDocument();
    expect(within(card).getByText(/Oct 20/)).toBeInTheDocument();
    expect(within(card).getByText("1,234")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My project/ })).toHaveAttribute(
      "href",
      "/projects/my-project/documents",
    );
    await userEvent.click(card);
    expect(await screen.findByText("entered project")).toBeInTheDocument();
  });

  it("creates a project from the dialog and shows it", async () => {
    let list: object[] = [P1];
    const { calls } = mockFetch((_url, init) => {
      if (init?.method === "POST") {
        list = [...list, { ...P2, id: "p3", name: "Docs bot", slug: "docs-bot-1" }];
        return reply(201, { workspace: list[1] });
      }
      return { workspaces: list };
    });
    page();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create project" }));
    await user.type(screen.getByLabelText("Name"), "Docs bot");
    await user.type(screen.getByLabelText(/Description/), "Help desk");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create" }));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "POST")!.init!.body))).toEqual({
      name: "Docs bot",
      description: "Help desk",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("link", { name: /Docs bot/ })).toBeInTheDocument();
  });

  it("shows the API's project_limit message and keeps the dialog open", async () => {
    mockFetch((_u, init) =>
      init?.method === "POST"
        ? reply(422, {
            error: { code: "project_limit", message: "You can own at most 5 projects." },
          })
        : { workspaces: [P1] },
    );
    page();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create project" }));
    await user.type(screen.getByLabelText("Name"), "One too many");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "You can own at most 5 projects.",
    );
  });

  it("has an empty state and an error state with retry", async () => {
    mockFetch(() => ({ workspaces: [] }));
    const r = page();
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
    r.unmount();
    mockFetch(() => reply(500, { error: { code: "x", message: "boom" } }));
    page();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  describe("grid and summary", () => {
    const account = {
      user: {
        name: "Maya",
        email: "m@x.test",
        email_verified: true,
        image: null,
        created_at: "2026-10-01T00:00:00Z",
      },
      providers: [],
      projects: { owned: 1, max: 5 },
      totals: { documents: 2, requests_this_month: 1248, api_keys: 0, models: 0 },
    };
    const both = (url: string) => (url.includes("/account") ? account : { workspaces: [P1, P2] });

    it("shows a summary strip: projects n of max, total documents, requests this month", async () => {
      mockFetch(both);
      page();
      const strip = await screen.findByRole("region", { name: "Summary" });
      await waitFor(() => expect(strip).toHaveTextContent(/1 of 5/));
      expect(within(strip).getByText("Projects").parentElement).toHaveTextContent("1 of 5");
      expect(within(strip).getByText("Documents").parentElement).toHaveTextContent("2");
      expect(within(strip).getByText("Requests this month").parentElement).toHaveTextContent(
        "1,248",
      );
    });

    it("falls back to the project count and workspace sums when the account data is unavailable", async () => {
      mockFetch((url) =>
        url.includes("/account")
          ? reply(500, { error: { code: "x", message: "no" } })
          : { workspaces: [P1, P2] },
      );
      page();
      const strip = await screen.findByRole("region", { name: "Summary" });
      expect(within(strip).getByText("Projects").parentElement).toHaveTextContent("2");
      expect(within(strip).getByText("Requests this month").parentElement).toHaveTextContent(
        "1,248",
      );
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("has Create project as a cell of the grid, after the project cards", async () => {
      mockFetch(both);
      page();
      await screen.findByRole("link", { name: /Shop support/ });
      const cells = Array.from(document.querySelectorAll("ul.cards > li"));
      const create = within(cells[cells.length - 1] as HTMLElement).getByRole("button", {
        name: "Create project",
      });
      await userEvent.click(create);
      expect(screen.getByRole("dialog", { name: "Create project" })).toBeInTheDocument();
    });

    it("cards show a role badge, description, stats and the created date", async () => {
      mockFetch(both);
      page();
      const card = await screen.findByRole("link", { name: /Shop support/ });
      expect(within(card).getByText("member")).toHaveClass("badge");
      expect(within(card).getByText("Orders and returns")).toBeInTheDocument();
      expect(within(card).getByText("DOCUMENTS")).toBeInTheDocument();
      expect(within(card).getByText(/Created Oct 20/)).toBeInTheDocument();
    });

    it("with a single project it still shows the strip, the card and the Create cell (no empty page)", async () => {
      mockFetch((url) => (url.includes("/account") ? account : { workspaces: [P1] }));
      page();
      await screen.findByRole("link", { name: /My project/ });
      expect(screen.getByRole("region", { name: "Summary" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create project" })).toBeInTheDocument();
    });
  });

  it("refreshes the account strip after a project is created", async () => {
    let accountCalls = 0;
    mockFetch((url, init) => {
      if (url.includes("/account")) {
        accountCalls += 1;
        return {
          user: {
            name: "M",
            email: "m@x.test",
            email_verified: true,
            image: null,
            created_at: "2026-10-01T00:00:00Z",
          },
          providers: [],
          projects: { owned: accountCalls, max: 5 },
          totals: { documents: 0, requests_this_month: 0, api_keys: 0, models: 0 },
        };
      }
      return init?.method === "POST" ? reply(201, { workspace: P2 }) : { workspaces: [P1] };
    });
    page();
    const strip = await screen.findByRole("region", { name: "Summary" });
    await waitFor(() => expect(strip).toHaveTextContent("1 of 5"));
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    await userEvent.type(screen.getByLabelText("Name"), "Second");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Create" }),
    );
    await waitFor(() => expect(strip).toHaveTextContent("2 of 5"));
  });
});
