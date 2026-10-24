import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../shared/lib/api";
import { Dialog } from "../../shared/ui/Dialog";
import { ErrorText, PageHead } from "../../shared/ui/ui";
import { useProject } from "./projectsContext";

export function Settings() {
  const project = useProject();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canEdit = project.role === "owner" || project.role === "admin";
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api(`/api/dashboard/workspaces/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
        }),
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () =>
      api(`/api/dashboard/workspaces/${project.id}`, {
        method: "DELETE",
        body: JSON.stringify({ name: project.name }),
      }),
    onSuccess: () => {
      qc.clear();
      navigate("/projects");
    },
    onError: (e: Error) => setDeleteError(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    setError("");
    save.mutate();
  };
  const closeDelete = () => {
    setConfirming(false);
    setTyped("");
    setDeleteError("");
  };

  return (
    <div className="stack">
      <PageHead title="Settings" />
      <form onSubmit={submit} className="card form-card maxw" aria-label="Project details">
        <div className="label">PROJECT</div>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
            maxLength={60}
            required
          />
        </label>
        <label className="field">
          <span>Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            maxLength={500}
          />
        </label>
        <ErrorText>{error}</ErrorText>
        {saved && (
          <div role="status" className="small lime">
            Saved.
          </div>
        )}
        {canEdit ? (
          <div className="row-end">
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              Save changes
            </button>
          </div>
        ) : (
          <div className="small muted-3">Only an owner or admin can change these.</div>
        )}
      </form>
      {project.role === "owner" && (
        <section className="card danger-card maxw" aria-labelledby="danger-h">
          <div className="label red">DANGER ZONE</div>
          <h2 id="danger-h" className="card-title-sm">
            Delete this project
          </h2>
          <p className="small muted-2">
            Deleting removes this project's documents, passages, API keys, models, requests and
            usage records. It cannot be undone.
          </p>
          <div>
            <button
              type="button"
              className="btn btn-outline danger"
              onClick={() => setConfirming(true)}
            >
              Delete project
            </button>
          </div>
        </section>
      )}
      {confirming && (
        <Dialog title="Delete this project?" label="CONFIRM" onClose={closeDelete}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setDeleteError("");
              remove.mutate();
            }}
            className="stack-sm"
          >
            <label className="field">
              <span>Type {project.name} to confirm</span>
              <input
                data-autofocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </label>
            <ErrorText>{deleteError}</ErrorText>
            <div className="row-end">
              <button type="button" className="btn btn-outline" onClick={closeDelete}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary danger-fill"
                disabled={typed !== project.name || remove.isPending}
              >
                Delete forever
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
