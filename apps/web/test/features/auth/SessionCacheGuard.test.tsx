import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type S = {
  data: { user: { id: string; email: string }; session: { activeOrganizationId: string } } | null;
  isPending: boolean;
};
let session: S;
vi.mock("../../../src/shared/lib/auth-client", () => ({
  authClient: { useSession: () => session },
}));

import { SessionCacheGuard } from "../../../src/features/auth/SessionCacheGuard";
import { Documents } from "../../../src/features/documents/Documents";
import { mockFetch } from "../../helpers";

const as = (id: string, org: string): S => ({
  data: { user: { id, email: `${id}@x.test` }, session: { activeOrganizationId: org } },
  isPending: false,
});
const doc = (name: string) => ({
  document_id: name,
  filename: name,
  status: "ready",
  error: null,
  chunk_count: 1,
  created_at: "2026-10-23T10:00:00Z",
});
const usage = {
  documents: { used: 1, max: 5 },
  requests_per_minute: { used: 0, max: 5 },
  requests_this_month: { used: 0, max: 5 },
};

function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SessionCacheGuard />
        <Documents pollMs={40} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("SessionCacheGuard", () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("user B signing in from the SPA never sees user A's cached data", async () => {
    session = as("userA", "orgA");
    mockFetch((url) =>
      url.endsWith("/usage")
        ? usage
        : {
            documents: [
              url.length > 0 && session.data?.user.id === "userA"
                ? doc("a-secret.md")
                : doc("b-notes.md"),
            ],
          },
    );
    const { rerender } = render(tree(client));
    expect(await screen.findByText("a-secret.md")).toBeInTheDocument();

    session = { data: null, isPending: false }; // session expired
    rerender(tree(client));
    // mounted components keep (empty) query entries; what must be gone is every trace of A's data
    await waitFor(() =>
      expect(
        JSON.stringify(
          client
            .getQueryCache()
            .getAll()
            .map((q) => q.state.data),
        ),
      ).not.toContain("a-secret.md"),
    );

    session = as("userB", "orgB"); // B signs in without a page reload
    rerender(tree(client));
    expect(screen.queryByText("a-secret.md")).not.toBeInTheDocument();
    expect(await screen.findByText("b-notes.md")).toBeInTheDocument();
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("a-secret.md");
  });

  it("clears the cache when the active organization changes for the same user", async () => {
    session = as("userA", "org1");
    mockFetch((url) => (url.endsWith("/usage") ? usage : { documents: [doc("one.md")] }));
    const { rerender } = render(tree(client));
    await screen.findByText("one.md");
    client.setQueryData(["marker"], "from-org1");
    session = as("userA", "org2");
    rerender(tree(client));
    await waitFor(() => expect(client.getQueryData(["marker"])).toBeUndefined());
  });

  it("does not clear while the session is still loading or unchanged", async () => {
    session = as("userA", "org1");
    mockFetch(() => ({}));
    const { rerender } = render(tree(client));
    client.setQueryData(["marker"], "keep");
    rerender(tree(client));
    expect(client.getQueryData(["marker"])).toBe("keep");
  });
});
