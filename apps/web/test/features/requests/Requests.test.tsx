import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Requests } from "../../../src/features/requests/Requests";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

const ID1 = "3f0c1a7b-1111-4222-8333-444455556666";
const ID2 = "9a8b7c6d-1111-4222-8333-444455556666";
const item = (id: string, q: string, tier: string | null, over: object = {}) => ({
  id,
  time: "2026-10-23T14:32:00Z",
  query: q,
  tier,
  k: tier === "cheap" ? 3 : 8,
  escalated: false,
  latency_ms: 1240,
  tokens_in: 100,
  tokens_out: 10,
  cost_usd: 0.0012,
  status: "ok",
  ...over,
});
const detail = {
  id: ID1,
  time: "2026-10-23T14:32:00Z",
  query: "Compare fall and spring refunds",
  status: "ok",
  route: { tier: "expensive", k: 8, escalated: true, difficulty: 0.25, top_score: 0.71 },
  usage: { tokens_in: 1946, tokens_out: 88, latency_ms: 1240, cost_usd: null },
  feedback: null,
  api_key: { id: "k1", name: "Production chatbot", start: "lum_S", prefix: null },
  sources: [
    {
      document_id: "d1",
      chunk_id: 1,
      score: 0.71,
      filename: "refund-policy.md",
      document_deleted: false,
      passage: "Fall term: full refund until 12 September",
    },
    {
      document_id: "d2",
      chunk_id: 2,
      score: 0.44,
      filename: null,
      document_deleted: true,
      passage: null,
    },
  ],
};

vi.mock("../../../src/features/auth/session", () => ({ useOrgId: () => "org_1" }));

