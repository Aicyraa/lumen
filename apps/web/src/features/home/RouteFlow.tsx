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
    y: 160,
    w: 160,
    label: "Question",
    sub: "from your chatbot",
    desc: "Your chatbot sends the user's question to POST /v1/chat with its API key.",
  },
  {
    id: "router",
    x: 250,
    y: 160,
    w: 180,
    label: "Router",
    sub: "k and difficulty",
    desc: "Searches only your documents, then picks the tier from the question's difficulty and the best match.",
  },
  {
    id: "cheap",
    x: 520,
    y: 10,
    w: 190,
    label: "Cheap model",
    sub: "easy questions",
    desc: "The cheap tier answers easy questions. Its models are tried top to bottom: a backup answers when the primary fails.",
  },
  {
    id: "expensive",
    x: 520,
    y: 140,
    w: 190,
    label: "Expensive model",
    sub: "hard or unsure",
    desc: "Hard or weakly matched questions go to the expensive tier. Its models are also tried top to bottom.",
  },
  {
    id: "error",
    x: 520,
    y: 270,
    w: 190,
    label: "502 error",
    sub: "provider_error",
    desc: "If every model of the chosen tier fails or times out, the request returns 502 provider_error. Nothing is guessed.",
  },
  {
    id: "answer",
    x: 780,
    y: 160,
    w: 160,
    label: "Answer",
    sub: "with sources",
    desc: "The answer comes back with its sources and the route that was taken.",
  },
];

const EDGES: {
  id: string;
  from: NodeId;
  to: NodeId;
  d: string;
  label?: [string, number, number];
}[] = [
  { id: "q-r", from: "question", to: "router", d: "M180 196 H250" },
  {
    id: "r-c",
    from: "router",
    to: "cheap",
    d: "M430 178 C462 178 458 46 520 46",
    label: ["easy", 452, 110],
  },
  {
    id: "r-e",
    from: "router",
    to: "expensive",
    d: "M430 192 C475 192 475 176 520 176",
    label: ["hard", 452, 176],
  },
  {
    id: "r-x",
    from: "router",
    to: "error",
    d: "M340 232 V306 H520",
    label: ["every model fails", 350, 288],
  },
  {
    id: "r-a",
    from: "router",
    to: "answer",
    d: "M430 226 H780",
    label: ["no match: no model called", 556, 206],
  },
  { id: "c-a", from: "cheap", to: "answer", d: "M710 46 C745 46 745 180 780 180" },
  { id: "e-a", from: "expensive", to: "answer", d: "M710 176 C745 176 745 190 780 190" },
];

// Edge labels sit on chips placed beside the lines (centre x, y), never on a stroke.
const LABELS: { text: string; x: number; y: number; edge: string }[] = [
  { text: "easy", x: 430, y: 108, edge: "r-c" },
  { text: "hard", x: 490, y: 156, edge: "r-e" },
  { text: "every model fails", x: 422, y: 286, edge: "r-x" },
  { text: "no match: no model called", x: 544, y: 246, edge: "r-a" },
];

const SCENARIOS: Record<
  ScenarioId,
  { label: string; path: NodeId[]; desc: string; item: [string, string] }
> = {
  easy: {
    label: "Easy question",
    path: ["question", "router", "cheap", "answer"],
    desc: "Easy question: the router picks the cheap tier and the first model of that tier answers. If it fails, the next model in the tier is tried.",
    item: [
      "Cheap first",
      "Easy questions go to the first model of the cheap tier. Models in a tier are tried top to bottom.",
    ],
  },
  hard: {
    label: "Hard question",
    path: ["question", "router", "expensive", "answer"],
    desc: "Hard question: long, comparative or weakly matched questions go to the expensive tier instead.",
    item: [
      "Escalate when unsure",
      "Long, comparative or weakly matched questions go to the expensive tier instead.",
    ],
  },
  fail: {
    label: "Every model in the tier fails",
    path: ["question", "router", "error"],
    desc: "Every model of the chosen tier failed or timed out: the request returns 502 provider_error. Nothing is guessed.",
    item: [
      "A tier fails, the request fails",
      "If every model of the chosen tier fails, the request returns a 502 error.",
    ],
  },
  none: {
    label: "No match",
    path: ["question", "router", "answer"],
    desc: "Nothing in your documents matches: no model is called, and the answer says so.",
    item: [
      "No match, no model",
      "If nothing in your documents matches, Lumen says so and calls no model.",
    ],
  },
};
const ORDER: ScenarioId[] = ["easy", "hard", "fail", "none"];

// Interactive routing diagram: scenario buttons (and the four explanation items) highlight the path; nodes explain themselves on
// hover and focus. The edges draw and the nodes appear when the diagram is seen, and again each time it re-enters the viewport
// (CSS, under 600 ms each). Reduced motion removes the animation; the highlight still changes.
export function RouteExplorer() {
  const [scenario, setScenario] = useState<ScenarioId>("easy");
  const [hover, setHover] = useState<NodeId | null>(null);
  const [ref, view] = useInView<SVGSVGElement>({ rootMargin: "0px 0px -4% 0px" });
  const path = SCENARIOS[scenario].path;
  const onPath = (id: NodeId) => path.includes(id);
  const edgeOn = (e: (typeof EDGES)[number]) => {
    const i = path.indexOf(e.from);
    return i >= 0 && path[i + 1] === e.to;
  };
  const shown = hover ? NODES.find((n) => n.id === hover)!.desc : SCENARIOS[scenario].desc;

  return (
    <div className="route-explorer">
      <div className="route-main card">
        <div className="route-bar" role="group" aria-label="Scenario">
          {ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`chip${scenario === id ? " on" : ""}`}
              aria-pressed={scenario === id}
              onClick={() => setScenario(id)}
            >
              {SCENARIOS[id].label}
            </button>
          ))}
        </div>
        <svg
          ref={ref}
          className={`route-flow${view === "in" ? " in-view" : ""}${view === "out" ? " is-out" : ""}`}
          viewBox="0 0 960 360"
          role="group"
          aria-label="Routing diagram: a question reaches the router, which sends easy questions to the cheap model and hard ones to the expensive model; if every model of the chosen tier fails the request returns a 502 error; if nothing matches no model is called."
        >
          {EDGES.map((e, i) => {
            const on = edgeOn(e);
            return (
              <path
                key={e.id}
                d={e.d}
                className={`rf-edge${on ? " rf-on" : ""}`}
                pathLength={1}
                data-edge={e.id}
                data-active={on}
                style={{ animationDelay: `${RF_TIMING.edgeStart + i * RF_TIMING.edgeStep}s` }}
              />
            );
          })}
          {LABELS.map((l) => {
            const on = edgeOn(EDGES.find((e) => e.id === l.edge)!);
            const w = l.text.length * 7.8 + 18;
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
              // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a focusable node so keyboard users can read what it does
              <g
                key={n.id}
                data-node={n.id}
                data-active={on}
                tabIndex={0}
                role="img"
                aria-label={`${n.label}: ${n.desc}`}
                className={`rf-node${on ? " rf-on" : ""}${n.id === "error" ? " rf-error" : ""}`}
                style={{ animationDelay: `${i * RF_TIMING.nodeStep}s` }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
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
        <p className="route-desc body muted-2" data-testid="route-desc" aria-live="polite">
          {shown}
        </p>
      </div>
      <ul className="route-items">
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
