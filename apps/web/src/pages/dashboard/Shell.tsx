import { useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Logo } from "../../components/Logo";
import { UsageMeters } from "../../components/UsageMeters";
import { authClient } from "../../lib/auth-client";

export const TABS = [
  ["documents", "Documents", "01"], ["keys", "API keys", "02"], ["try", "Try it", "03"],
  ["analytics", "Analytics", "04"], ["requests", "Requests", "05"], ["models", "Models", "06"],
] as const;

export function Shell() {
  const { data: session } = authClient.useSession();
  const { data: org } = authClient.useActiveOrganization();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const email = session?.user.email ?? "";
  const workspace = org?.name ?? "Workspace";

  async function signOut() {
    try {
      await authClient.signOut();
    } catch {
      // the server call failed; still leave and drop every cached tenant response below
    } finally {
      qc.clear(); // nothing from this tenant stays cached for the next sign-in, even if sign-out failed
      navigate("/");
    }
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
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
