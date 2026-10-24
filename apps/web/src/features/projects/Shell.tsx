import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { authClient } from "../../shared/lib/auth-client";
import { PageFade } from "../../shared/motion/motion";
import { LogoMark } from "../../shared/ui/Logo";
import { readSession } from "../auth/sessionShape";
import { useSignOut } from "../auth/useSignOut";
import { ProjectMenu } from "./ProjectMenu";
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
        <div className="switcher">
          <span className="label-sm">PROJECT</span>
          <div className="switcher-row">
            <ProjectMenu
              projects={projects}
              current={project.slug}
              onSelect={(slug) => navigate(`/projects/${slug}/${tab}`)}
            />
            <Link
              to="/projects"
              className="icon-btn"
              aria-label="All projects"
              title="All projects"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <g fill="none" stroke="currentColor" strokeWidth="1.3">
                  <rect x="2" y="2" width="5" height="5" rx="1" />
                  <rect x="9" y="2" width="5" height="5" rx="1" />
                  <rect x="2" y="9" width="5" height="5" rx="1" />
                  <rect x="9" y="9" width="5" height="5" rx="1" />
                </g>
              </svg>
            </Link>
          </div>
        </div>
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
        <Link to="/projects" className="brand-foot" aria-label="Lumen, all projects">
          <LogoMark className="brand-mark" />
          lumen
        </Link>
      </aside>
      <main className="content">
        <PageFade id={location.pathname}>
          <Outlet />
        </PageFade>
      </main>
    </div>
  );
}
