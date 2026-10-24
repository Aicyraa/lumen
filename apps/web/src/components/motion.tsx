import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

// All motion here is opacity and transform only (no layout shift), stays under 600 ms, and is switched off by
// prefers-reduced-motion (MotionConfig reducedMotion="user" in App plus the checks below). The hidden starting
// state is applied by this script only, and a timer shows everything after 4 s, so content is never stuck hidden.
export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const reduce = useReducedMotion();
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 4000); return () => clearTimeout(t); }, []);
  const Tag = motion[as];
  if (reduce) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} animate={late ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }} transition={{ duration: 0.45, delay: Math.min(delay, 0.3), ease: [0.2, 0.7, 0.1, 1] }}>
      {children}
    </Tag>
  );
}

// Route change: a short fade of the new page.
export function PageFade({ id, children }: { id: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>{children}</motion.div>;
}

// Counts a whole number up from 0 (about 0.6 s). Reduced motion, or a value that is not a whole number, shows the value at once.
export function CountUp({ value, format = (n: number) => n.toLocaleString("en-US") }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const first = useRef(true);
  useEffect(() => {
    if (reduce || !Number.isFinite(value)) { setShown(value); return; }
    const c = animate(first.current ? 0 : shown, value, { duration: 0.6, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    first.current = false;
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return <>{format(reduce ? value : shown)}</>;
}
