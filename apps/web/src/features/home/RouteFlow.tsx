import { useInViewOnce } from "../../shared/motion/useInViewOnce";

// Cheap -> expensive -> fallback. The edges draw and the nodes appear once the diagram is seen (CSS, under 600 ms each);
// without the in-view class everything is already drawn, and reduced motion switches the animation off.
const NODES = [
  { id: "q", x: 20, y: 132, w: 120, label: "Question", sub: "from your chatbot" },
  { id: "r", x: 210, y: 132, w: 120, label: "Router", sub: "k and difficulty" },
  { id: "c", x: 430, y: 32, w: 170, label: "Cheap model", sub: "easy questions", accent: true },
  { id: "e", x: 430, y: 132, w: 170, label: "Expensive model", sub: "hard or unsure" },
  { id: "f", x: 430, y: 232, w: 170, label: "Fallback", sub: "when a tier fails" },
  { id: "a", x: 720, y: 132, w: 120, label: "Answer", sub: "with sources" },
] as const;

const EDGES = [
  { d: "M140 160 H210", label: "", lx: 0, ly: 0 },
  { d: "M330 160 C370 160 380 60 430 60", label: "easy", lx: 372, ly: 96 },
  { d: "M330 160 H430", label: "hard", lx: 372, ly: 152 },
  { d: "M515 88 V132", label: "unsure", lx: 523, ly: 114 },
  { d: "M515 188 V232", label: "tier fails", lx: 523, ly: 214 },
  { d: "M600 60 C660 60 670 160 720 160", label: "", lx: 0, ly: 0 },
  { d: "M600 160 H720", label: "", lx: 0, ly: 0 },
  { d: "M600 260 C660 260 670 160 720 160", label: "", lx: 0, ly: 0 },
] as const;

export function RouteFlow() {
  const [ref, seen] = useInViewOnce<SVGSVGElement>();
  return (
    <svg
      ref={ref}
      className={`route-flow${seen ? " in-view" : ""}`}
      viewBox="0 0 860 320"
      role="img"
      aria-label="Routing: a question reaches the router, which sends easy questions to the cheap model and hard ones to the expensive model; an unsure cheap answer escalates to the expensive model; if a tier fails, the fallback answers."
    >
      {EDGES.map((e, i) => (
        <g key={e.d}>
          <path
            d={e.d}
            className="rf-edge"
            pathLength={1}
            style={{ animationDelay: `${0.1 + i * 0.12}s` }}
          />
          {e.label && (
            <text
              x={e.lx}
              y={e.ly}
              className="rf-label"
              style={{ animationDelay: `${0.3 + i * 0.12}s` }}
            >
              {e.label}
            </text>
          )}
        </g>
      ))}
      {NODES.map((n, i) => (
        <g
          key={n.id}
          className={`rf-node${"accent" in n ? " rf-accent" : ""}`}
          style={{ animationDelay: `${i * 0.1}s` }}
        >
          <rect x={n.x} y={n.y} width={n.w} height={56} rx={10} />
          <text x={n.x + n.w / 2} y={n.y + 25} className="rf-title" textAnchor="middle">
            {n.label}
          </text>
          <text x={n.x + n.w / 2} y={n.y + 43} className="rf-sub" textAnchor="middle">
            {n.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}
