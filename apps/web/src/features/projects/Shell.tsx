import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { authClient } from "../../shared/lib/auth-client";
import { PageFade } from "../../shared/motion/motion";
import { Logo } from "../../shared/ui/Logo";
import { readSession } from "../auth/sessionShape";
import { useSignOut } from "../auth/useSignOut";
import { useProject, useWorkspaces } from "./projectsContext";
import { UsageMeters } from "./UsageMeters";

export const TABS = [
  ["documents", "Documents", "01"],
  ["keys", "API keys", "02"],
  ["try", "Try it", "03"],
  ["analytics", "Analytics", "04"],
  ["requests", "Requests", "05"],
  ["models", "Models", "06"],
  ["settings", "Settings", "07"],
] as const;

export function Shell() {
  const session = readSession(authClient.useSession());
  const project = useProject();
  const workspaces = useWorkspaces();
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, failed } = useSignOut();
  const email = session.user?.email ?? "";
  const tab = location.pathname.split("/")[3] || "documents";
  const projects = workspaces.data ?? [project];

  return (
    <div className="app">
      <aside className="sidebar">
        <Logo size="sm" />
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
        <Link to="/projects" className="nav-sub">
          All projects
        </Link>
        <nav aria-label="Dashboard" className="nav">
          {TABS.map(([path, label, num]) => (
            <NavLink
              key={path}
              to={`/projects/${project.slug}/${path}`}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              {label}
              <span className="mono nav-num">{num}</span>
            </NavLink>
          ))}
        </nav>
        <Link to="/docs" className="nav-sub">
          Docs
        </Link>
        <UsageMeters />
        <Link to="/account" className="chip-user">
          <span className="avatar" aria-hidden="true">
            {(project.name[0] ?? "L").toUpperCase()}
          </span>
          <div className="chip-text">
            <div className="ellipsis">{project.name}</div>
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
