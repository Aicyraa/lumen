import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const list = vi.fn();
const del = vi.fn();
vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { session: { activeOrganizationId: "org_1" }, user: { email: "a@b.test" } },
      isPending: false,
    }),
    apiKey: {
      create: (a: unknown) => create(a),
      list: (a: unknown) => list(a),
      delete: (a: unknown) => del(a),
    },
  },
}));

import { ApiKeys } from "../../../src/features/keys/ApiKeys";
import { renderWithProviders } from "../../helpers";

const FULL_KEY = "lum_SECRETSECRETSECRET1234567890";
const row = {
  id: "k1",
  name: "Staging",
  start: "lum_S",
  prefix: null,
  createdAt: "2026-10-14T09:00:00Z",
  lastRequest: null,
};

describe("ApiKeys", () => {
  beforeEach(() => {
    create.mockReset();
    list.mockReset();
    del.mockReset();
  });

  it("lists keys with the start, created date and last used, never a full key", async () => {
    list.mockResolvedValue({
      data: {
        apiKeys: [row, { ...row, id: "k2", name: "Local", lastRequest: "2026-10-18T09:00:00Z" }],
        total: 2,
      },
      error: null,
    });
    renderWithProviders(<ApiKeys />);
    expect(await screen.findByText("Staging")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ query: { organizationId: "org_1" } });
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("Oct 18")).toBeInTheDocument();
  });

  it("shows the full key exactly once, then it is gone from the page", async () => {
    list.mockResolvedValueOnce({ data: { apiKeys: [], total: 0 }, error: null }).mockResolvedValue({
      data: { apiKeys: [{ ...row, id: "k9", name: "Prod", start: "lum_S" }], total: 1 },
      error: null,
    });
    create.mockResolvedValue({
      data: { id: "k9", key: FULL_KEY, start: "lum_S", name: "Prod" },
      error: null,
    });
    renderWithProviders(<ApiKeys />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Create key" }));
    await user.type(screen.getByLabelText("Name"), "Prod");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(create).toHaveBeenCalledWith({ name: "Prod", organizationId: "org_1" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(FULL_KEY)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copy" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "I've saved it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain(FULL_KEY);
    expect(await screen.findByText("Prod")).toBeInTheDocument(); // listed by its start only
  });

  describe("copying the new key", () => {
    async function openKeyDialog(writeText?: () => Promise<void>) {
      list.mockResolvedValue({ data: { apiKeys: [], total: 0 }, error: null });
      create.mockResolvedValue({
        data: { id: "k9", key: FULL_KEY, start: "lum_S", name: "Prod" },
        error: null,
      });
      renderWithProviders(<ApiKeys />);
      const user = userEvent.setup();
      // after setup(): user-event installs its own clipboard stub on navigator
      Object.defineProperty(navigator, "clipboard", {
        value: writeText ? { writeText } : undefined,
        configurable: true,
      });
      await user.click(await screen.findByRole("button", { name: "Create key" }));
      await user.click(screen.getByRole("button", { name: "Create" }));
      const dialog = await screen.findByRole("dialog");
      return { user, dialog };
    }
    it("says Copied only after the clipboard write succeeded", async () => {
      const { user, dialog } = await openKeyDialog(() => Promise.resolve());
      await user.click(within(dialog).getByRole("button", { name: "Copy" }));
      expect(await within(dialog).findByRole("button", { name: "Copied" })).toBeInTheDocument();
    });
    it("says to copy by hand when the clipboard write is refused", async () => {
      const { user, dialog } = await openKeyDialog(() => Promise.reject(new Error("denied")));
      await user.click(within(dialog).getByRole("button", { name: "Copy" }));
      expect(
        await within(dialog).findByText(/Copy failed, select and copy manually/),
      ).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    });
    it("says to copy by hand when there is no clipboard API", async () => {
      const { user, dialog } = await openKeyDialog(undefined);
      await user.click(within(dialog).getByRole("button", { name: "Copy" }));
      expect(
        await within(dialog).findByText(/Copy failed, select and copy manually/),
      ).toBeInTheDocument();
    });
  });

  it("shows the error when creating fails and no key", async () => {
    list.mockResolvedValue({ data: { apiKeys: [], total: 0 }, error: null });
    create.mockResolvedValue({
      data: null,
      error: { message: "Not a member of this organization" },
    });
    renderWithProviders(<ApiKeys />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create key" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not a member of this organization");
  });

  it("revokes a key by id", async () => {
    list
      .mockResolvedValueOnce({ data: { apiKeys: [row], total: 1 }, error: null })
      .mockResolvedValue({ data: { apiKeys: [], total: 0 }, error: null });
    del.mockResolvedValue({ data: { success: true }, error: null });
    renderWithProviders(<ApiKeys />);
    await userEvent.click(await screen.findByRole("button", { name: "Revoke Staging" }));
    expect(del).toHaveBeenCalledWith({ keyId: "k1" });
    expect(await screen.findByText(/No keys/)).toBeInTheDocument();
  });

  it("keeps the full key out of the TanStack mutation cache, while the dialog is open and after it closes", async () => {
    list.mockResolvedValue({ data: { apiKeys: [], total: 0 }, error: null });
    create.mockResolvedValue({
      data: { id: "k9", key: FULL_KEY, start: "lum_S", name: "Prod" },
      error: null,
    });
    const { client } = renderWithProviders(<ApiKeys />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create key" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(FULL_KEY);
    const cached = () =>
      JSON.stringify([
        ...client
          .getMutationCache()
          .getAll()
          .map((x) => [x.state.variables, x.state.data]),
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ]);
    expect(cached()).not.toContain(FULL_KEY);
    await user.click(within(dialog).getByRole("button", { name: "I've saved it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(cached()).not.toContain(FULL_KEY);
  });

  describe("status messages", () => {
    it("loading, then empty", async () => {
      list.mockResolvedValue({ data: { apiKeys: [], total: 0 }, error: null });
      renderWithProviders(<ApiKeys />);
      expect(screen.getByRole("status")).toHaveTextContent("Loading API keys");
      expect(await screen.findByText(/No keys yet/)).toBeInTheDocument();
    });
    it("error with Retry that refetches", async () => {
      list
        .mockResolvedValueOnce({ data: null, error: { message: "nope" } })
        .mockResolvedValue({ data: { apiKeys: [row], total: 1 }, error: null });
      renderWithProviders(<ApiKeys />);
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not load API keys");
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByText("Staging")).toBeInTheDocument();
    });
  });
});
