import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ErrorText, PageHead, StatusDot } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { fmtDate, fmtInt } from "../../lib/format";
import { useOrgId } from "../../lib/session";
import type { Doc, Usage } from "../../lib/types";

const ALLOWED = /\.(pdf|txt|md)$/i;
const MAX_BYTES = 10 * 1024 * 1024; // a hint only: the server's limit decides

export const DOC_POLL_MS = 2000;

// Refetch while anything is still processing; stop as soon as every document is ready or failed.
export const docPollInterval = (docs: Doc[] | undefined, ms: number) => (docs?.some((d) => d.status === "processing") ? ms : false);

export function Documents({ pollMs = DOC_POLL_MS }: { pollMs?: number }) {
  const qc = useQueryClient();
  const org = useOrgId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);

  const docs = useQuery({
    queryKey: ["documents", org],
    enabled: !!org,
    queryFn: () => api<{ documents: Doc[] }>("/api/dashboard/documents").then((r) => r.documents),
    refetchInterval: (q) => docPollInterval(q.state.data, pollMs),
  });
  const usage = useQuery({ queryKey: ["usage", org], enabled: !!org, queryFn: () => api<Usage>("/api/dashboard/usage") });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["documents", org] }); qc.invalidateQueries({ queryKey: ["usage", org] }); };

  const upload = useMutation({
    mutationFn: (file: File) => { const f = new FormData(); f.append("file", file); return api("/api/dashboard/documents", { method: "POST", body: f }); },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/dashboard/documents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  async function addFiles(list: FileList | null) {
    setError("");
    for (const f of Array.from(list ?? [])) {
      if (!ALLOWED.test(f.name)) { setError(`${f.name}: unsupported type. Use PDF, .txt or .md.`); continue; }
      if (f.size > MAX_BYTES) { setError(`${f.name}: file is over 10 MB.`); continue; }
      try { await upload.mutateAsync(f); } catch (e) { setError(e instanceof ApiError ? e.message : "Upload failed."); }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const list = docs.data ?? [];
  const chunks = list.filter((d) => d.status === "ready").reduce((a, d) => a + d.chunk_count, 0);
  const summary = usage.data ? `${fmtInt(usage.data.documents.used)} OF ${fmtInt(usage.data.documents.max)} · ${fmtInt(chunks)} CHUNKS` : "";

  return (
    <div className="stack">
      <PageHead num="01" title="Documents"><div className="mono muted-3" aria-live="polite">{summary}</div></PageHead>
      <div className={`dropzone${drag ? " drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}>
        <div>
          <div className="dz-title">Drop files to upload</div>
          <div className="small muted-3">PDF, .txt or .md · up to 10 MB each</div>
        </div>
        <label className="btn btn-primary">
          Choose files
          <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md" className="visually-hidden" aria-label="Choose files" onChange={(e) => void addFiles(e.target.files)} />
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="table" role="table" aria-label="Documents">
        <div className="tr th docs-cols" role="row"><span role="columnheader">FILE</span><span role="columnheader">STATUS</span><span role="columnheader">CHUNKS</span><span role="columnheader">UPLOADED</span><span role="columnheader" /></div>
        {list.map((d) => (
          <div className="tr docs-cols" role="row" key={d.document_id}>
            <div role="cell" className="cell-min"><div className="ellipsis">{d.filename}</div>{d.error && <div className="small red">{d.error}</div>}</div>
            <div role="cell"><StatusDot tone={d.status}>{d.status}</StatusDot></div>
            <div role="cell" className="mono muted-2">{d.status === "processing" ? "—" : d.chunk_count}</div>
            <div role="cell" className="small muted-3">{fmtDate(d.created_at)}</div>
            <div role="cell" className="right"><button type="button" className="link-btn danger-hover" aria-label={`Delete ${d.filename}`} onClick={() => remove.mutate(d.document_id)}>Delete</button></div>
          </div>
        ))}
        {docs.isSuccess && !list.length && <div className="empty">No documents yet. Upload one to start answering questions.</div>}
        {docs.isError && <ErrorText>{(docs.error as Error).message}</ErrorText>}
      </div>
    </div>
  );
}
