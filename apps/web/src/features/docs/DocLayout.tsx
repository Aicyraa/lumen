import { useEffect, useState, type ReactNode } from "react";
import { PublicLayout, SectionLabel } from "../../shared/ui/PublicLayout";

export interface TocItem { id: string; label: string }

// Highlights the table-of-contents entry of the section that is currently near the top of the viewport.
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join("|"); // a stable dependency: the caller builds a new array every render
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id));
      // the section reading position is in: the last one in page order that is currently inside the band
      const current = [...ids].reverse().find((id) => visible.has(id));
      if (current) setActive(current);
    }, { rootMargin: "-15% 0px -70% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
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
