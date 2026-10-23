import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal or side drawer. Focus moves in on open, Tab stays inside, Escape closes (unless dismissable is false),
// and focus returns to the element that opened it.
export function Dialog({ title, label, onClose, dismissable = true, variant = "modal", children }: {
  title: string; label?: string; onClose: () => void; dismissable?: boolean; variant?: "modal" | "drawer"; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) { e.stopPropagation(); onClose(); }
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [dismissable, onClose]);

  return (
    <div className={`overlay overlay-${variant}`} onMouseDown={(e) => { if (dismissable && e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={variant === "drawer" ? "drawer" : "modal"}>
        {label && <div className="label lime">{label}</div>}
        <h2 id={titleId} className={variant === "drawer" ? "drawer-title" : "modal-title"}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
