import { motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal or side drawer. Focus moves in on open, Tab stays inside, Escape closes (unless dismissable is false),
// and focus returns to the element that opened it.
export function Dialog({
  title,
  label,
  onClose,
  dismissable = true,
  variant = "modal",
  wide = false,
  children,
}: {
  title: string;
  label?: string;
  onClose: () => void;
  dismissable?: boolean;
  variant?: "modal" | "drawer";
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Latest props live in refs so the focus effect below runs once per open, not on every parent render.
  const closeRef = useRef(onClose);
  const dismissRef = useRef(dismissable);
  closeRef.current = onClose;
  dismissRef.current = dismissable;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    (
      el.querySelector<HTMLElement>("[data-autofocus]") ??
      el.querySelector<HTMLElement>(FOCUSABLE) ??
      el
    ).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className={`overlay overlay-${variant}`}
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={variant === "drawer" ? "drawer" : `modal${wide ? " modal-wide" : ""}`}
        initial={variant === "drawer" ? { x: 32, opacity: 0 } : { y: 12, scale: 0.98, opacity: 0 }}
        animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.22, ease: [0.2, 0.7, 0.1, 1] }}
      >
        {label && <div className="label lime">{label}</div>}
        <h2 id={titleId} className={variant === "drawer" ? "drawer-title" : "modal-title"}>
          {title}
        </h2>
        {children}
      </motion.div>
    </div>
  );
}
