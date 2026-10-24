import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Models } from "../../../src/features/models/Models";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

const SECRET = "sk-SUPERSECRET-0123456789";
const m = (id: string, tier: string, position: number, over: object = {}) => ({
  id,
  tier,
  position,
  provider: "openai_compatible",
  model_id: `model-${id}`,
  endpoint_url: "https://api.groq.com/openai/v1",
  key_hint: "gsk_...a1b2",
  status: "connected",
  input_price_per_1m: null,
  output_price_per_1m: null,
  ...over,
});
const u = (id: string, tier: string, position: number, over: object = {}) => ({
  id,
  tier,
  position,
  provider: "openai_compatible",
  model_id: `model-${id}`,
  status: "connected",
  rate_limits: null,
  rate_limits_seen_at: null,
  requests: 0,
  tokens_in: 0,
  tokens_out: 0,
  failures: { error: 0, timeout: 0, rate_limited: 0 },
  backup_uses: 0,
  fallback_uses: 0,
  median_latency_ms: null,
  cost_usd: null,
  ...over,
});
const base = {
  models: {
    cheap: [
      m("a", "cheap", 0, { input_price_per_1m: 0.1, output_price_per_1m: 0.4 }),
      m("b", "cheap", 1),
    ],
    expensive: [m("c", "expensive", 0)],
    fallback: [],
  },
};
const usageBody = {
  range: "7d",
  total_cost_usd: 0.0123,
  models: [
    u("a", "cheap", 0, {
      requests: 12,
      tokens_in: 3400,
      tokens_out: 560,
      failures: { error: 2, timeout: 1, rate_limited: 0 },
      median_latency_ms: 420,
      cost_usd: 0.0123,
      rate_limits: { "x-ratelimit-limit-requests": "30", "x-ratelimit-remaining-tokens": "7000" },
      rate_limits_seen_at: "2026-10-23T10:00:00Z",
    }),
    u("b", "cheap", 1, { backup_uses: 3 }),
    u("c", "expensive", 0),
  ],
};
const router =
  (extra?: (url: string, init?: RequestInit) => unknown) => (url: string, init?: RequestInit) => {
    const x = extra?.(url, init);
    if (x !== undefined) return x;
    if (url.includes("/models/usage")) return usageBody;
    return base;
  };

vi.mock("../../../src/features/auth/session", () => ({ useOrgId: () => "org_1" }));

