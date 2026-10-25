import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError, api } from "../../shared/lib/api";
import { friendlyError } from "../../shared/lib/errors";
import { fmtDate, fmtInt } from "../../shared/lib/format";
import type { Doc, Usage } from "../../shared/lib/types";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { StatusMessage } from "../../shared/ui/StatusMessage";
import { ErrorText, PageHead, StatusDot } from "../../shared/ui/ui";
import { useOrgId } from "../auth/session";

export const DOC_POLL_MS = 2000;

// Refetch while anything is still processing, a little slower each time (x1.5, up to 5x the base); stop as soon as
// every document is ready or failed. `attempt` counts the polls so far.
export const docPollInterval = (docs: Doc[] | undefined, ms: number, attempt: number) =>
  docs?.some((d) => d.status === "processing")
    ? Math.min(ms * 5, Math.round(ms * 1.5 ** attempt))
    : false;

export function Documents({ pollMs = DOC_POLL_MS }: { pollMs?: number }) {
  const qc = useQueryClient();
  const org = useOrgId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState("");
  const polls = useRef(0);
  const [toDelete, setToDelete] = useState<Doc | null>(null);

  const docs = useQuery({
    queryKey: ["documents", org],
    enabled: !!org,
    queryFn: () => api<{ documents: Doc[] }>("/api/dashboard/documents").then((r) => r.documents),
    refetchInterval: (q) => docPollInterval(q.state.data, pollMs, polls.current++),
  });
  const usage = useQuery({
    queryKey: ["usage", org],
    enabled: !!org,
    queryFn: () => api<Usage>("/api/dashboard/usage"),
  });
  const refresh = () => {
    polls.current = 0; // a new or deleted document starts the backoff again
    qc.invalidateQueries({ queryKey: ["documents", org] });
    qc.invalidateQueries({ queryKey: ["usage", org] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      const f = new FormData();
      f.append("file", file);
      return api("/api/dashboard/documents", { method: "POST", body: f });
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/dashboard/documents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e: Error) => setError(friendlyError(e)),
  });

  async function addFiles(list: FileList | null) {
    setError("");
    setProgress("");
    for (const f of Array.from(list ?? [])) {
      setProgress(`Uploading ${f.name}…`);
      try {
        await upload.mutateAsync(f);
        setProgress(`Uploaded ${f.name}. It is being processed.`);
      } catch (e) {
        setProgress("");
        setError(friendlyError(e, "Upload failed."));
        if (e instanceof ApiError && e.status === 429) break; // the rest would be refused too
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const list = docs.data ?? [];
  const chunks = list.filter((d) => d.status === "ready").reduce((a, d) => a + d.chunk_count, 0);
  const summary = usage.data
    ? `${fmtInt(usage.data.documents.used)} OF ${fmtInt(usage.data.documents.max)} · ${fmtInt(chunks)} CHUNKS`
    : "";

  return (
    <div className="stack">
      <PageHead title="Documents">
        <div className="mono muted-3" aria-live="polite">
          {summary}
        </div>
      </PageHead>
      <div
        className={`dropzone${drag ? " drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <div>
          <div className="dz-title">Drop files to upload</div>
          <div className="small muted-3">PDF, .txt or .md · the server checks type and size</div>
        </div>
        <label className="btn btn-primary">
          Choose files
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md"
            className="visually-hidden"
            aria-label="Choose files"
            onChange={(e) => void addFiles(e.target.files)}
          />
        </label>
      </div>
      <div className="small muted-3" aria-live="polite">
        {progress}
      </div>
      <ErrorText>{error}</ErrorText>
      {docs.isPending && <StatusMessage state="loading">Loading documents…</StatusMessage>}
      {docs.isError && (
        <StatusMessage state="error" onRetry={() => docs.refetch()}>
          Could not load documents. {(docs.error as Error).message}
        </StatusMessage>
      )}
      {docs.isSuccess && !list.length && (
        <StatusMessage state="empty">No documents yet. Upload one to start.</StatusMessage>
      )}
      {list.length > 0 && (
        <div className="table" role="table" aria-label="Documents">
          <div className="tr th docs-cols" role="row">
            <span role="columnheader">FILE</span>
            <span role="columnheader">STATUS</span>
            <span role="columnheader">CHUNKS</span>
            <span role="columnheader">UPLOADED</span>
            <span role="columnheader" />
          </div>
          {list.map((d) => (
            <div className="tr docs-cols" role="row" key={d.document_id}>
              <div role="cell" className="cell-min">
                <div className="ellipsis">{d.filename}</div>
                {d.error && <div className="small red">{d.error}</div>}
              </div>
              <div role="cell">
                <StatusDot tone={d.status}>{d.status}</StatusDot>
              </div>
              <div role="cell" className="mono muted-2">
                {d.status === "processing" ? "—" : d.chunk_count}
              </div>
              <div role="cell" className="small muted-3">
                {fmtDate(d.created_at)}
              </div>
              <div role="cell" className="right">
                <button
                  type="button"
                  className="link-btn danger-hover"
                  aria-label={`Delete ${d.filename}`}
                  onClick={() => setToDelete(d)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {toDelete && (
        <ConfirmDialog
          title="Delete this document?"
          confirmLabel="Delete document"
          pending={remove.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            remove.mutate(toDelete.document_id);
            setToDelete(null);
          }}
        >
          "{toDelete.filename}" is removed, and its passages are no longer used for answers.
        </ConfirmDialog>
      )}
    </div>
  );
}
