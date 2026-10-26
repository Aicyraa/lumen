import { motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { usePageTitle } from "../../shared/lib/usePageTitle";
import { PublicLayout, SectionLabel } from "../../shared/ui/PublicLayout";

interface TocItem {
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
      // the page scrolls inside .doc-scroll, so that element is the observer root and the margins are relative to it
      { root: document.querySelector(".doc-scroll"), rootMargin: "-15% 0px -70% 0px" },
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

// The lime line beside the current entry; one shared layoutId per list, so it slides to the next entry.
function TocIndicator() {
  return <motion.span layoutId="toc-spy" className="toc-ind" transition={{ duration: 0.2 }} />;
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
  usePageTitle(title);
  return (
    <PublicLayout fill>
      <div className="doc-page">
        <nav aria-label="On this page" className="doc-toc">
          <div className="label-sm">ON THIS PAGE</div>
          <ul>
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} aria-current={active === t.id ? "true" : undefined}>
                  {active === t.id && <TocIndicator />}
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="doc-main">
          <div
            className="doc-scroll doc-content doc-spy"
            role="region"
            aria-label={`${title} content`}
            tabIndex={0}
          >
            <SectionLabel>{label}</SectionLabel>
            <h1 className="doc-h1">{title}</h1>
            <div className="lead">{lead}</div>
            {children}
          </div>
        </main>
      </div>
    </PublicLayout>
  );
}
