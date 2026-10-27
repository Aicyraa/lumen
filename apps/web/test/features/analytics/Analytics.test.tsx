import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Analytics } from "../../../src/features/analytics/Analytics";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

const summary = (range: string) => ({
  range,
  total_requests: 10,
  per_day: [
    { date: "2026-10-22", cheap: 4, expensive: 2, none: 1, failed: 0, cost_usd: 0.002 },
    { date: "2026-10-23", cheap: 1, expensive: 1, none: 0, failed: 1, cost_usd: null },
  ],
  route_mix: { cheap: 5, escalated: 1, expensive_hard: 1, none: 2, failed: 1 },
  latency_ms: { median: 840, p95: 2100 },
  total_cost_usd: 0.0031,
  by_model: [
    {
      id: "m1",
      tier: "cheap",
      position: 0,
      provider: "openai_compatible",
      model_id: "gpt-oss-20b",
      status: "connected",
      rate_limits: null,
      rate_limits_seen_at: null,
      requests: 7,
      tokens_in: 900,
      tokens_out: 80,
      failures: { error: 1, timeout: 0, rate_limited: 0 },
      backup_uses: 0,
      median_latency_ms: 300,
      cost_usd: 0.0031,
    },
    {
      id: "m2",
      tier: "expensive",
      position: 0,
      provider: "openai",
      model_id: "gpt-backup",
      status: "connected",
      rate_limits: null,
      rate_limits_seen_at: null,
      requests: 2,
      tokens_in: 90,
      tokens_out: 8,
      failures: { error: 0, timeout: 0, rate_limited: 0 },
      backup_uses: 2,
      median_latency_ms: 500,
      cost_usd: null,
    },
  ],
});
const longQuery = `${"What is the notice period for terminating the lease agreement early ".repeat(4)}?`;
const unanswered = {
  range: "7d",
  threshold: 0.3,
  no_match: {
    total: 2,
    items: [
      {
        id: "u1",
        query: "Is there visitor parking?",
        top_score: 0.09,
        tier: "none",
        time: "2026-10-23T10:00:00Z",
      },
      {
        id: "u2",
        query: "Weak match question",
        top_score: null,
        tier: "none",
        time: "2026-10-23T11:00:00Z",
      },
    ],
  },
  not_found: {
    total: 3,
    items: [
      {
        id: "n1",
        query: "Who signs the invoices?",
        top_score: 0.42,
        tier: "expensive",
        model: { provider: "openai", model_id: "gpt-backup" },
        difficulty: 0.5,
        escalated: true,
        time: "2026-10-23T12:00:00Z",
      },
      {
        id: "n2",
        query: "Where is the archive?",
        top_score: 0.38,
        tier: "cheap",
        model: null,
        difficulty: null,
        escalated: false,
        time: "2026-10-23T13:00:00Z",
      },
      {
        id: "n3",
        query: longQuery,
        top_score: 0.35,
        tier: "cheap",
        model: { provider: "openai_compatible", model_id: "gpt-oss-20b" },
        difficulty: 0.1,
        escalated: false,
        time: "2026-10-23T14:00:00Z",
      },
    ],
  },
};
const emptyUnanswered = {
  range: "7d",
  threshold: 0.3,
  no_match: { total: 0, items: [] },
  not_found: { total: 0, items: [] },
};

const handler = (url: string) =>
  url.includes("/unanswered") ? unanswered : summary(url.includes("range=30d") ? "30d" : "7d");

vi.mock("../../../src/features/auth/session", () => ({ useOrgId: () => "org_1" }));

