import { motion } from "motion/react";
import { Suspense } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { authClient } from "../../shared/lib/auth-client";
import { PageFade } from "../../shared/motion/motion";
import { Loading } from "../../shared/ui/Loading";
import { readSession } from "../auth/sessionShape";
import { useSignOut } from "../auth/useSignOut";
import { useProject } from "./projectsContext";
import { SwitchProject } from "./SwitchProject";
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
  const location = useLocation();
  const { signOut, failed } = useSignOut();
  const email = session.user?.email ?? "";
  // Better Auth stores the provider name (Google name; GitHub name or login); email sign-up stores the name given there.
  const displayName = session.user?.name?.trim() || email.split("@")[0] || "Account";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-top">
          <SwitchProject />
          <div className="project-label ellipsis">{project.name}</div>
        </div>
        <nav aria-label="Dashboard" className="nav">
          {TABS.map(([path, label]) => (
            <NavLink
              key={path}
              to={`/projects/${project.slug}/${path}`}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="nav-pill"
                      transition={{ duration: 0.2 }}
                    />
                  )}
                  {label}
                </>
              )}
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
        {failed && (
          <div role="alert" className="error-text signout-error">
            Could not sign out, please try again{" "}
            <button type="button" className="link-btn red" onClick={() => void signOut()}>
              Retry
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn btn-outline signout-btn"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </aside>
      <main className="content">
        <PageFade id={location.pathname}>
          <Suspense fallback={<Loading label="Loading page…" />}>
            <Outlet />
          </Suspense>
        </PageFade>
      </main>
    </div>
  );
}
