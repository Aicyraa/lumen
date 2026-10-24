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
      fallback_uses: 0,
      median_latency_ms: 300,
      cost_usd: 0.0031,
    },
    {
      id: "m2",
      tier: "fallback",
      position: 0,
      provider: "openai",
      model_id: "gpt-fallback",
      status: "connected",
      rate_limits: null,
      rate_limits_seen_at: null,
      requests: 2,
      tokens_in: 90,
      tokens_out: 8,
      failures: { error: 0, timeout: 0, rate_limited: 0 },
      backup_uses: 0,
      fallback_uses: 2,
      median_latency_ms: 500,
      cost_usd: null,
    },
  ],
});
const unanswered = {
  range: "7d",
  threshold: 0.3,
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
    expect(within(mix).getByText("50%")).toBeInTheDocument(); // 5 of 10 cheap
    expect(screen.getByText("Is there visitor parking?")).toBeInTheDocument();
    expect(screen.getByText("0.09")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "By model" });
    expect(within(table).getByText("gpt-fallback")).toBeInTheDocument(); // fallback models included
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

  it("lays the page out as cards with headings: chart, route mix, unanswered, by model", async () => {
    mockFetch(handler);
    renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    for (const name of ["Requests per day", "Route mix", "Unanswered questions", "By model"]) {
      const h = screen.getByRole("heading", { level: 2, name });
      expect(h.closest(".card")).not.toBeNull();
    }
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
        ? { range: "7d", threshold: 0.3, total: 0, items: [] }
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
    expect(screen.getByText(/No unanswered questions/)).toBeInTheDocument();
    expect(screen.getByText(/No models yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Requests per day" })).toBeNull();
  });

  it("starts the bar animation once the page is seen, even though the data arrives after the first render", async () => {
    mockFetch(handler);
    const { container } = renderWithProviders(<Analytics />);
    await screen.findByText("840 ms");
    await waitFor(() => expect(container.querySelector(".an")).toHaveClass("in-view"));
  });
});
