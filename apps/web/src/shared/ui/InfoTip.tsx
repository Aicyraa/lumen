import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";

// Info icon with a tooltip: opens on hover and keyboard focus, closes on leave, blur and Escape.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const tip = useRef<HTMLSpanElement>(null);
  // Measure on open: when the tooltip would run past the right edge of the viewport, anchor it to the button's right edge.
  useLayoutEffect(() => {
    if (!open) return setAlignRight(false);
    const r = tip.current?.getBoundingClientRect();
    if (r && r.right > window.innerWidth - 16) setAlignRight(true);
  }, [open]);
  return (
    <span className="infotip" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={label}
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7v4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.7" r="0.9" fill="currentColor" />
        </svg>
      </button>
      <span
        ref={tip}
        id={id}
        role="tooltip"
        className={`infotip-tip${alignRight ? " align-right" : ""}`}
        hidden={!open}
      >
        {children}
      </span>
    </span>
  );
}