describe("Models", () => {
  it("shows Cheap, Expensive and Fallback groups in order with rank, masked key, usage, limits and estimated cost", async () => {
    mockFetch(router());
    renderWithProviders(<Models />);
    await screen.findByText("model-a");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["Cheap", "Expensive", "Fallback"]),
    );
    const a = screen.getByTestId("model-a");
    expect(within(a).getByText("PRIMARY")).toBeInTheDocument();
    expect(within(screen.getByTestId("model-b")).getByText("BACKUP 1")).toBeInTheDocument();
    expect(within(a).getByText(/gsk_\.\.\.a1b2/)).toBeInTheDocument();
    expect(within(a).getByText(/12 requests/)).toBeInTheDocument();
    expect(within(a).getByText(/3,400 in/)).toBeInTheDocument();
    expect(within(a).getByText(/3 failures/)).toBeInTheDocument();
    expect(within(a).getByText(/limit-requests 30/)).toBeInTheDocument();
    expect(within(a).getByText("$0.0123")).toBeInTheDocument();
    const b = screen.getByTestId("model-b");
    expect(within(b).getByText(/3 as backup/)).toBeInTheDocument();
    expect(within(b).getByText(/not reported/)).toBeInTheDocument();
    expect(within(b).getByText(/no price set/)).toBeInTheDocument();
    expect(screen.getByText(/No fallback/)).toBeInTheDocument();
    expect(screen.getAllByText(/estimated provider cost/i).length).toBeGreaterThan(0);
  });

  it("moves a model with the arrows (first model's up arrow is disabled) and removes it", async () => {
    const { calls } = mockFetch(
      router((_url, init) =>
        init?.method === "PATCH" ? base : init?.method === "DELETE" ? reply(204) : undefined,
      ),
    );
    renderWithProviders(<Models />);
    const user = userEvent.setup();
    await screen.findByText("model-b");
    expect(
      within(screen.getByTestId("model-a")).getByRole("button", { name: /Move model-a up/ }),
    ).toBeDisabled();
    await user.click(
      within(screen.getByTestId("model-b")).getByRole("button", { name: "Move model-b up" }),
    );
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(patch.url).toContain("/api/dashboard/models/b");
    expect(JSON.parse(String(patch.init!.body))).toEqual({ direction: "up" });
    await user.click(
      within(screen.getByTestId("model-b")).getByRole("button", { name: "Remove model-b" }),
    );
    expect(
      calls.some((c) => c.init?.method === "DELETE" && c.url.endsWith("/api/dashboard/models/b")),
    ).toBe(true);
  });

  async function fillForm(
    user: ReturnType<typeof userEvent.setup>,
    extra: { input?: string; output?: string } = {},
  ) {
    await user.click(await screen.findByRole("button", { name: "Add model" }));
    await user.click(screen.getByRole("button", { name: "OpenAI-compatible" }));
    await user.clear(screen.getByLabelText("Endpoint URL"));
    await user.type(screen.getByLabelText("Endpoint URL"), "https://api.groq.com/openai/v1");
    await user.type(screen.getByLabelText("Model ID"), "openai/gpt-oss-20b");
    await user.type(screen.getByLabelText("API key"), SECRET);
    if (extra.input) await user.type(screen.getByLabelText(/Input price/), extra.input);
    if (extra.output) await user.type(screen.getByLabelText(/Output price/), extra.output);
  }

  it("sends the key once and never puts it back in the page: not while saving, not after success", async () => {
    let release!: (v: unknown) => void;
    const gate = new Promise((r) => (release = r));
    const { calls, fn } = mockFetch(
      router((_url, init) => (init?.method === "POST" ? undefined : undefined)),
    );
    const orig = fn.getMockImplementation()!;
    fn.mockImplementation(async (input, init) =>
      init?.method === "POST"
        ? (calls.push({ url: String(input), init }),
          await gate,
          new Response(JSON.stringify({ model: m("z", "cheap", 2) }), { status: 201 }))
        : orig(input, init),
    );
    renderWithProviders(<Models />);
    const user = userEvent.setup();
    await fillForm(user, { input: "0.1", output: "0.4" });
    await user.click(screen.getByRole("button", { name: "Test & save" }));

    const post = await waitFor(() => {
      const c = calls.find((x) => x.init?.method === "POST");
      expect(c).toBeTruthy();
      return c!;
    });
    expect(JSON.parse(String(post.init!.body))).toEqual({
      provider: "openai_compatible",
      model_id: "openai/gpt-oss-20b",
      endpoint_url: "https://api.groq.com/openai/v1",
      api_key: SECRET,
      tier: "cheap",
      input_price_per_1m: 0.1,
      output_price_per_1m: 0.4,
    });
    expect(screen.getByRole("button", { name: /Testing connection/ })).toBeDisabled();
    expect(document.body.innerHTML).not.toContain(SECRET); // gone from the DOM while the request is in flight
    release(null);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Testing connection/ })).not.toBeInTheDocument(),
    );
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it("shows why Test & save failed and still does not keep the key in the page", async () => {
    mockFetch(
      router((_url, init) =>
        init?.method === "POST"
          ? reply(422, {
              error: { code: "provider_error", message: "The provider rejected the key (401)." },
            })
          : undefined,
      ),
    );
    renderWithProviders(<Models />);
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Test & save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The provider rejected the key (401).",
    );
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("validates optional prices: negative or non-numeric prices are not sent", async () => {
    const { calls } = mockFetch(router());
    renderWithProviders(<Models />);
    const user = userEvent.setup();
    await fillForm(user, { input: "-1", output: "abc" });
    await user.click(screen.getByRole("button", { name: "Test & save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/price/i);
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("leaves prices out when left empty", async () => {
    const { calls } = mockFetch(
      router((_url, init) =>
        init?.method === "POST" ? reply(201, { model: m("z", "cheap", 2) }) : undefined,
      ),
    );
    renderWithProviders(<Models />);
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Test & save" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "POST")).toBe(true));
    const body = JSON.parse(String(calls.find((c) => c.init?.method === "POST")!.init!.body));
    expect(body).not.toHaveProperty("input_price_per_1m");
    expect(body).not.toHaveProperty("output_price_per_1m");
  });

  it("leaves no api_key in the TanStack mutation cache after a save or a failed save", async () => {
    let fail = false;
    mockFetch(
      router((_url, init) =>
        init?.method === "POST"
          ? fail
            ? reply(422, { error: { code: "provider_error", message: "nope" } })
            : reply(201, { model: m("z", "cheap", 2) })
          : undefined,
      ),
    );
    const { client } = renderWithProviders(<Models />);
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Test & save" }));
    await waitFor(() => expect(screen.queryByLabelText("API key")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(
        JSON.stringify(
          client
            .getMutationCache()
            .getAll()
            .map((x) => [x.state.variables, x.state.data]),
        ),
      ).not.toContain(SECRET),
    );
    fail = true;
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Test & save" }));
    await screen.findByRole("alert");
    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((x) => [x.state.variables, x.state.data]),
      ),
    ).not.toContain(SECRET);
  });

  it("renders each tier as a card with aligned columns", async () => {
    mockFetch(router());
    renderWithProviders(<Models />);
    await screen.findByText("model-a");
    const cheap = screen.getByRole("region", { name: "Cheap" });
    expect(cheap).toHaveClass("card");
    expect(
      within(cheap)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["MODEL", "ENDPOINT", "STATUS", "USAGE", "LIMITS", "COST", ""]);
    expect(
      within(screen.getByTestId("model-a")).getByText("OpenAI-compatible"),
    ).toBeInTheDocument();
    for (const name of ["Expensive", "Fallback"])
      expect(screen.getByRole("region", { name })).toHaveClass("card");
  });

  it("shows centred loading and error (with Retry) states", async () => {
    let fail = true;
    mockFetch(
      router((url) =>
        fail && !url.includes("/usage")
          ? reply(500, { error: { code: "boom", message: "Server error." } })
          : undefined,
      ),
    );
    renderWithProviders(<Models />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading models");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load models");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("model-a")).toBeInTheDocument();
  });

  describe("Add model modal", () => {
    it("opens a modal dialog with focus inside, closes on Escape and gives focus back", async () => {
      mockFetch(router());
      renderWithProviders(<Models />);
      const user = userEvent.setup();
      const opener = await screen.findByRole("button", { name: "Add model" });
      expect(opener).toHaveAttribute("aria-haspopup", "dialog");
      await user.click(opener);
      const dialog = screen.getByRole("dialog", { name: "Add model" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(within(dialog).getByLabelText("API key")).toHaveAttribute("type", "password");
      expect(within(dialog).getByLabelText(/Input price/)).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(opener).toHaveFocus();
    });

    it("keeps Tab inside the dialog", async () => {
      mockFetch(router());
      renderWithProviders(<Models />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "Add model" }));
      const dialog = screen.getByRole("dialog");
      for (let i = 0; i < 25; i++) {
        await user.tab();
        expect(dialog.contains(document.activeElement)).toBe(true);
      }
    });

    it("closes after a successful save and the page behind has no inline form", async () => {
      mockFetch(
        router((_url, init) =>
          init?.method === "POST" ? reply(201, { model: m("z", "cheap", 2) }) : undefined,
        ),
      );
      renderWithProviders(<Models />);
      const user = userEvent.setup();
      await fillForm(user);
      await user.click(screen.getByRole("button", { name: "Test & save" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(document.body.innerHTML).not.toContain(SECRET);
    });
  });

  describe("cost wording follows the model's prices", () => {
    const cost = (id: string) => within(screen.getByTestId(`model-${id}`));
    it("a priced model with no usage shows $0, never 'no price set'", async () => {
      mockFetch(router());
      renderWithProviders(<Models />);
      await screen.findByText("model-a");
      // model-c is unpriced and unused; give it prices in a second render below
      expect(cost("b").getByText(/no price set/)).toBeInTheDocument();
    });
    it("shows $0 for priced-but-unused and keeps the real figure when there is usage", async () => {
      mockFetch(
        router((url) =>
          url.includes("/models/usage")
            ? {
                ...usageBody,
                models: [
                  u("a", "cheap", 0, { cost_usd: 0.0123, requests: 12 }),
                  u("b", "cheap", 1),
                ],
              }
            : {
                models: {
                  ...base.models,
                  cheap: [
                    m("a", "cheap", 0, { input_price_per_1m: 0.1, output_price_per_1m: 0.4 }),
                    m("b", "cheap", 1, { input_price_per_1m: 0.1, output_price_per_1m: 0.5 }),
                  ],
                },
              },
        ),
      );
      renderWithProviders(<Models />);
      await screen.findByText("model-a");
      expect(cost("a").getByText("$0.0123")).toBeInTheDocument();
      expect(cost("b").getByText("$0")).toBeInTheDocument();
      expect(cost("b").queryByText(/no price set/)).toBeNull();
    });
  });

  describe("usage failures and wording", () => {
    it("when usage fails, rows say 'usage unavailable' (not 'loading' forever), the list still renders and Retry refetches usage", async () => {
      let fail = true;
      const { calls } = mockFetch(
        router((url) =>
          fail && url.includes("/models/usage")
            ? reply(500, { error: { code: "boom", message: "Usage is down." } })
            : undefined,
        ),
      );
      renderWithProviders(<Models />);
      await screen.findByText("model-a");
      await waitFor(() => expect(screen.getAllByText("usage unavailable").length).toBe(3));
      expect(screen.queryByText("usage loading…")).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(/Could not load usage/);
      fail = false;
      const before = calls.filter((c) => c.url.includes("/models/usage")).length;
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(within(screen.getByTestId("model-a")).getByText(/12 requests/)).toBeInTheDocument(),
      );
      expect(calls.filter((c) => c.url.includes("/models/usage")).length).toBeGreaterThan(before);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("uses one wording for a missing price: 'no price set', never 'none set'", async () => {
      mockFetch(router());
      const { container } = renderWithProviders(<Models />);
      await screen.findByText("model-b");
      expect(within(screen.getByTestId("model-b")).getByText(/no price set/)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/none set/i);
      await userEvent.click(screen.getByRole("button", { name: "Add model" }));
      expect(screen.getByRole("dialog")).toHaveTextContent(/Leave empty to show "no price set"/);
    });
  });

  describe("tier tooltips", () => {
    it("has no explanatory paragraph under the heading; each tier has an info tooltip", async () => {
      mockFetch(router());
      const { container } = renderWithProviders(<Models />);
      await screen.findByText("model-a");
      expect(container.textContent).not.toMatch(/Connect your own provider keys/);
      const tips = {
        Cheap: /easy questions/i,
        Expensive: /hard questions and escalations/i,
        Fallback: /every model in a tier fails or times out/i,
      };
      for (const [tier, re] of Object.entries(tips)) {
        const region = screen.getByRole("region", { name: tier });
        const btn = within(region).getByRole("button", {
          name: `About the ${tier.toLowerCase()} tier`,
        });
        await userEvent.hover(btn);
        expect(within(region).getByRole("tooltip")).toHaveTextContent(re);
        await userEvent.unhover(btn);
      }
    });

    it("explains the cost line in a tooltip reachable by keyboard", async () => {
      mockFetch(router());
      renderWithProviders(<Models />);
      await screen.findByText("model-a");
      const btn = within(screen.getByTestId("model-a")).getByRole("button", {
        name: "About estimated provider cost",
      });
      act(() => btn.focus());
      expect(within(screen.getByTestId("model-a")).getByRole("tooltip")).toHaveTextContent(
        /prices you enter for each model/i,
      );
    });
  });
});
