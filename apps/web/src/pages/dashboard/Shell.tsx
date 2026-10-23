import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Logo } from "../../components/Logo";
import { UsageMeters } from "../../components/UsageMeters";
import { authClient } from "../../lib/auth-client";
import { readSession } from "../../lib/sessionShape";

export const TABS = [
  ["documents", "Documents", "01"], ["keys", "API keys", "02"], ["try", "Try it", "03"],
  ["analytics", "Analytics", "04"], ["requests", "Requests", "05"], ["models", "Models", "06"],
] as const;

export function Shell() {
  const session = readSession(authClient.useSession());
  const { data: org } = authClient.useActiveOrganization();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const email = session.user?.email ?? "";
  const workspace = org?.name ?? "Workspace";

  const [signOutError, setSignOutError] = useState(false);

  // Only leave when sign-out really worked: no throw, no error result, and no session afterwards.
  async function signOut() {
    setSignOutError(false);
    let ok = false;
    try {
      const res = await authClient.signOut();
      ok = !res?.error && !(await authClient.getSession())?.data;
    } catch {
      ok = false;
    } finally {
      qc.clear(); // nothing from this tenant stays cached, whatever happened
    }
    if (ok) navigate("/");
    else setSignOutError(true);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <Logo size="sm" />
        <nav aria-label="Dashboard" className="nav">
          {TABS.map(([path, label, num]) => (
            <NavLink key={path} to={`/dashboard/${path}`} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>{label}<span className="mono nav-num">{num}</span></NavLink>
          ))}
        </nav>
        <UsageMeters />
        <div className="chip-user">
          <span className="avatar" aria-hidden="true">{(workspace[0] ?? "L").toUpperCase()}</span>
          <div className="chip-text"><div className="ellipsis">{workspace}</div><div className="small muted-3 ellipsis">{email}</div></div>
        </div>
        <button type="button" className="signout mono" onClick={() => void signOut()}>Sign out</button>
        {signOutError && (
          <div role="alert" className="error-text signout-error">
            Could not sign out, please try again <button type="button" className="link-btn red" onClick={() => void signOut()}>Retry</button>
          </div>
        )}
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
