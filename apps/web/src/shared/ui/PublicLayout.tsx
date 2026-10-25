import type { ReactNode } from "react";
import { Link } from "react-router";
import { readSession } from "../../features/auth/sessionShape";
import { authClient } from "../lib/auth-client";
import { COPY_FAILED, useCopy } from "../lib/useCopy";
import { Logo } from "./Logo";

export function PublicLayout({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  const signedIn = !!readSession(authClient.useSession()).user;
  return (
    <div className={`public${fill ? " public-fill" : ""}`}>
      <header className="pub-nav">
        <nav aria-label="Main" className="pub-nav-left">
          <Link to="/#how">Product</Link>
          <Link to="/docs">Docs</Link>
        </nav>
        <Logo />
        <div className="pub-nav-right">
          {signedIn ? (
            <Link to="/projects" className="btn btn-primary btn-sm">
              Projects
            </Link>
          ) : (
            <>
              <Link to="/signin" className="muted-2">
                Sign in
              </Link>
              <Link to="/signin" className="btn btn-primary btn-sm">
                Get an API key
              </Link>
            </>
          )}
        </div>
      </header>
      {children}
      <footer className="pub-footer">
        <span>© 2026 Lumen</span>
        <nav aria-label="Footer">
          <Link to="/docs">Docs</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="label">{children}</div>;
}

export function CodeBlock({
  children,
  testId,
  copyable = false,
}: {
  children: string;
  testId?: string;
  copyable?: boolean;
}) {
  const clip = useCopy(1500);
  const copied = clip.state === "copied";
  const pre = (
    <pre className="code" data-testid={testId} tabIndex={0}>
      {children}
    </pre>
  );
  if (!copyable) return pre;
  return (
    <div className="codewrap">
      {pre}
      <button
        type="button"
        className="btn btn-outline btn-sm mono copy-btn"
        aria-label={copied ? "Copied" : "Copy code"}
        onClick={() => void clip.copy(children)}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {clip.state === "failed" && (
        <p role="alert" className="small red copy-note">
          {COPY_FAILED}
        </p>
      )}
    </div>
  );
}
