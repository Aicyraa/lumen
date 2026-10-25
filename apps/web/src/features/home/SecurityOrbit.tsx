import type { CSSProperties } from "react";
import { Reveal } from "../../shared/motion/motion";
import { LineIcon } from "./art";

// The four guarantees as a list with their icons, and the same icons circling a shield on a flat ellipse. The ring is drawing
// only (hidden from assistive tech, not interactive); the list carries the text. Each node moves by two eased `translate`
// animations (sideways and up-down, a quarter turn apart) that together trace the ellipse and run on the compositor, so the
// icons glide instead of snapping from pixel to pixel. The keyframes are fixed percentages of the boxes (no var()), the form
// browsers reliably hand to the compositor.
export function SecurityOrbit({
  items,
  icons,
}: {
  items: readonly (readonly [title: string, body: string, short: string])[];
  icons: readonly string[];
}) {
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
      <div className="orbit-stage" aria-hidden="true">
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
            <div className="orbit-node-y">
              <div className="orbit-node-body">
                <span className="icon-tile">
                  <LineIcon name={icons[i]} />
                </span>
                <span className="orbit-tag mono">{short}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
