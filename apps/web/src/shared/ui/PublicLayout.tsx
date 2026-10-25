import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { readSession } from "../../features/auth/sessionShape";
import { authClient } from "../lib/auth-client";
import { COPY_FAILED, useCopy } from "../lib/useCopy";
import { highlight, type Lang } from "./highlight";
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

// Three muted window dots: the terminal / editor chrome shared by every code block.
export function TermDots() {
  return (
    <span className="term-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

// A code block with syntax colours and line numbers. `copyable` wraps it in a window with a title bar and a Copy button;
// without it only the <pre> is returned, for a parent that draws its own window (the home quickstart).
// `minLines` fixes the height to that many lines, so switching between snippets of different length moves nothing below.
export function CodeBlock({
  children,
  testId,
  copyable = false,
  lang = "text",
  minLines,
}: {
  children: string;
  testId?: string;
  copyable?: boolean;
  lang?: Lang;
  minLines?: number;
}) {
  const clip = useCopy(1500);
  const copied = clip.state === "copied";
  const pre = (
    <pre
      className={`code${minLines ? " code-fixed" : ""}`}
      data-lang={lang}
      data-testid={testId}
      tabIndex={0}
      style={minLines ? ({ "--min-lines": minLines } as CSSProperties) : undefined}
    >
      {highlight(children, lang).map((line, i) => (
        <span key={i} className="ln">
          {line.map((t, j) =>
            t.kind ? (
              <span key={j} className={`tk-${t.kind}`}>
                {t.text}
              </span>
            ) : (
              t.text
            ),
          )}
        </span>
      ))}
    </pre>
  );
  if (!copyable) return pre;
  return (
    <div className="term">
      <div className="term-bar">
        <TermDots />
        <span className="term-title mono">{lang === "text" ? "code" : lang}</span>
        <button
          type="button"
          className="btn btn-outline btn-sm mono"
          aria-label={copied ? "Copied" : "Copy code"}
          onClick={() => void clip.copy(children)}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {pre}
      {clip.state === "failed" && (
        <p role="alert" className="small red copy-note">
          {COPY_FAILED}
        </p>
      )}
    </div>
  );
}
