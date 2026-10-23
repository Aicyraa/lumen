import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "./Logo";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public">
      <header className="pub-nav">
        <nav aria-label="Main" className="pub-nav-left"><Link to="/#how">Product</Link><Link to="/docs">Docs</Link></nav>
        <Logo />
        <div className="pub-nav-right"><Link to="/signin" className="muted-2">Sign in</Link><Link to="/signin" className="btn btn-primary btn-sm">Get an API key</Link></div>
      </header>
      {children}
      <footer className="pub-footer"><span>© 2026 Lumen</span><nav aria-label="Footer"><Link to="/docs">Docs</Link><Link to="/privacy">Privacy</Link></nav></footer>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="label">{children}</div>;
}

export function CodeBlock({ children, testId }: { children: string; testId?: string }) {
  return <pre className="code" data-testid={testId} tabIndex={0}>{children}</pre>;
}
