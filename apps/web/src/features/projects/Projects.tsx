import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { api, post } from "../../shared/lib/api";
import { authClient } from "../../shared/lib/auth-client";
import { fmtDate, fmtInt } from "../../shared/lib/format";
import { usePageTitle } from "../../shared/lib/usePageTitle";
import { Reveal } from "../../shared/motion/motion";
import { Dialog } from "../../shared/ui/Dialog";
import { Plus } from "../../shared/ui/icons";
import { Loading } from "../../shared/ui/Loading";
import { ErrorText } from "../../shared/ui/ui";
import type { AccountInfo } from "../account/types";
import { readSession } from "../auth/sessionShape";
import { useWorkspaces } from "./projectsContext";

export function Projects() {
  usePageTitle("Projects");
  const ws = useWorkspaces();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () =>
      post("/api/dashboard/workspaces", {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["account"] });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });
  const close = () => {
    setCreating(false);
    setName("");
    setDescription("");
    setError("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    create.mutate();
  };
  const list = ws.data ?? [];
  const userId = readSession(authClient.useSession()).userId;
  // Optional: the strip falls back to sums over the project list when the account data is not available.
  const account = useQuery({
    queryKey: ["account", userId],
    enabled: !!userId,
    retry: false,
    queryFn: () => api<AccountInfo>("/api/dashboard/account"),
  });
  const acc = account.data;
  const docs = acc?.totals?.documents ?? list.reduce((a, p) => a + p.documents, 0);
  const reqs =
    acc?.totals?.requests_this_month ?? list.reduce((a, p) => a + p.requests_this_month, 0);
  const projectsText = acc?.projects
    ? `${fmtInt(acc.projects.owned)} of ${fmtInt(acc.projects.max)}`
    : fmtInt(list.length);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="label">YOUR PROJECTS</div>
          <h1 className="page-title">Projects</h1>
        </div>
      </div>
      <p className="body muted-2 maxw">
        Each project has its own documents, API keys, models, requests and analytics. Nothing is
        shared between projects.
      </p>
      {ws.isSuccess && (
        <section className="strip" aria-label="Summary">
          {(
            [
              ["Projects", projectsText],
              ["Documents", fmtInt(docs)],
              ["Requests this month", fmtInt(reqs)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="strip-item">
              <div className="label">{k}</div>
              <div className="strip-value">{v}</div>
            </div>
          ))}
        </section>
      )}
      {ws.isPending && <Loading />}
      {ws.isError && (
        <div>
          <ErrorText>{(ws.error as Error).message}</ErrorText>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => ws.refetch()}>
            Retry
          </button>
        </div>
      )}
      {ws.isSuccess && !list.length && (
        <div className="empty">No projects yet. Create one to get started.</div>
      )}
      <ul className="cards">
        {list.map((p, i) => (
          <Reveal as="li" key={p.id} delay={i * 0.05}>
            <Link to={`/projects/${p.slug}/documents`} className="card project-card">
              <div className="row-between">
                <h2 className="card-title-sm">{p.name}</h2>
                <span className="badge">{p.role}</span>
              </div>
              <p className="small muted-2 project-desc">{p.description ?? "No description"}</p>
              <dl className="kv">
                <div>
                  <dt>DOCUMENTS</dt>
                  <dd>{fmtInt(p.documents)}</dd>
                </div>
                <div>
                  <dt>REQUESTS THIS MONTH</dt>
                  <dd>{fmtInt(p.requests_this_month)}</dd>
                </div>
              </dl>
              <div className="mono small muted-3 project-foot">Created {fmtDate(p.created_at)}</div>
            </Link>
          </Reveal>
        ))}
        {ws.isSuccess && (
          <li>
            <button
              type="button"
              className="card create-card"
              aria-label="Create project"
              onClick={() => setCreating(true)}
            >
              <Plus size={22} />
              <span>Create project</span>
              <span className="small muted-3">Its own documents, keys and models.</span>
            </button>
          </li>
        )}
      </ul>
      {creating && (
        <Dialog title="Create project" label="NEW PROJECT" onClose={close}>
          <form onSubmit={submit} className="stack-sm">
            <label className="field">
              <span>Name</span>
              <input
                data-autofocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
              />
            </label>
            <label className="field">
              <span>Description (optional)</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </label>
            <ErrorText>{error}</ErrorText>
            <div className="row-end">
              <button type="button" className="btn btn-outline" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                Create
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
