import {
  Children,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { PublicLayout, SectionLabel } from "../../shared/ui/PublicLayout";

export interface TocItem {
  id: string;
  label: string;
}

// Highlights the table-of-contents entry of the section that is currently near the top of the viewport.
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join("|"); // a stable dependency: the caller builds a new array every render
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id);
        // the section reading position is in: the last one in page order that is currently inside the band
        const current = [...ids].reverse().find((id) => visible.has(id));
        if (current) setActive(current);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

// Shared by Docs and Privacy: a sticky table of contents beside a readable, width-limited column.
export function DocLayout({
  label,
  title,
  lead,
  toc,
  children,
}: {
  label: string;
  title: string;
  lead: ReactNode;
  toc: TocItem[];
  children: ReactNode;
}) {
  const active = useScrollSpy(toc.map((t) => t.id));
  return (
    <PublicLayout>
      <div className="doc-page">
        <nav aria-label="On this page" className="doc-toc">
          <div className="label-sm">ON THIS PAGE</div>
          <ul>
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} aria-current={active === t.id ? "true" : undefined}>
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="doc-content">
          <SectionLabel>{label}</SectionLabel>
          <h1 className="doc-h1">{title}</h1>
          <div className="lead">{lead}</div>
          {children}
        </main>
      </div>
    </PublicLayout>
  );
}

// Docs: every section is its own tab. The selected tab lives in the URL hash (#errors), so links work and Back
// moves between tabs. Children are <section id> elements; only the one named by the hash is visible.
export function DocTabs({
  label,
  title,
  lead,
  toc,
  children,
}: {
  label: string;
  title: string;
  lead: ReactNode;
  toc: TocItem[];
  children: ReactNode;
}) {
  const hash = useLocation().hash.slice(1);
  const navigate = useNavigate();
  const active = toc.some((t) => t.id === hash) ? hash : toc[0].id;
  const select = (id: string) => navigate({ hash: `#${id}` });

  function onKeyDown(e: KeyboardEvent, i: number) {
    const last = toc.length - 1;
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (i + 1) % toc.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (i - 1 + toc.length) % toc.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (to < 0) return;
    e.preventDefault();
    document.getElementById(`tab-${toc[to].id}`)?.focus();
    select(toc[to].id);
  }

  return (
    <PublicLayout>
      <div className="doc-page">
        <div className="doc-toc">
          <div className="label-sm">SECTIONS</div>
          <div role="tablist" aria-label="Docs sections" aria-orientation="vertical">
            {toc.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={active === t.id ? 0 : -1}
                onClick={() => select(t.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <main className="doc-content">
          <SectionLabel>{label}</SectionLabel>
          <h1 className="doc-h1">{title}</h1>
          <div className="lead">{lead}</div>
          {Children.toArray(children).map((child) => {
            const id = isValidElement<{ id?: string }>(child) ? child.props.id : undefined;
            if (!id) return child;
            return (
              <div
                key={id}
                role="tabpanel"
                id={`panel-${id}`}
                aria-labelledby={`tab-${id}`}
                hidden={id !== active}
                className="doc-panel"
              >
                {child}
              </div>
            );
          })}
        </main>
      </div>
    </PublicLayout>
  );
}
