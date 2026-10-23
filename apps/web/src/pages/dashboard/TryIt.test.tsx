import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, vi, expect, it } from "vitest";
import { mockFetch, renderWithProviders, reply } from "../../test/helpers";
import { TryIt } from "./TryIt";

const RID = "3f0c1a7b-1111-4222-8333-444455556666";
const result = (cost: number | null) => ({
  request_id: RID, answer: "Enrollment closes on 15 March [1]. Late requests need approval [2].",
  sources: [{ document_id: "d1", chunk_id: 1, score: 0.78, filename: "handbook.md", snippet: "Spring enrollment closes 15 March" },
    { document_id: "d1", chunk_id: 2, score: 0.52, filename: "handbook.md", snippet: "Late enrollment must be approved" }],
  route: { model_tier: "cheap", k: 3, escalated: false, difficulty: 0, top_score: 0.78 },
  usage: { tokens_in: 812, tokens_out: 64, latency_ms: 620, cost_usd: cost },
});

vi.mock("../../lib/session", () => ({ useOrgId: () => "org_1" }));

describe("TryIt", () => {
  it("asks through POST /api/dashboard/try and shows answer citations, sources, route and usage", async () => {
    const { calls } = mockFetch(() => result(0.0004));
    renderWithProviders(<TryIt />);
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
    renderWithProviders(<TryIt />);
    await userEvent.type(screen.getByLabelText("Question"), "hi{enter}");
    expect(await screen.findByText("no price set")).toBeInTheDocument();
  });

  it("sends Helpful? Yes/No to POST /api/dashboard/feedback with the request id", async () => {
    const { calls } = mockFetch((url) => (url.includes("/feedback") ? reply(204) : result(null)));
    renderWithProviders(<TryIt />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Question"), "hi{enter}");
    await user.click(await screen.findByRole("button", { name: "No" }));
    const fb = calls.find((c) => c.url.includes("/feedback"))!;
    expect(JSON.parse(String(fb.init!.body))).toEqual({ request_id: RID, rating: -1 });
    await waitFor(() => expect(screen.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("shows API errors such as no models configured and rate limits", async () => {
    mockFetch(() => reply(422, { error: { code: "no_models_configured", message: "No models are configured. Add a model in the Models tab." } }));
    renderWithProviders(<TryIt />);
    await userEvent.type(screen.getByLabelText("Question"), "hi{enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Add a model in the Models tab");
    expect(within(screen.getByRole("alert")).getByRole("link", { name: "Models tab" })).toHaveAttribute("href", "/dashboard/models");
  });
});
