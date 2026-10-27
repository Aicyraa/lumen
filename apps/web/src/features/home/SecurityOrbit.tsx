import { animate } from "motion/react";
import { type CSSProperties, useEffect, useRef } from "react";
import { Reveal } from "../../shared/motion/motion";
import { prefersReducedMotion } from "../../shared/motion/useInViewOnce";
import { LineIcon } from "./art";

const PERIOD_S = 48; // one lap
const STEPS = 72; // frames per lap (every 5 degrees; the chord error is about 0.1% of the radius)

// Frames of one lap round the ellipse, starting at fraction `f` of a turn, clockwise on screen. Percentages of the node's
// own box, which is as wide and as tall as the ellipse, so +-50% is the radius and the numbers need no pixel measuring.
// The last frame repeats the first so the loop has no seam.
function lap(f: number) {
  const pts = Array.from({ length: STEPS }, (_, k) => 2 * Math.PI * (k / STEPS + f));
  const pct = (fn: (a: number) => number) => {
    const v = pts.map((a) => `${(fn(a) * 50).toFixed(3)}%`);
    return [...v, v[0]];
  };
  return { x: pct(Math.cos), y: pct(Math.sin) };
}

// The four guarantees as a list with their icons, and the same icons circling a shield on a flat ellipse. The ring is drawing
// only (hidden from assistive tech, not interactive); the list carries the text. Each node is one Motion animation of its
// translate (x and y are hardware accelerated, so the icons glide on the compositor). The animation pauses while the ring is
// off screen. Without script, or under prefers-reduced-motion, the CSS puts each node at its place on the ring and it stays.
export function SecurityOrbit({
  items,
  icons,
}: {
  items: readonly (readonly [title: string, body: string, short: string])[];
  icons: readonly string[];
}) {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el || prefersReducedMotion()) return;
    const nodes = [...el.querySelectorAll<HTMLElement>(".orbit-node")];
    const runs = nodes.map((node, i) =>
      animate(node, lap(i / nodes.length + 0.125), {
        duration: PERIOD_S,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }),
    );
    const io =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([e]) => {
            for (const r of runs) e.isIntersecting ? r.play() : r.pause();
          });
    io?.observe(el);
    return () => {
      io?.disconnect();
      for (const r of runs) r.cancel();
    };
  }, []);
  return (
    <div className="sec-orbit">
      <ul className="sec-list">
        {items.map(([title, body], i) => (
          <Reveal as="li" key={title} delay={i * 0.08} className="sec-item">
            <span className="icon-tile">
              <LineIcon name={icons[i]} />
            </span>
            <h3 className="card-title-sm">{title}</h3>
            <p className="small muted-2">{body}</p>
          </Reveal>
        ))}
      </ul>
      <div ref={stage} className="orbit-stage" aria-hidden="true">
        <span className="orbit-ring" />
        <span className="orbit-ring orbit-ring-in" />
        <span className="orbit-core icon-tile">
          <LineIcon name="shield" />
        </span>
        {items.map(([title, , short], i) => (
          <div
            key={title}
            className="orbit-node"
            style={{ "--f": i / items.length + 0.125 } as CSSProperties}
          >
            <div className="orbit-node-body">
              <span className="icon-tile">
                <LineIcon name={icons[i]} />
              </span>
              <span className="orbit-tag mono">{short}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
