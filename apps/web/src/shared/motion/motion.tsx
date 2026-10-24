import { animate, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { prefersReducedMotion, useInView, useInViewOnce } from "./useInViewOnce";

// All motion here is opacity and transform only (no layout shift) and stays under 600 ms. Reveal animates in when the
// element enters the viewport and out again when it has left it (replayable). Before the first measurement the content is
// fully visible, and under prefers-reduced-motion nothing is ever hidden.
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const [ref, state] = useInView<HTMLElement>();
  const Tag = as as "div";
  if (prefersReducedMotion()) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={`reveal${className ? ` ${className}` : ""}`}
      data-state={state}
      style={state === "in" && delay ? { transitionDelay: `${Math.min(delay, 0.3)}s` } : undefined}
    >
      {children}
    </Tag>
  );
}

// Route change: a short fade of the new page.
export function PageFade({ id, children }: { id: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

// Counts a whole number up from 0 (about 0.6 s) once it is in view. Reduced motion, or a value that is not a whole number, shows the value at once.
export function CountUp({
  value,
  format = (n: number) => n.toLocaleString("en-US"),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const [ref, seen] = useInViewOnce<HTMLSpanElement>();
  const [shown, setShown] = useState(reduce ? value : 0);
  const first = useRef(true);
  useEffect(() => {
    if (reduce || !Number.isFinite(value)) {
      setShown(value);
      return;
    }
    if (!seen) return; // counts up when it is first seen, not on load
    const c = animate(first.current ? 0 : shown, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    first.current = false;
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, seen]);
  return <span ref={ref}>{format(reduce ? value : shown)}</span>;
}
