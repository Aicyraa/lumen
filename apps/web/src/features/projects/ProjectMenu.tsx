import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";

interface Entry {
  key: string;
  label: string;
  slug: string | null; // null = the "All projects" entry
}

// Custom project dropdown (button + listbox) that replaces the native select in the sidebar.
// Focus moves to the listbox while it is open (aria-activedescendant) and returns to the button on close.
export function ProjectMenu({
  projects,
  current,
  onSelect,
}: {
  projects: { slug: string; name: string }[];
  current: string;
  onSelect: (slug: string) => void;
}) {
  const navigate = useNavigate();
  const base = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const entries: Entry[] = [
    ...projects.map((p) => ({ key: p.slug, label: p.name, slug: p.slug })),
    { key: "all", label: "All projects", slug: null },
  ];
  const selected = Math.max(
    0,
    entries.findIndex((e) => e.slug === current),
  );
  const [active, setActive] = useState(selected);
  const name = entries[selected]?.label ?? "";

  function show(at: number) {
    setActive(at);
    setOpen(true);
  }
  function close(refocus = true) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }
  function choose(i: number) {
    const e = entries[i];
    close();
    if (e.slug === null) navigate("/projects");
    else if (e.slug !== current) onSelect(e.slug);
  }

  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      show(selected);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      show(entries.length - 1);
    }
  }
  function onListKey(e: KeyboardEvent) {
    const last = entries.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      setActive(Math.min(last, Math.max(0, to)));
    };
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div className="pmenu" ref={root}>
      <button
        ref={button}
        type="button"
        className="pmenu-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Project: ${name}`}
        onClick={() => (open ? close() : show(selected))}
        onKeyDown={onButtonKey}
      >
        <span className="ellipsis">{name}</span>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-label="Projects"
          aria-activedescendant={`${base}-${active}`}
          className="pmenu-list"
          onKeyDown={onListKey}
        >
          {entries.map((e, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the listbox (aria-activedescendant)
            <div
              key={e.key}
              id={`${base}-${i}`}
              role="option"
              aria-selected={i === selected && e.slug !== null}
              className={`pmenu-opt${i === active ? " active" : ""}${e.slug === null ? " all" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {e.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
