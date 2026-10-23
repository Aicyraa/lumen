import { Link, NavLink, Outlet } from "react-router";
import { useSignOut } from "../lib/useSignOut";
import { Logo } from "./Logo";

// Top bar for the pages that are not inside one project: Projects and Account.
export function AppFrame() {
  const { signOut, failed } = useSignOut();
  return (
    <div className="frame">
      <header className="frame-bar">
        <Logo />
        <nav aria-label="App" className="frame-nav">
          <NavLink to="/projects">Projects</NavLink>
          <Link to="/docs">Docs</Link>
          <NavLink to="/account">Account</NavLink>
          <button type="button" className="link-btn" onClick={() => void signOut()}>Sign out</button>
        </nav>
      </header>
      {failed && <div role="alert" className="error-text frame-alert">Could not sign out, please try again <button type="button" className="link-btn red" onClick={() => void signOut()}>Retry</button></div>}
      <main className="frame-main"><Outlet /></main>
    </div>
  );
}
