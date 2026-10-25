import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectContext, type Workspace } from "../../../src/features/projects/projectsContext";
import { TryIt } from "../../../src/features/try-it/TryIt";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

const RID = "3f0c1a7b-1111-4222-8333-444455556666";
const result = (cost: number | null) => ({
  request_id: RID,
  answer: "Enrollment closes on 15 March [1]. Late requests need approval [2].",
  sources: [
    {
      document_id: "d1",
      chunk_id: 1,
      score: 0.78,
      filename: "handbook.md",
      snippet: "Spring enrollment closes 15 March",
    },
    {
      document_id: "d1",
      chunk_id: 2,
      score: 0.52,
      filename: "handbook.md",
      snippet: "Late enrollment must be approved",
    },
  ],
  route: { model_tier: "cheap", k: 3, escalated: false, difficulty: 0, top_score: 0.78 },
  usage: { tokens_in: 812, tokens_out: 64, latency_ms: 620, cost_usd: cost },
});

const project: Workspace = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  description: null,
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
  documents: 0,
  requests_this_month: 0,
};
const renderTryIt = () =>
  renderWithProviders(
    <ProjectContext.Provider value={project}>
      <TryIt />
    </ProjectContext.Provider>,
  );

vi.mock("../../../src/features/auth/session", () => ({ useOrgId: () => "org_1" }));

describe("TryIt", () => {
  it("asks through POST /api/dashboard/try and shows answer citations, sources, route and usage", async () => {
    const { calls } = mockFetch(() => result(0.0004));
    renderTryIt();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Question"), "When does enrollment close?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(/Enrollment closes on 15 March/)).toBeInTheDocument();
    const call = calls[0];
    expect(call.url).toContain("/api/dashboard/try");
    expect(JSON.parse(String(call.init!.body))).toEqual({ query: "When does enrollment close?" });
    expect(screen.getAllByText("[1]").length).toBeGreaterThan(0);
    expect(screen.getAllByText("handbook.md")).toHaveLength(2);
    expect(screen.getByText("Spring enrollment closes 15 March")).toBeInTheDocument();
    expect(screen.getByText("Cheap tier")).toBeInTheDocument();
    expect(screen.getByText("$0.0004")).toBeInTheDocument();
    expect(screen.getByText("620 ms")).toBeInTheDocument();
  });

  it("says 'no price set' when the answering model has no price", async () => {
    mockFetch(() => result(null));
    renderTryIt();
    await userEvent.type(screen.getByLabelText("Question"), "hi{enter}");
    expect(await screen.findByText("no price set")).toBeInTheDocument();
  });

  it("sends Helpful? Yes/No to POST /api/dashboard/feedback with the request id", async () => {
    const { calls } = mockFetch((url) => (url.includes("/feedback") ? reply(204) : result(null)));
    renderTryIt();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Question"), "hi{enter}");
    await user.click(await screen.findByRole("button", { name: "No" }));
    const fb = calls.find((c) => c.url.includes("/feedback"))!;
    expect(JSON.parse(String(fb.init!.body))).toEqual({ request_id: RID, rating: -1 });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("shows API errors such as no models configured and rate limits", async () => {
    mockFetch(() =>
      reply(422, {
        error: {
          code: "no_models_configured",
          message: "No models are configured. Add a model in the Models tab.",
        },
      }),
    );
    renderTryIt();
    await userEvent.type(screen.getByLabelText("Question"), "hi{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Add a model in the Models tab");
    expect(
      within(screen.getByRole("alert")).getByRole("link", { name: "Models tab" }),
    ).toHaveAttribute("href", "/projects/acme/models");
  });

  it("clamps the score bar to 0-100% even for an out-of-range score", async () => {
    const r = result(null);
    r.sources[0].score = 1.2;
    r.sources[1].score = -0.1;
    mockFetch(() => r);
    const { container } = renderTryIt();
    await userEvent.type(screen.getByLabelText("Question"), "hi{enter}");
    await screen.findByText(/Enrollment closes/);
    const widths = Array.from(container.querySelectorAll<HTMLElement>(".score-fill")).map(
      (e) => e.style.width,
    );
    expect(widths).toEqual(["100%", "0%"]);
  });

  describe("status messages", () => {
    it("starts with an empty-state message", () => {
      mockFetch(() => result(null));
      renderTryIt();
      expect(screen.getByRole("status")).toHaveTextContent(/Ask a question to see the answer/);
    });
    it("shows a loading message while asking, and the empty message is gone after the answer", async () => {
      let release!: (v: unknown) => void;
      const gate = new Promise((r) => {
        release = r;
      });
      const { fn } = mockFetch(() => result(null));
      const orig = fn.getMockImplementation()!;
      fn.mockImplementation(async (i, init) => {
        await gate;
        return orig(i, init);
      });
      renderTryIt();
      await userEvent.type(screen.getByLabelText("Question"), "Hello?");
      await userEvent.click(screen.getByRole("button", { name: "Ask" }));
      expect(await screen.findByRole("status")).toHaveTextContent(/routing/i);
      release(null);
      await screen.findByText(/Enrollment closes on 15 March/);
      expect(screen.queryByText(/Ask a question to see the answer/)).toBeNull();
    });
    it("shows the error as an alert and the empty message is not shown with it", async () => {
      mockFetch(() =>
        reply(502, { error: { code: "provider_error", message: "All models failed." } }),
      );
      renderTryIt();
      await userEvent.type(screen.getByLabelText("Question"), "Hello?");
      await userEvent.click(screen.getByRole("button", { name: "Ask" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("All models failed.");
      expect(screen.queryByText(/Ask a question to see the answer/)).toBeNull();
    });
  });

  describe("centred layout", () => {
    it("is a single centred column until there is an answer, then adds the side column", async () => {
      mockFetch(() => result(0.0004));
      const { container } = renderTryIt();
      const grid = container.querySelector(".try-grid")!;
      expect(grid).not.toHaveClass("with-side");
      await userEvent.type(screen.getByLabelText("Question"), "When does enrollment close?");
      await userEvent.click(screen.getByRole("button", { name: "Ask" }));
      await screen.findByText(/Enrollment closes on 15 March/);
      expect(container.querySelector(".try-grid")).toHaveClass("with-side");
    });
  });
});

describe("TryIt provider rate limit", () => {
  const limited = (seconds: number) =>
    reply(
      429,
      {
        error: {
          code: "provider_rate_limited",
          message:
            "The model provider is rate limiting this workspace. Try again in about 12 minutes.",
          retry_after_seconds: seconds,
        },
      },
      { "retry-after": String(seconds) },
    );

  it("shows the server message and a live countdown, then re-enables a hint at 0; Ask stays usable", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockFetch(() => limited(702));
      renderTryIt();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(screen.getByLabelText("Question"), "hi{enter}");
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("The model provider is rate limiting this workspace.");
      expect(alert).toHaveTextContent("Try again in 11:42");
      expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Try again in 11:40");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700_000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("You can try again now");
      expect(screen.getByRole("alert")).not.toHaveTextContent(/Try again in \d/);
      expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the wording of other errors", async () => {
    mockFetch(() =>
      reply(502, { error: { code: "provider_error", message: "Every model failed." } }),
    );
    renderTryIt();
    await userEvent.type(screen.getByLabelText("Question"), "hi{enter}");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Every model failed.");
    expect(alert).not.toHaveTextContent(/try again/i);
  });
});
