import { useState } from "react";
import { useInView } from "../../shared/motion/useInViewOnce";

// Entrance timing (seconds). The whole staggered sequence (delays plus durations) must stay within 600 ms.
export const RF_TIMING = {
  duration: 0.28,
  nodeStep: 0.04,
  edgeStart: 0.04,
  edgeStep: 0.04,
  labelDelay: 0.2,
};
export const rfTotalSeconds = () =>
  Math.max(
    (6 - 1) * RF_TIMING.nodeStep + RF_TIMING.duration,
    RF_TIMING.edgeStart + (7 - 1) * RF_TIMING.edgeStep + RF_TIMING.duration,
    RF_TIMING.labelDelay + RF_TIMING.duration,
  );

type NodeId = "question" | "router" | "cheap" | "expensive" | "answer" | "error";
type ScenarioId = "easy" | "hard" | "fail" | "none";

const NODES: {
  id: NodeId;
  x: number;
  y: number;
  w: number;
  label: string;
  sub: string;
  desc: string;
}[] = [
  {
    id: "question",
    x: 20,
    y: 116,
    w: 170,
    label: "Question",
    sub: "from your chatbot",
    desc: "Your chatbot sends the user's question to POST /v1/chat with its API key.",
  },
  {
    id: "router",
    x: 270,
    y: 116,
    w: 170,
    label: "Router",
    sub: "k and difficulty",
    desc: "Searches only your documents, then picks the tier from the question's difficulty and the best match.",
  },
  {
    id: "cheap",
    x: 520,
    y: 4,
    w: 170,
    label: "Cheap model",
    sub: "easy questions",
    desc: "The cheap tier answers easy questions. Its models are tried top to bottom: a backup answers when the primary fails.",
  },
  {
    id: "expensive",
    x: 520,
    y: 116,
    w: 170,
    label: "Expensive model",
    sub: "hard or unsure",
    desc: "Hard or weakly matched questions go to the expensive tier. Its models are also tried top to bottom.",
  },
  {
    id: "error",
    x: 520,
    y: 228,
    w: 170,
    label: "502 error",
    sub: "provider_error",
    desc: "If every model of the chosen tier fails or times out, the request returns 502 provider_error. Nothing is guessed.",
  },
  {
    id: "answer",
    x: 770,
    y: 116,
    w: 170,
    label: "Answer",
    sub: "with sources",
    desc: "The answer comes back with its sources and the route that was taken.",
  },
];

// Four columns of equal nodes, 80 px apart. Edges leave a node's right side and enter the next one's left side as smooth
// curves (cubic Béziers with horizontal tangents, like n8n); the no-match edge swings under everything from the router's
// bottom to the answer's bottom. The lime copy of an active edge is drawn above all of them.
const EDGES: {
  id: string;
  from: NodeId;
  to: NodeId;
  d: string;
}[] = [
  { id: "q-r", from: "question", to: "router", d: "M190 152 H270" },
  { id: "r-c", from: "router", to: "cheap", d: "M440 152 C480 152 480 40 520 40" },
  { id: "r-e", from: "router", to: "expensive", d: "M440 152 H520" },
  { id: "r-x", from: "router", to: "error", d: "M440 152 C480 152 480 264 520 264" },
  { id: "r-a", from: "router", to: "answer", d: "M355 188 C355 410 855 410 855 188" },
  { id: "c-a", from: "cheap", to: "answer", d: "M690 40 C730 40 730 152 770 152" },
  { id: "e-a", from: "expensive", to: "answer", d: "M690 152 H770" },
];

// The one label: centred on the lowest point of the line it names, on a chip that masks the line beneath it.
const LABELS: { text: string; x: number; y: number; edge: string }[] = [
  { text: "no match: no model called", x: 605, y: 355, edge: "r-a" },
];

const SCENARIOS: Record<ScenarioId, { label: string; path: NodeId[]; item: [string, string] }> = {
  easy: {
    label: "Easy question",
    path: ["question", "router", "cheap", "answer"],
    item: [
      "Cheap first",
      "Easy questions go to the first model of the cheap tier. Models in a tier are tried top to bottom.",
    ],
  },
  hard: {
    label: "Hard question",
    path: ["question", "router", "expensive", "answer"],
    item: [
      "Escalate when unsure",
      "Long, comparative or weakly matched questions go to the expensive tier instead.",
    ],
  },
  fail: {
    label: "Every model in the tier fails",
    path: ["question", "router", "error"],
    item: [
      "A tier fails, the request fails",
      "If every model of the chosen tier fails, the request returns a 502 error.",
    ],
  },
  none: {
    label: "No match",
    path: ["question", "router", "answer"],
    item: [
      "No match, no model",
      "If nothing in your documents matches, Lumen says so and calls no model.",
    ],
  },
};
const ORDER: ScenarioId[] = ["easy", "hard", "fail", "none"];

