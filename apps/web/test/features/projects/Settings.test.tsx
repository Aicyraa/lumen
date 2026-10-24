import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ProjectContext } from "../../../src/features/projects/projectsContext";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

vi.mock("../../../src/features/auth/session", () => ({ useOrgId: () => "p2" }));

import { Settings } from "../../../src/features/projects/Settings";

const project = {
  id: "p2",
  name: "Shop support",
  slug: "shop-support",
  description: "Orders",
  role: "owner" as const,
  created_at: "2026-10-24T08:00:00Z",
  documents: 0,
  requests_this_month: 0,
};
const page = (role: "owner" | "admin" | "member" = "owner") =>
  renderWithProviders(
    <ProjectContext.Provider value={{ ...project, role }}>
      <Routes>
        <Route path="/" element={<Settings />} />
        <Route path="/projects" element={<div>projects list</div>} />
      </Routes>
    </ProjectContext.Provider>,
  );

describe("Settings", () => {
  it("renames and changes the description with PATCH, clearing an emptied description with null", async () => {
    const { calls } = mockFetch(() => ({ workspace: project }));
    page();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Shop help");
    await user.clear(screen.getByLabelText("Description"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const patch = await waitFor(() => {
      const c = calls.find((x) => x.init?.method === "PATCH");
      expect(c).toBeTruthy();
      return c!;
    });
    expect(patch.url).toContain("/api/dashboard/workspaces/p2");
    expect(JSON.parse(String(patch.init!.body))).toEqual({ name: "Shop help", description: null });
  });

  it("delete needs the exact project name typed, sends it, clears the cache and returns to Projects", async () => {
    const { calls } = mockFetch((_u, init) => (init?.method === "DELETE" ? reply(204) : {}));
    const { client } = page();
    client.setQueryData(["documents", "p2"], [{ filename: "secret.md" }]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete project" }));
    const confirm = screen.getByRole("button", { name: "Delete forever" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/Type .*Shop support/), "shop support");
    expect(confirm).toBeDisabled(); // exact, case-sensitive
    await user.clear(screen.getByLabelText(/Type .*Shop support/));
    await user.type(screen.getByLabelText(/Type .*Shop support/), "Shop support");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await screen.findByText("projects list")).toBeInTheDocument();
    const del = calls.find((c) => c.init?.method === "DELETE")!;
    expect(del.url).toContain("/api/dashboard/workspaces/p2");
    expect(JSON.parse(String(del.init!.body))).toEqual({ name: "Shop support" });
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("secret.md");
  });

  it("shows the API error when delete is refused", async () => {
    mockFetch((_u, init) =>
      init?.method === "DELETE"
        ? reply(403, {
            error: { code: "forbidden", message: "Only the owner can delete a project." },
          })
        : {},
    );
    page();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete project" }));
    await user.type(screen.getByLabelText(/Type .*Shop support/), "Shop support");
    await user.click(screen.getByRole("button", { name: "Delete forever" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only the owner can delete a project.",
    );
  });

  it("members see the settings read-only and cannot delete", () => {
    mockFetch(() => ({}));
    page("member");
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete project" })).not.toBeInTheDocument();
  });
});
