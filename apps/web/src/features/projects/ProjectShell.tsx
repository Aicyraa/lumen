import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { authClient } from "../../shared/lib/auth-client";
import { Loading } from "../../shared/ui/Loading";
import { Unreachable } from "../../shared/ui/Unreachable";
import { readSession } from "../auth/sessionShape";
import { ProjectContext, useWorkspaces } from "./projectsContext";
import { Shell } from "./Shell";

// /projects/:slug. Entering a project makes it the session's active project (the API's tenant), then re-reads the
// session without the cookie cache and drops all cached data from the previous project. Only then is the page shown.
export function ProjectShell() {
  const { slug } = useParams();
  const s = readSession(authClient.useSession());
  const qc = useQueryClient();
  const ws = useWorkspaces();
  const project = ws.data?.find((w) => w.slug === slug);
  const attempted = useRef("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!project) return;
    if (s.orgId === project.id) {
      attempted.current = "";
      setFailed(false);
      return;
    }
    if (attempted.current === project.id) return; // one attempt per entry; Retry resets it
    attempted.current = project.id;
    setBusy(true);
    (async () => {
      try {
        const r = await authClient.organization.setActive({ organizationId: project.id });
        if (r?.error) throw new Error(r.error.message);
        qc.clear();
        await s.refetch?.({ query: { disableCookieCache: true } });
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    })();
  }, [project, s.orgId, s.refetch, qc, retry]);

  if (ws.isError) return <Unreachable onRetry={() => ws.refetch()} />;
  if (ws.isPending) return <Loading />;
  if (!project)
    return (
      <div role="alert" className="fatal">
        <h1 className="h2s">Project not found</h1>
        <p className="body muted-2">This project does not exist or you are not a member of it.</p>
        <Link to="/projects" className="btn btn-outline">
          All projects
        </Link>
      </div>
    );
  if (failed)
    return (
      <div role="alert" className="fatal">
        <h1 className="h2s">Could not open this project</h1>
        <div className="row-gap">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              attempted.current = "";
              setFailed(false);
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </button>
          <Link to="/projects" className="btn btn-outline">
            All projects
          </Link>
        </div>
      </div>
    );
  if (busy || s.orgId !== project.id) return <Loading label="Opening project…" />;
  return (
    <ProjectContext.Provider value={project}>
      <Shell />
    </ProjectContext.Provider>
  );
}
