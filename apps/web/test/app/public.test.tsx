import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/shared/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    signIn: { social: vi.fn(), email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

import { SignIn } from "../../src/features/auth/SignIn";
import { Docs } from "../../src/features/docs/Docs";
import { Privacy } from "../../src/features/docs/Privacy";
import { Home } from "../../src/features/home/Home";

const view = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  ).container;
// Lumen has no pricing of its own and promises no retention period: none of this may appear on a public page.
const FORBIDDEN = /retention|retain|saving|pricing|calculator|\$\s?\d/i;
const NO_MONEY_AT_ALL = /cost|price|cheapest|\bfree\b/i;

describe("public copy", () => {
  it.each([
    ["Home", <Home />],
    ["Docs", <Docs />],
    ["Privacy", <Privacy />],
    ["SignIn", <SignIn />],
  ])("%s has no retention, savings or pricing copy", (_n, ui) => {
    expect(view(ui as React.ReactElement).textContent).not.toMatch(FORBIDDEN);
  });
  it.each([
    ["Home", <Home />],
    ["Privacy", <Privacy />],
    ["SignIn", <SignIn />],
  ])("%s makes no cost claims", (_n, ui) => {
    expect(view(ui as React.ReactElement).textContent).not.toMatch(NO_MONEY_AT_ALL);
  });
});

describe("Home", () => {
  it("has numbered sections in order, with no pricing section and no FAQ", () => {
    const text = view(<Home />).textContent!;
    const labels = [
      "RAG API FOR YOUR CHATBOT — 01",
      "WHAT LUMEN IS — 02",
      "HOW ROUTING WORKS — 03",
      "DEMO — 04",
      "BUILT IN — 05",
      "SECURITY — 06",
      "QUICKSTART — 07",
    ];
    expect(text).not.toMatch(/USE CASES/);
    let at = -1;
    for (const l of labels) {
      const i = text.indexOf(l);
      expect(i, l).toBeGreaterThan(at);
      at = i;
    }
    expect(text).not.toMatch(/FAQ/);
    expect(screen.queryByRole("link", { name: /pricing/i })).not.toBeInTheDocument();
  });

  it("links to sign-in, the docs and the privacy page", () => {
    view(<Home />);
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/signin");
    expect(screen.getByRole("link", { name: "Read the docs" })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getAllByRole("link", { name: "Docs" }).length).toBeGreaterThan(0);
  });

  it("demo toggles Easy / Hard / No answer using the real /v1/chat response shape, with top_score and without a cost", async () => {
    view(<Home />);
    const demo = screen.getByRole("region", { name: "Demo" });
    const res = () => within(demo).getByTestId("demo-response").textContent!;
    expect(res()).toContain('"model_tier": "cheap"');
    expect(res()).toContain('"top_score"');
    await userEvent.click(within(demo).getByRole("button", { name: "HARD" }));
    expect(res()).toContain('"model_tier": "expensive"');
    await userEvent.click(within(demo).getByRole("button", { name: "NO ANSWER" }));
    expect(res()).toContain('"model_tier": "none"');
    expect(res()).toContain("I could not find that in the documents.");
    expect(demo.textContent).not.toContain("cost_usd");
  });

  it("quickstart switches cURL / Node / Python, copies the snippet and says to keep the key on the server", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    view(<Home />);
    const qs = screen.getByRole("region", { name: "Quickstart" });
    expect(within(qs).getByText(/Keep the key on your server/)).toBeInTheDocument();
    expect(within(qs).getByTestId("code").textContent).toContain("curl");
    await userEvent.click(within(qs).getByRole("button", { name: "Node" }));
    expect(within(qs).getByTestId("code").textContent).toContain("fetch(");
    await userEvent.click(within(qs).getByRole("button", { name: "Python" }));
    expect(within(qs).getByTestId("code").textContent).toContain("requests.post");
    await userEvent.click(within(qs).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(within(qs).getByTestId("code").textContent);
    expect(within(qs).getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

describe("claims the product can back up", () => {
  it("Home security does not overstate prompt-injection protection", () => {
    const text = view(<Home />).textContent!;
    expect(text).not.toMatch(/can.t change how the assistant behaves/);
    expect(text).toMatch(/sent to the model as data, not instructions/);
    expect(text).toMatch(/told to ignore instructions inside them/);
  });
  it.each([
    ["Home", <Home />],
    ["Docs", <Docs />],
    ["Privacy", <Privacy />],
    ["SignIn", <SignIn />],
  ])("%s hard-codes no megabyte figure (the server enforces the upload limit)", (_n, ui) => {
    expect(view(ui as React.ReactElement).textContent).not.toMatch(/\d+\s*MB/i);
  });
  it("Docs does not promise a process for raising limits", () => {
    expect(view(<Docs />).textContent).not.toMatch(/higher limit/i);
  });
});

describe("Docs", () => {
  it("documents auth, chat, documents, feedback and every error code", () => {
    const text = view(<Docs />).textContent!;
    for (const s of [
      "x-api-key",
      "POST /v1/chat",
      "POST /v1/documents",
      "GET /v1/documents/:id",
      "DELETE /v1/documents/:id",
      "POST /v1/feedback",
      "invalid_api_key",
      "not_found",
      "file_too_large",
      "unsupported_type",
      "invalid_request",
      "rate_limited",
      "monthly_limit",
      "document_limit",
      "provider_error",
      "no_models_configured",
    ])
      expect(text).toContain(s);
    for (const c of ["401", "404", "413", "415", "422", "429", "502"]) expect(text).toContain(c);
  });
});

describe("Privacy", () => {
  it("states what the product does: queries logged, no document text in logs, provider keys encrypted", () => {
    const text = view(<Privacy />).textContent!;
    expect(text).toMatch(/questions are logged/i);
    expect(text).toMatch(/never written to logs/i);
    expect(text).toMatch(/encrypted/i);
  });
});
