import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Dialog } from "../components/Dialog";
import { Loading } from "../components/Loading";
import { Reveal } from "../components/motion";
import { Plus, AnimateIcon } from "../components/icons";
import { ErrorText } from "../components/ui";
import { post } from "../lib/api";
import { fmtDate, fmtInt } from "../lib/format";
import { useWorkspaces } from "../lib/projects";

export function Projects() {
  const ws = useWorkspaces();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => post("/api/dashboard/workspaces", { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workspaces"] }); close(); },
    onError: (e: Error) => setError(e.message),
  });
  const close = () => { setCreating(false); setName(""); setDescription(""); setError(""); };
  const submit = (e: FormEvent) => { e.preventDefault(); setError(""); create.mutate(); };
  const list = ws.data ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <div><div className="label">YOUR PROJECTS</div><h1 className="page-title">Projects</h1></div>
        <AnimateIcon animateOnHover asChild>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} />Create project</button>
        </AnimateIcon>
      </div>
      <p className="body muted-2 maxw">Each project has its own documents, API keys, models, requests and analytics. Nothing is shared between projects.</p>
      {ws.isPending && <Loading />}
      {ws.isError && <div><ErrorText>{(ws.error as Error).message}</ErrorText><button type="button" className="btn btn-outline btn-sm" onClick={() => ws.refetch()}>Retry</button></div>}
      {ws.isSuccess && !list.length && <div className="empty">No projects yet. Create one to get started.</div>}
      <ul className="cards">
        {list.map((p, i) => (
          <Reveal as="li" key={p.id} delay={i * 0.05}>
            <Link to={`/projects/${p.slug}/documents`} className="card project-card">
              <div className="row-between"><h2 className="card-title-sm">{p.name}</h2><span className="mono small muted-3">{p.role}</span></div>
              <p className="small muted-2 project-desc">{p.description ?? "No description"}</p>
              <dl className="kv">
                <div><dt>DOCUMENTS</dt><dd>{fmtInt(p.documents)}</dd></div>
                <div><dt>REQUESTS THIS MONTH</dt><dd>{fmtInt(p.requests_this_month)}</dd></div>
              </dl>
              <div className="mono small muted-3">Created {fmtDate(p.created_at)}</div>
            </Link>
          </Reveal>
        ))}
      </ul>
      {creating && (
        <Dialog title="Create project" label="NEW PROJECT" onClose={close}>
          <form onSubmit={submit} className="stack-sm">
            <label className="field"><span>Name</span><input data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
            <label className="field"><span>Description (optional)</span><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></label>
            <ErrorText>{error}</ErrorText>
            <div className="row-end"><button type="button" className="btn btn-outline" onClick={close}>Cancel</button><button type="submit" className="btn btn-primary" disabled={create.isPending}>Create</button></div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
