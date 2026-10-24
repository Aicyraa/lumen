import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { authClient } from "../../shared/lib/auth-client";
import { PageFade } from "../../shared/motion/motion";
import { readSession } from "../auth/sessionShape";
import { useSignOut } from "../auth/useSignOut";
import { useProject, useWorkspaces } from "./projectsContext";
import { UsageMeters } from "./UsageMeters";

export const TABS = [
  ["documents", "Documents"],
  ["keys", "API keys"],
  ["try", "Try it"],
  ["analytics", "Analytics"],
  ["requests", "Requests"],
  ["models", "Models"],
  ["settings", "Settings"],
] as const;

export function Shell() {
  const session = readSession(authClient.useSession());
  const project = useProject();
  const workspaces = useWorkspaces();
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, failed } = useSignOut();
  const email = session.user?.email ?? "";
  // Better Auth stores the provider name (Google name; GitHub name or login); email sign-up stores the name given there.
  const displayName = session.user?.name?.trim() || email.split("@")[0] || "Account";
  const tab = location.pathname.split("/")[3] || "documents";
  const projects = workspaces.data ?? [project];

  return (
    <div className="app">
      <aside className="sidebar">
        <label className="switcher">
          <span className="label-sm">PROJECT</span>
          <select
            aria-label="Project"
            value={project.slug}
            onChange={(e) => navigate(`/projects/${e.target.value}/${tab}`)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Link to="/projects" className="btn btn-outline btn-sm all-projects">
          All projects
        </Link>
        <nav aria-label="Dashboard" className="nav">
          {TABS.map(([path, label]) => (
            <NavLink
              key={path}
              to={`/projects/${project.slug}/${path}`}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <UsageMeters />
        <Link to="/account" className="chip-user">
          <span className="avatar" aria-hidden="true">
            {(displayName[0] ?? "L").toUpperCase()}
          </span>
          <div className="chip-text">
            <div className="ellipsis">{displayName}</div>
            <div className="small muted-3 ellipsis">{email}</div>
          </div>
        </Link>
        <button type="button" className="signout mono" onClick={() => void signOut()}>
          Sign out
        </button>
        {failed && (
          <div role="alert" className="error-text signout-error">
            Could not sign out, please try again{" "}
            <button type="button" className="link-btn red" onClick={() => void signOut()}>
              Retry
            </button>
          </div>
        )}
      </aside>
      <main className="content">
        <PageFade id={location.pathname}>
          <Outlet />
        </PageFade>
      </main>
    </div>
  );
}