// Interactive routing diagram: the four numbered scenarios highlight the path; the edges draw and the nodes appear when the diagram is seen, and again each time it re-enters the viewport
// (CSS, under 600 ms each). Reduced motion removes the animation; the highlight still changes.
export function RouteExplorer() {
  const [scenario, setScenario] = useState<ScenarioId>("easy");
  const [ref, view] = useInView<SVGSVGElement>({ rootMargin: "0px 0px -4% 0px" });
  const path = SCENARIOS[scenario].path;
  const onPath = (id: NodeId) => path.includes(id);
  const edgeOn = (e: (typeof EDGES)[number]) => {
    const i = path.indexOf(e.from);
    return i >= 0 && path[i + 1] === e.to;
  };

  return (
    <div className="route-explorer">
      <div className="route-main card">
        <svg
          ref={ref}
          className={`route-flow${view === "in" ? " in-view" : ""}${view === "out" ? " is-out" : ""}`}
          viewBox="0 0 960 380"
          role="group"
          aria-label="Routing diagram: a question reaches the router, which sends easy questions to the cheap model and hard ones to the expensive model; if every model of the chosen tier fails the request returns a 502 error; if nothing matches no model is called."
        >
          {EDGES.map((e, i) => {
            const on = edgeOn(e);
            return (
              <path
                key={e.id}
                d={e.d}
                className="rf-edge"
                pathLength={1}
                data-edge={e.id}
                data-active={on}
                style={{ animationDelay: `${RF_TIMING.edgeStart + i * RF_TIMING.edgeStep}s` }}
              />
            );
          })}
          {EDGES.filter(edgeOn).map((e) => (
            // keyed by scenario, so it draws in again when the scenario changes
            <path key={`${scenario}-${e.id}`} d={e.d} className="rf-edge rf-on" pathLength={1} />
          ))}
          {LABELS.map((l) => {
            const on = edgeOn(EDGES.find((e) => e.id === l.edge)!);
            const w = l.text.length * 8.4 + 18;
            return (
              <g
                key={l.text}
                className="rf-chip"
                style={{ animationDelay: `${RF_TIMING.labelDelay}s` }}
              >
                <rect
                  className="rf-chip-bg"
                  x={l.x - w / 2}
                  y={l.y - 13}
                  width={w}
                  height={26}
                  rx={7}
                />
                <text
                  x={l.x}
                  y={l.y + 4}
                  textAnchor="middle"
                  className={`rf-label${on ? " rf-label-on" : ""}`}
                >
                  {l.text}
                </text>
              </g>
            );
          })}
          {NODES.map((n, i) => {
            const on = onPath(n.id);
            return (
              // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: Biome treats an SVG <g> as interactive; this is a labelled image
              <g
                key={n.id}
                data-node={n.id}
                data-active={on}
                role="img"
                aria-label={`${n.label}: ${n.desc}`}
                className={`rf-node${on ? " rf-on" : ""}${n.id === "error" ? " rf-error" : ""}`}
                style={{ animationDelay: `${i * RF_TIMING.nodeStep}s` }}
              >
                <rect x={n.x} y={n.y} width={n.w} height={72} rx={12} />
                <text x={n.x + n.w / 2} y={n.y + 32} className="rf-title" textAnchor="middle">
                  {n.label}
                </text>
                <text x={n.x + n.w / 2} y={n.y + 54} className="rf-sub" textAnchor="middle">
                  {n.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="route-items" aria-label="Scenarios">
        {ORDER.map((id, i) => (
          <li key={id}>
            <button
              type="button"
              className="route-item"
              aria-pressed={scenario === id}
              onClick={() => setScenario(id)}
            >
              <span className="num">0{i + 1}</span>
              <span className="card-title-sm">{SCENARIOS[id].item[0]}</span>
              <span className="small muted-2">{SCENARIOS[id].item[1]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
