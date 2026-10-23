import { useEffect, useState, type ReactNode } from "react";
import { PublicLayout, SectionLabel } from "./PublicLayout";

export interface TocItem { id: string; label: string }

// Highlights the table-of-contents entry of the section that is currently near the top of the viewport.
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting);
      if (seen.length) setActive(seen[0].target.id);
    }, { rootMargin: "-15% 0px -70% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [ids]);
  return active;
}

// Shared by Docs and Privacy: a sticky table of contents beside a readable, width-limited column.
export function DocLayout({ label, title, lead, toc, children }: { label: string; title: string; lead: ReactNode; toc: TocItem[]; children: ReactNode }) {
  const active = useScrollSpy(toc.map((t) => t.id));
  return (
    <PublicLayout>
      <div className="doc-page">
        <nav aria-label="On this page" className="doc-toc">
          <div className="label-sm">ON THIS PAGE</div>
          <ul>
            {toc.map((t) => (
              <li key={t.id}><a href={`#${t.id}`} aria-current={active === t.id ? "true" : undefined}>{t.label}</a></li>
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
