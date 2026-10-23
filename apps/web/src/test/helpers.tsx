import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

export function renderWithProviders(ui: ReactElement, { route = "/" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (url: string, init?: RequestInit) => unknown;
export interface Reply { __reply: true; status: number; body?: unknown }
// Explicit non-200 reply (a plain body can have its own "status" field).
export const reply = (status: number, body?: unknown): Reply => ({ __reply: true, status, body });

// Stubs global fetch. A handler gets the path (without the API base) and returns a body or { status, body }.
export function mockFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const out = handler(url, init) as Reply | undefined;
    const isReply = !!out && typeof out === "object" && "__reply" in out;
    const status = isReply ? (out as Reply).status : 200;
    const body = isReply ? (out as Reply).body : out;
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}
