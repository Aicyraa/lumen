import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockFetch, renderWithProviders } from "../../test/helpers";
import { Requests } from "./Requests";

const ID1 = "3f0c1a7b-1111-4222-8333-444455556666";
const ID2 = "9a8b7c6d-1111-4222-8333-444455556666";
const item = (id: string, q: string, tier: string | null, over: object = {}) => ({
  id, time: "2026-10-23T14:32:00Z", query: q, tier, k: tier === "cheap" ? 3 : 8, escalated: false, latency_ms: 1240,
  tokens_in: 100, tokens_out: 10, cost_usd: 0.0012, status: "ok", ...over,
});
const detail = {
  id: ID1, time: "2026-10-23T14:32:00Z", query: "Compare fall and spring refunds", status: "ok",
  route: { tier: "expensive", k: 8, escalated: true, difficulty: 0.25, top_score: 0.71 },
  usage: { tokens_in: 1946, tokens_out: 88, latency_ms: 1240, cost_usd: null },
  feedback: null, api_key: { id: "k1", name: "Production chatbot", start: "lum_S", prefix: null },
  sources: [
    { document_id: "d1", chunk_id: 1, score: 0.71, filename: "refund-policy.md", document_deleted: false, passage: "Fall term: full refund until 12 September" },
    { document_id: "d2", chunk_id: 2, score: 0.44, filename: null, document_deleted: true, passage: null },
  ],
};

describe("Requests", () => {
  it("filters by tier through the API (all, cheap, expensive, none)", async () => {
    const { calls } = mockFetch(() => ({ items: [item(ID1, "When does enrollment close?", "cheap")], next_cursor: null }));
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
    expect(screen.getByRole("button", { name: "NO ANSWER" })).toHaveAttribute("aria-pressed", "true");
  });

  it("pages with the cursor from the API and stops when there is no next cursor", async () => {
    const { calls } = mockFetch((url) =>
      url.includes("cursor=c1") ? { items: [item(ID2, "second page question", "cheap")], next_cursor: null }
        : { items: [item(ID1, "first page question", "cheap")], next_cursor: "c1" });
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
    mockFetch(() => ({ items: [item(ID1, "priced", "cheap"), item(ID2, "unpriced", "cheap", { cost_usd: null }), item("f", "broke", null, { status: "provider_error", cost_usd: null })], next_cursor: null }));
    renderWithProviders(<Requests />);
    await screen.findByText("priced");
    expect(screen.getByText("$0.0012")).toBeInTheDocument();
    expect(screen.getByText("no price set")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/estimated provider cost/i)).toBeInTheDocument();
  });

  it("opens a detail drawer with route, usage, UUID id, key used and sources with filenames, and closes on Escape", async () => {
    const { calls } = mockFetch((url) => (url.includes(`/requests/${ID1}`) ? detail : { items: [item(ID1, "Compare fall and spring refunds", "expensive")], next_cursor: null }));
    renderWithProviders(<Requests />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Compare fall and spring refunds/ }));
    const drawer = await screen.findByRole("dialog");
    expect(calls.some((c) => c.url.endsWith(`/api/dashboard/requests/${ID1}`))).toBe(true);
    expect(await within(drawer).findByText(ID1)).toBeInTheDocument();
    expect(within(drawer).getByText(/Production chatbot/)).toBeInTheDocument();
    expect(within(drawer).getByText("refund-policy.md")).toBeInTheDocument();
    expect(within(drawer).getByText(/Fall term: full refund/)).toBeInTheDocument();
    expect(within(drawer).getByText("deleted document")).toBeInTheDocument();
    expect(within(drawer).getByText("0.71")).toBeInTheDocument();
    expect(within(drawer).getByText("no price set")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