describe("Requests", () => {
  it("keeps the rows on screen while a new filter loads, and bounds how many pages it holds", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { fn } = mockFetch(() => ({
      items: [item(ID1, "When does enrollment close?", "cheap")],
      next_cursor: null,
    }));
    const orig = fn.getMockImplementation()!;
    fn.mockImplementation(async (input, init) => {
      if (String(input).includes("tier=none")) await gate;
      return orig(input, init);
    });
    const { client } = renderWithProviders(<Requests />);
    await screen.findByText("When does enrollment close?");
    await userEvent.click(screen.getByRole("button", { name: "NO ANSWER" }));
    expect(screen.getByText("When does enrollment close?")).toBeInTheDocument();
    expect(screen.queryByText("Loading requests…")).not.toBeInTheDocument();
    release();
    const q = client
      .getQueryCache()
      .getAll()
      .find((x) => (x.queryKey as string[])[2] === "none")!;
    expect(q.options.maxPages).toBe(20);
  });

  describe("keyboard and screen readers", () => {
    const rows = () => ({
      items: [item(ID1, "Compare fall and spring refunds", "expensive")],
      next_cursor: null,
    });
    const route = (url: string) => (url.includes(`/requests/${ID1}`) ? detail : rows());

    it("each log row is a row whose cell holds the button that opens it", async () => {
      mockFetch(route);
      renderWithProviders(<Requests />);
      const open = await screen.findByRole("button", {
        name: "Compare fall and spring refunds — open details",
      });
      expect(open.closest('[role="cell"]')?.closest('[role="row"]')).toBeInTheDocument();
      expect(open).toHaveAttribute("aria-haspopup", "dialog");
    });

    it.each(["{Enter}", " "])(
      "opens with the %j key and returns focus to the row on Escape",
      async (key) => {
        mockFetch(route);
        renderWithProviders(<Requests />);
        const user = userEvent.setup();
        const open = await screen.findByRole("button", { name: /open details/ });
        open.focus();
        await user.keyboard(key);
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(open).toHaveFocus();
      },
    );
  });

  it("filters by tier through the API (all, cheap, expensive, none)", async () => {
    const { calls } = mockFetch(() => ({
      items: [item(ID1, "When does enrollment close?", "cheap")],
      next_cursor: null,
    }));
    renderWithProviders(<Requests />);
    const user = userEvent.setup();
    await screen.findByText("When does enrollment close?");
    const lastUrl = () => calls.at(-1)!.url;
    expect(calls[0].url).toContain("tier=all");
    await user.click(screen.getByRole("button", { name: "CHEAP" }));
    await waitFor(() => expect(lastUrl()).toContain("tier=cheap"));
    await user.click(screen.getByRole("button", { name: "EXPENSIVE" }));
    await waitFor(() => expect(lastUrl()).toContain("tier=expensive"));
    await user.click(screen.getByRole("button", { name: "NO ANSWER" }));
    await waitFor(() => expect(lastUrl()).toContain("tier=none"));
    expect(screen.getByRole("button", { name: "NO ANSWER" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("pages with the cursor from the API and stops when there is no next cursor", async () => {
    const { calls } = mockFetch((url) =>
      url.includes("cursor=c1")
        ? { items: [item(ID2, "second page question", "cheap")], next_cursor: null }
        : { items: [item(ID1, "first page question", "cheap")], next_cursor: "c1" },
    );
    renderWithProviders(<Requests />);
    const user = userEvent.setup();
    await screen.findByText("first page question");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("second page question")).toBeInTheDocument();
    expect(screen.getByText("first page question")).toBeInTheDocument();
    expect(calls.at(-1)!.url).toContain("cursor=c1");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("labels cost as an estimate, shows 'no price set' for unpriced calls and a failed call as failed", async () => {
    mockFetch(() => ({
      items: [
        item(ID1, "priced", "cheap"),
        item(ID2, "unpriced", "cheap", { cost_usd: null }),
        item("f", "broke", null, { status: "provider_error", cost_usd: null }),
      ],
      next_cursor: null,
    }));
    renderWithProviders(<Requests />);
    await screen.findByText("priced");
    expect(screen.getByText("$0.0012")).toBeInTheDocument();
    expect(screen.getByText("no price set")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/estimated provider cost/i)).toBeInTheDocument();
  });

  it("opens a detail drawer with route, usage, UUID id, key used and sources with filenames, and closes on Escape", async () => {
    const { calls } = mockFetch((url) =>
      url.includes(`/requests/${ID1}`)
        ? detail
        : { items: [item(ID1, "Compare fall and spring refunds", "expensive")], next_cursor: null },
    );
    renderWithProviders(<Requests />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Compare fall and spring refunds/ }),
    );
    const drawer = await screen.findByRole("dialog");
    expect(calls.some((c) => c.url.endsWith(`/api/dashboard/requests/${ID1}`))).toBe(true);
    expect(await within(drawer).findByText(ID1)).toBeInTheDocument();
    expect(within(drawer).getByText(/Production chatbot/)).toBeInTheDocument();
    expect(within(drawer).getByText("refund-policy.md")).toBeInTheDocument();
    expect(within(drawer).getByText(/Fall term: full refund/)).toBeInTheDocument();
    expect(within(drawer).getByText("deleted document")).toBeInTheDocument();
    expect(within(drawer).getAllByText("0.71")).toHaveLength(2); // top score and the source score
    expect(within(drawer).getByText("no price set")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not claim 'no price set' for a request where no model was called", async () => {
    const none = {
      ...detail,
      route: { tier: "none", k: 0, escalated: false, difficulty: 0, top_score: 0.07 },
      usage: { tokens_in: 0, tokens_out: 0, latency_ms: 37, cost_usd: null },
      sources: [],
    };
    mockFetch((url) =>
      url.includes(`/requests/${ID1}`)
        ? none
        : { items: [item(ID1, "Who won the match?", "none")], next_cursor: null },
    );
    renderWithProviders(<Requests />);
    await userEvent.click(await screen.findByRole("button", { name: /Who won the match/ }));
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByText("No model called");
    expect(within(drawer).queryByText("no price set")).not.toBeInTheDocument();
  });

  describe("status messages", () => {
    it("loading, then empty", async () => {
      mockFetch(() => ({ items: [], next_cursor: null }));
      renderWithProviders(<Requests />);
      expect(screen.getByRole("status")).toHaveTextContent("Loading requests");
      expect(await screen.findByText(/No requests match this filter/)).toBeInTheDocument();
    });
    it("error with Retry that refetches", async () => {
      let fail = true;
      mockFetch(() =>
        fail
          ? reply(500, { error: { code: "boom", message: "Server error." } })
          : { items: [item(ID1, "Where is the cafe?", "cheap")], next_cursor: null },
      );
      renderWithProviders(<Requests />);
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not load requests");
      fail = false;
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByText("Where is the cafe?")).toBeInTheDocument();
    });
  });
});

describe("Requests provider rate limit", () => {
  const limitedRow = item("rl", "throttled", null, {
    status: "provider_rate_limited",
    cost_usd: null,
  });
  it("labels a provider_rate_limited request 'rate limited' in the list, not 'failed'", async () => {
    mockFetch(() => ({
      items: [limitedRow, item("f", "broke", null, { status: "provider_error", cost_usd: null })],
      next_cursor: null,
    }));
    renderWithProviders(<Requests />);
    await screen.findByText("throttled");
    expect(screen.getByText("rate limited")).toBeInTheDocument();
    expect(screen.getAllByText("failed")).toHaveLength(1);
  });

  it("says 'Rate limited' in the detail drawer", async () => {
    mockFetch((url) =>
      url.includes("/requests/rl")
        ? {
            ...detail,
            id: "rl",
            status: "provider_rate_limited",
            route: { tier: null, k: null, escalated: null, difficulty: null, top_score: null },
            sources: [],
          }
        : { items: [limitedRow], next_cursor: null },
    );
    renderWithProviders(<Requests />);
    await userEvent.click(await screen.findByRole("button", { name: /throttled/ }));
    const dlg = await screen.findByRole("dialog");
    expect(await within(dlg).findByText("Rate limited")).toBeInTheDocument();
    expect(within(dlg).getByText(/rate limiting this workspace/)).toBeInTheDocument();
    expect(within(dlg).queryByText("Failed")).not.toBeInTheDocument();
  });
});