describe("Analytics", () => {
  it("shows tiles, route mix with the failed bucket, unanswered questions, by-model and labelled estimated cost", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    expect(await screen.findByText("840 ms")).toBeInTheDocument();
    expect(screen.getByText(/p95 2,100 ms/)).toBeInTheDocument();
    expect(screen.getByText("$0.0031", { selector: ".stat-value" })).toBeInTheDocument();
    expect(screen.getByText("ESTIMATED PROVIDER COST")).toBeInTheDocument();
    const mix = screen.getByRole("list", { name: "Route mix" });
    expect(within(mix).getByText(/Failed/)).toBeInTheDocument();
    expect(within(mix).getByText(/rate limit/i)).toBeInTheDocument();
    expect(within(mix).getByText("50%")).toBeInTheDocument(); // 5 of 10 cheap
    expect(screen.getByText("Is there visitor parking?")).toBeInTheDocument();
    expect(screen.getByText("0.09")).toBeInTheDocument();
    expect(screen.getByText("Who signs the invoices?")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "By model" });
    expect(within(table).getByText("gpt-backup")).toBeInTheDocument(); // backup models included
    expect(within(table).getByText("no price set")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Oct 22.*4 cheap.*2 expensive/ })).toBeInTheDocument();
  });

  it("switches range with the 7D / 30D toggle and requests the new range", async () => {
    const { calls } = mockFetch(handler);
    renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    expect(calls.some((c) => c.url.includes("summary?range=7d"))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "30D" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("summary?range=30d"))).toBe(true));
    expect(screen.getByRole("button", { name: "30D" })).toHaveAttribute("aria-pressed", "true");
  });

  it("carries no savings, pricing or retention copy", async () => {
    mockFetch(handler);
    const { container } = renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    expect(container.textContent).not.toMatch(/saving|pricing|retention|retain/i);
  });

  it("lays the page out as cards with headings: chart, route mix, no match, not found, by model", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    for (const name of ["Requests per day", "Route mix", "No match", "Not found", "By model"]) {
      const h = screen.getByRole("heading", { level: 2, name });
      expect(h.closest(".card")).not.toBeNull();
    }
  });

  it("puts By model before the two unanswered cards", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    const heads = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(heads.indexOf("By model")).toBeGreaterThan(-1);
    expect(heads.indexOf("By model")).toBeLessThan(heads.indexOf("No match"));
    expect(heads.indexOf("No match")).toBeLessThan(heads.indexOf("Not found"));
  });

  it("shows a centred loading message, then data", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading analytics");
    await screen.findByText("840 ms");
  });

  it("shows an error with Retry that refetches", async () => {
    let fail = true;
    const { calls } = mockFetch((url) =>
      fail && url.includes("/summary")
        ? reply(500, { error: { code: "boom", message: "Server error." } })
        : handler(url),
    );
    renderWithProviders(<Analytics />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load analytics");
    fail = false;
    const before = calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("840 ms")).toBeInTheDocument();
    expect(calls.length).toBeGreaterThan(before);
  });

  it("has proper empty states for chart, unanswered and by-model when there is no data", async () => {
    mockFetch((url) =>
      url.includes("/unanswered")
        ? emptyUnanswered
        : {
            range: "7d",
            total_requests: 0,
            per_day: [],
            route_mix: { cheap: 0, escalated: 0, expensive_hard: 0, none: 0, failed: 0 },
            latency_ms: { median: null, p95: null },
            total_cost_usd: null,
            by_model: [],
          },
    );
    renderWithProviders(<Analytics />);
    expect(await screen.findByText(/No requests in this range yet/)).toBeInTheDocument();
    expect(screen.getByText("Nothing without a match in this range.")).toBeInTheDocument();
    expect(screen.getByText("Nothing marked not found in this range.")).toBeInTheDocument();
    expect(screen.getByText(/No models yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Requests per day" })).toBeNull();
  });

  it("explains each card, with the threshold in the No match hint", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    expect(
      screen.getByText(
        "No model was called, or the best match scored below 0.30. Add documents that cover these.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A model answered, but found nothing in your documents. These matched loosely, so a document may need rewording or adding.",
      ),
    ).toBeInTheDocument();
  });

  it("the UNANSWERED tile is no match plus not found", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    const tile = screen.getByText("UNANSWERED").closest(".stat") as HTMLElement;
    await waitFor(() => expect(within(tile).getByText("5")).toBeInTheDocument());
  });

  it("Not found rows show score, model, difficulty and an escalated marker only when true", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    const card = screen.getByRole("heading", { name: "Not found" }).closest(".card") as HTMLElement;
    const rows = within(card).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("0.42")).toBeInTheDocument();
    expect(within(rows[0]).getByText("openai / gpt-backup")).toBeInTheDocument();
    expect(within(rows[0]).getByText("difficulty 0.50")).toBeInTheDocument();
    expect(within(rows[0]).getByText("escalated")).toBeInTheDocument();
    expect(within(rows[1]).getByText("model not recorded")).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/difficulty/)).toBeNull();
    expect(within(rows[1]).queryByText("escalated")).toBeNull();
    expect(within(rows[2]).queryByText("escalated")).toBeNull();
  });

  it("a long query is truncated by CSS but keeps its full text and a title", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    const q = screen.getByText(longQuery);
    expect(q).toHaveClass("ellipsis");
    expect(q).toHaveAttribute("title", longQuery);
  });

  it("each unanswered card fails and retries on its own", async () => {
    let fail = true;
    const { calls } = mockFetch((url) =>
      fail && url.includes("/unanswered")
        ? reply(500, { error: { code: "boom", message: "Server error." } })
        : handler(url),
    );
    renderWithProviders(<Analytics />);
    const msgs = await screen.findAllByText(/Could not load unanswered questions/);
    expect(msgs).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "No match" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not found" })).toBeInTheDocument();
    fail = false;
    const before = calls.length;
    await userEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(await screen.findByText("Who signs the invoices?")).toBeInTheDocument();
    expect(screen.getByText("Is there visitor parking?")).toBeInTheDocument();
    expect(calls.length).toBeGreaterThan(before);
  });

  it("starts the bar animation once the page is seen, even though the data arrives after the first render", async () => {
    mockFetch(handler);
    const { container } = renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    await waitFor(() => expect(container.querySelector(".an")).toHaveClass("in-view"));
  });

  it("an unused model shows 'no usage yet' instead of 'no price set'; a used unpriced one still says 'no price set'", async () => {
    mockFetch((url) => {
      const r = handler(url) as ReturnType<typeof summary>;
      if (url.includes("/unanswered")) return r;
      return { ...r, by_model: [{ ...r.by_model[0], requests: 0, cost_usd: null }, r.by_model[1]] };
    });
    renderWithProviders(<Analytics />);
    const table = await screen.findByRole("table", { name: "By model" });
    expect(within(table).getByText("no usage yet")).toBeInTheDocument();
    expect(within(table).getAllByText("no price set")).toHaveLength(1);
  });

  it("by-model has a BACKUP USES column and no fallback anywhere", async () => {
    mockFetch(handler);
    const { container } = renderWithProviders(<Analytics />);
    const table = await screen.findByRole("table", { name: "By model" });
    expect(within(table).getByText("BACKUP USES")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/fallback/i);
  });
});
