import { useEffect, useRef, useState } from "react";

// True once the element has entered the viewport (and stays true). Animations key off this so they start when the
// element is seen, not on page load. Without IntersectionObserver it is true at once, so nothing stays hidden.
export function useInViewOnce<T extends Element>(rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return [ref, seen] as const;
}

export type InViewState = "idle" | "in" | "out";

// Enter and leave tracking. "idle" until the first measurement (idle content is fully visible, so nothing is hidden before
// we know where the element is); "in" once a good part of it (12%) is visible; "out" only once it is completely gone.
// The gap between 12% and 0% is the hysteresis that stops flicker at the edges. replay=false is the once-only mode.
// Without IntersectionObserver it is "in" at once.
export function useInView<T extends Element>({
  replay = true,
  rootMargin = "0px 0px -6% 0px",
} = {}) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<InViewState>(
    typeof IntersectionObserver === "undefined" ? "in" : "idle",
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.12) {
            setState("in");
            if (!replay) io.disconnect();
          } else if (!e.isIntersecting && replay) setState("out");
        }
      },
      { rootMargin, threshold: [0, 0.12] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [replay, rootMargin]);
  return [ref, state] as const;
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
