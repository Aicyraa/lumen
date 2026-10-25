import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Documents } from "../../../src/features/documents/Documents";
import { mockFetch, renderWithProviders, reply } from "../../helpers";

const doc = (over: object) => ({
  document_id: "d1",
  filename: "handbook.md",
  status: "processing",
  error: null,
  chunk_count: 0,
  created_at: "2026-10-23T10:00:00Z",
  ...over,
});
const usage = {
  documents: { used: 1, max: 9 },
  requests_per_minute: { used: 0, max: 5 },
  requests_this_month: { used: 0, max: 5 },
};

vi.mock("../../../src/features/auth/session", () => ({ useOrgId: () => "org_1" }));

describe("Documents", () => {
  it("polls while a document is processing, shows ready, then stops polling", async () => {
    let polls = 0;
    const { calls } = mockFetch((url) => {
      if (url.endsWith("/usage")) return usage;
      polls += 1;
      return { documents: [polls < 3 ? doc({}) : doc({ status: "ready", chunk_count: 14 })] };
    });
    renderWithProviders(<Documents pollMs={40} />);
    expect(await screen.findByText("processing")).toBeInTheDocument();
    expect(await screen.findByText("ready")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    const listCalls = () => calls.filter((c) => c.url.endsWith("/api/dashboard/documents")).length;
    const settled = listCalls();
    await new Promise((r) => setTimeout(r, 250));
    expect(listCalls()).toBe(settled); // no more polling once nothing is processing
  });

  it("shows the failure reason and stops polling on failed", async () => {
    const { calls } = mockFetch((url) =>
      url.endsWith("/usage")
        ? usage
        : {
            documents: [
              doc({
                filename: "scan.pdf",
                status: "failed",
                error: "no_text_extracted: This looks like a scanned image.",
              }),
            ],
          },
    );
    renderWithProviders(<Documents pollMs={40} />);
    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/scanned image/)).toBeInTheDocument();
    const n = calls.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(calls.length).toBe(n);
  });

  it("shows the counter with the limit from the API", async () => {
    mockFetch((url) =>
      url.endsWith("/usage") ? usage : { documents: [doc({ status: "ready", chunk_count: 14 })] },
    );
    renderWithProviders(<Documents pollMs={40} />);
    expect(await screen.findByText("1 OF 9 · 14 CHUNKS")).toBeInTheDocument();
  });

  it("lets the server decide: a rejected upload shows the API message", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/usage")) return usage;
      if (init?.method === "POST")
        return reply(415, {
          error: {
            code: "unsupported_type",
            message: "Only PDF, .txt and .md files are supported.",
          },
        });
      return { documents: [] };
    });
    renderWithProviders(<Documents pollMs={40} />);
    await screen.findByText(/No documents yet/);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent
      .setup({ applyAccept: false })
      .upload(input, new File(["x"], "notes.md", { type: "text/markdown" }));
    expect(
      await screen.findByText("Only PDF, .txt and .md files are supported."),
    ).toBeInTheDocument();
  });

  it.each([
    ["upload_rate_limited", 7, /uploading too fast.*7 seconds/],
    ["ingest_limit", 10, /still being processed.*10 seconds/],
  ])("429 %s tells the user how long to wait", async (code, wait, re) => {
    mockFetch((url, init) => {
      if (url.endsWith("/usage")) return usage;
      if (init?.method === "POST")
        return reply(
          429,
          { error: { code, message: "server text", retry_after_seconds: wait } },
          {
            "retry-after": String(wait),
          },
        );
      return { documents: [] };
    });
    renderWithProviders(<Documents />);
    await screen.findByText(/No documents yet/);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "a.md", { type: "text/markdown" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(re);
  });

  it("shows the failure reason from the API exactly as sent", async () => {
    const reason = "unreadable_document: The PDF is encrypted or damaged.";
    mockFetch((url) =>
      url.endsWith("/usage")
        ? usage
        : { documents: [doc({ filename: "x.pdf", status: "failed", error: reason })] },
    );
    renderWithProviders(<Documents />);
    expect(await screen.findByText(reason)).toBeInTheDocument();
  });

  it("sends any file to the server and shows its 415 or 413 message: no type or size decision in the front end", async () => {
    let status = 415;
    const msgs: Record<number, string> = {
      415: "Only PDF, .txt and .md files are supported.",
      413: "The file is larger than the upload limit.",
    };
    const { calls } = mockFetch((url, init) => {
      if (url.endsWith("/usage")) return usage;
      if (init?.method === "POST")
        return reply(status, { error: { code: "x", message: msgs[status] } });
      return { documents: [] };
    });
    renderWithProviders(<Documents pollMs={40} />);
    await screen.findByText(/No documents yet/);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(input, new File(["x"], "pic.png", { type: "image/png" }));
    expect(await screen.findByText(msgs[415])).toBeInTheDocument();
    status = 413;
    await user.upload(
      input,
      new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" }),
    );
    expect(await screen.findByText(msgs[413])).toBeInTheDocument();
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(2); // both reached the server
  });

  it("states no size limit of its own in the upload copy", async () => {
    mockFetch((url) => (url.endsWith("/usage") ? usage : { documents: [] }));
    const { container } = renderWithProviders(<Documents pollMs={40} />);
    await screen.findByText(/No documents yet/);
    expect(container.textContent).not.toMatch(/\d+\s*MB/i);
  });

  it("deletes a document and refreshes the list", async () => {
    let docs = [doc({ status: "ready", chunk_count: 3 })];
    const { calls } = mockFetch((url, init) => {
      if (url.endsWith("/usage")) return usage;
      if (init?.method === "DELETE") {
        docs = [];
        return reply(204);
      }
      return { documents: docs };
    });
    renderWithProviders(<Documents pollMs={40} />);
    const user = userEvent.setup();
    const isDelete = () => calls.some((c) => c.init?.method === "DELETE");
    await user.click(await screen.findByRole("button", { name: "Delete handbook.md" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("handbook.md");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(isDelete()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Delete handbook.md" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete document" }),
    );
    await waitFor(() => expect(screen.getByText(/No documents yet/)).toBeInTheDocument());
    expect(
      calls.some(
        (c) => c.init?.method === "DELETE" && c.url.endsWith("/api/dashboard/documents/d1"),
      ),
    ).toBe(true);
  });

  describe("status messages", () => {
    it("loading, then empty", async () => {
      mockFetch((url) => (url.endsWith("/usage") ? usage : { documents: [] }));
      renderWithProviders(<Documents />);
      expect(screen.getByRole("status")).toHaveTextContent("Loading documents");
      expect(await screen.findByText("No documents yet. Upload one to start.")).toBeInTheDocument();
    });
    it("error with Retry that refetches", async () => {
      let fail = true;
      mockFetch((url) =>
        url.endsWith("/usage")
          ? usage
          : fail
            ? reply(500, { error: { code: "boom", message: "Server error." } })
            : { documents: [doc({ status: "ready", chunk_count: 3 })] },
      );
      renderWithProviders(<Documents />);
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not load documents");
      fail = false;
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByText("handbook.md")).toBeInTheDocument();
    });
  });
});
