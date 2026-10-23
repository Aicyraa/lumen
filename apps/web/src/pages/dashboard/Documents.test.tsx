import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockFetch, renderWithProviders } from "../../test/helpers";
import { Documents } from "./Documents";

const doc = (over: object) => ({ document_id: "d1", filename: "handbook.md", status: "processing", error: null, chunk_count: 0, created_at: "2026-10-23T10:00:00Z", ...over });
const usage = { documents: { used: 1, max: 9 }, requests_per_minute: { used: 0, max: 5 }, requests_this_month: { used: 0, max: 5 } };

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
      url.endsWith("/usage") ? usage : { documents: [doc({ filename: "scan.pdf", status: "failed", error: "no_text_extracted: This looks like a scanned image." })] });
    renderWithProviders(<Documents pollMs={40} />);
    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/scanned image/)).toBeInTheDocument();
    const n = calls.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(calls.length).toBe(n);
  });

  it("shows the counter with the limit from the API", async () => {
    mockFetch((url) => (url.endsWith("/usage") ? usage : { documents: [doc({ status: "ready", chunk_count: 14 })] }));
    renderWithProviders(<Documents pollMs={40} />);
    expect(await screen.findByText("1 OF 9 · 14 CHUNKS")).toBeInTheDocument();
  });

  it("lets the server decide: a rejected upload shows the API message", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/usage")) return usage;
      if (init?.method === "POST") return { status: 415, body: { error: { code: "unsupported_type", message: "Only PDF, .txt and .md files are supported." } } };
      return { documents: [] };
    });
    renderWithProviders(<Documents pollMs={40} />);
    await screen.findByText(/No documents yet/);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.setup({ applyAccept: false }).upload(input, new File(["x"], "notes.md", { type: "text/markdown" }));
    expect(await screen.findByText("Only PDF, .txt and .md files are supported.")).toBeInTheDocument();
  });

  it("hints before uploading when the type or size is clearly wrong", async () => {
    const { calls } = mockFetch((url) => (url.endsWith("/usage") ? usage : { documents: [] }));
    renderWithProviders(<Documents pollMs={40} />);
    await screen.findByText(/No documents yet/);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.setup({ applyAccept: false }).upload(input, new File(["x"], "pic.png", { type: "image/png" }));
    expect(await screen.findByText(/pic.png: unsupported type/)).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("deletes a document and refreshes the list", async () => {
    let docs = [doc({ status: "ready", chunk_count: 3 })];
    const { calls } = mockFetch((url, init) => {
      if (url.endsWith("/usage")) return usage;
      if (init?.method === "DELETE") { docs = []; return { status: 204 }; }
      return { documents: docs };
    });
    renderWithProviders(<Documents pollMs={40} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete handbook.md" }));
    await waitFor(() => expect(screen.getByText(/No documents yet/)).toBeInTheDocument());
    expect(calls.some((c) => c.init?.method === "DELETE" && c.url.endsWith("/api/dashboard/documents/d1"))).toBe(true);
  });
});
