import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CodeBlock, PublicLayout, SectionLabel } from "../components/PublicLayout";
import { Reveal } from "../components/motion";
import { Segmented } from "../components/ui";

const STEPS = [
  ["01", "Upload documents", "Add PDFs, text or Markdown in the dashboard. Lumen splits them into passages and indexes them for your workspace only."],
  ["02", "Create an API key", "Generate a key in one click. It is shown once and tied to your workspace."],
  ["03", "Call /v1/chat", "Your chatbot sends the question. You get the answer, its sources and the route taken."],
];
const FEATURES = [
  ["Tiered routing", "Easy questions go to a small, fast model. Long, comparative or weakly matched questions escalate to the larger one."],
  ["Tenant isolation", "Every passage carries its owner. A request can only ever search the documents of the key that sent it."],
  ["Your own models", "Connect your own provider keys, order the models inside each tier and set a fallback for when a whole tier fails."],
  ["Honest when it can’t answer", "If nothing in your documents matches, Lumen says so instead of guessing, and lists the question so you can fill the gap."],
];
const SECURITY = [
  ["Isolated per workspace", "Every stored passage carries its owner, and every query is filtered by it."],
  ["Keys shown once", "API keys are stored as hashes and shown once. Your model provider keys are stored encrypted and never shown again."],
  ["No document text in logs", "Logs keep the question, route and metadata. Passages and keys are never written to them."],
  ["Documents treated as data", "Passages are sent to the model as data, not instructions, and the assistant is told to ignore instructions inside them."],
];

// Real POST /v1/chat response shape (sample values).
const sample = (answer: string, sources: string, route: [string, number, boolean, number, number], tokens: [number, number], ms: number) =>
  `{\n  "request_id": "3f0c1a7b-5d2e-4c8a-9b61-0e7f4a2d9c13",\n  "answer": ${JSON.stringify(answer)},\n  "sources": ${sources},\n  "route": {\n    "model_tier": "${route[0]}",\n    "k": ${route[1]}, "escalated": ${route[2]},\n    "difficulty": ${route[3].toFixed(2)}, "top_score": ${route[4].toFixed(2)}\n  },\n  "usage": { "tokens_in": ${tokens[0]}, "tokens_out": ${tokens[1]}, "latency_ms": ${ms} }\n}`;
const DEMOS = {
  easy: { query: "When does enrollment close?", ms: 620, res: sample("Enrollment closes on 15 March. [1]", '[{ "document_id": "c1a2…", "chunk_id": 12, "score": 0.78 }]', ["cheap", 3, false, 0, 0.78], [812, 64], 620) },
  hard: { query: "What is the difference between fall and spring refunds?", ms: 1240, res: sample("Fall: full refund until 12 September [1]. Spring: until 6 February [2].", '[{ "document_id": "c1a2…", "chunk_id": 31, "score": 0.71 }, …]', ["expensive", 8, true, 0.25, 0.71], [1946, 88], 1240) },
  none: { query: "Who won the football match?", ms: 140, res: sample("I could not find that in the documents.", "[]", ["none", 0, false, 0.25, 0.09], [0, 0], 140) },
} as const;
type DemoId = keyof typeof DEMOS;

const CODE = {
  curl: `curl -X POST $LUMEN_URL/v1/chat \\\n  -H "x-api-key: $LUMEN_API_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"query": "When does enrollment close?"}'`,
  node: `const res = await fetch(process.env.LUMEN_URL + "/v1/chat", {\n  method: "POST",\n  headers: {\n    "x-api-key": process.env.LUMEN_API_KEY,\n    "content-type": "application/json",\n  },\n  body: JSON.stringify({ query, session_id }),\n});\n\nconst { answer, sources, route } = await res.json();`,
  python: `import os, requests\n\nr = requests.post(\n    os.environ["LUMEN_URL"] + "/v1/chat",\n    headers={"x-api-key": os.environ["LUMEN_API_KEY"]},\n    json={"query": "When does enrollment close?"},\n)\ndata = r.json()\nprint(data["answer"], data["route"]["model_tier"])`,
};
type CodeId = keyof typeof CODE;

export function Home() {
  const [demo, setDemo] = useState<DemoId>("easy");
  const [tab, setTab] = useState<CodeId>("curl");
  const [copied, setCopied] = useState(false);
  const d = DEMOS[demo];
  const copy = () => { void navigator.clipboard?.writeText(CODE[tab]).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  // CSS scroll-snap (proximity) only on this page, so the dashboard and docs scroll normally.
  useEffect(() => { document.documentElement.classList.add("snap-home"); return () => document.documentElement.classList.remove("snap-home"); }, []);

  return (
    <PublicLayout>
      <main className="home">
        <section className="snap-section hero" aria-labelledby="hero-h">
          <SectionLabel>RAG API FOR YOUR CHATBOT — 01</SectionLabel>
          <h1 id="hero-h" className="hero-h1">Answers from your documents, from the smallest model that gets them right.</h1>
          <div className="hero-foot">
            <p className="lead">Upload your files, get an API key, and point your chatbot at one endpoint. Lumen retrieves only your tenant's passages, routes easy questions to a small model, and escalates when it's unsure.</p>
            <div className="row-gap"><Link to="/signin" className="btn btn-accent btn-lg">Sign in to start</Link><Link to="/docs" className="btn btn-outline btn-lg">Read the docs</Link></div>
          </div>
        </section>

        <section className="snap-section" aria-label="Preview">
          <Reveal><div className="image-slot" role="img" aria-label="Placeholder for a dashboard screenshot">dashboard screenshot — analytics view</div></Reveal>
        </section>

        <section id="how" className="snap-section" aria-labelledby="how-h">
          <div className="head-grid">
            <SectionLabel>HOW IT WORKS — 02</SectionLabel>
            <h2 id="how-h" className="h2">Three steps from a folder of PDFs to a chatbot that cites its sources.</h2>
          </div>
          <ol className="steps">
            {STEPS.map(([n, t, b], i) => <Reveal as="li" key={n} delay={i * 0.1} className="step"><div className="num">{n}</div><div className="step-title">{t}</div><div className="body muted-2">{b}</div></Reveal>)}
          </ol>
        </section>

        <section className="snap-section" aria-label="Demo">
          <div className="row-between">
            <SectionLabel>DEMO — 03</SectionLabel>
            <Segmented label="Demo case" options={[["easy", "EASY"], ["hard", "HARD"], ["none", "NO ANSWER"]] as const} value={demo} onChange={setDemo} />
          </div>
          <div className="two-col">
            <div className="card"><div className="mono small muted-3">REQUEST</div><CodeBlock>{`POST /v1/chat\nx-api-key: lum_••••••••\n\n{ "query": ${JSON.stringify(d.query)} }`}</CodeBlock></div>
            <div className="card"><div className="mono small muted-3">RESPONSE · {d.ms.toLocaleString("en-US")} MS</div><CodeBlock testId="demo-response">{d.res}</CodeBlock></div>
          </div>
        </section>

        <section className="snap-section head-grid top" aria-label="Quickstart">
          <div className="stack">
            <SectionLabel>QUICKSTART — 04</SectionLabel>
            <h2 className="h2">Call it from your backend in a few lines.</h2>
            <p className="body muted-2 maxw-sm">Keep the key on your server. Your chatbot's frontend talks to your backend, and your backend talks to Lumen.</p>
          </div>
          <div className="card flush">
            <div className="code-bar">
              <Segmented label="Language" options={[["curl", "cURL"], ["node", "Node"], ["python", "Python"]] as const} value={tab} onChange={(t) => { setTab(t); setCopied(false); }} plain />
              <button type="button" className="btn btn-outline btn-sm mono" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <CodeBlock testId="code">{CODE[tab]}</CodeBlock>
          </div>
        </section>

        <section className="snap-section" aria-label="Built in">
          <SectionLabel>BUILT IN — 06</SectionLabel>
          <div className="features">
            {FEATURES.map(([t, b], i) => <Reveal key={t} delay={i * 0.08} className="feature"><div className="mono muted-3">0{i + 1}</div><h3 className="feature-title">{t}</h3><div className="body muted-2">{b}</div></Reveal>)}
          </div>
        </section>

        <section className="snap-section" aria-label="Security">
          <div className="head-grid"><SectionLabel>SECURITY — 07</SectionLabel><h2 className="h2">Your documents stay yours.</h2></div>
          <ul className="cols-4">
            {SECURITY.map(([t, b], i) => <Reveal as="li" key={t} delay={i * 0.08} className="step"><div className="num">0{i + 1}</div><h3 className="card-title-sm">{t}</h3><div className="small muted-2">{b}</div></Reveal>)}
          </ul>
        </section>

        <section className="snap-section cta">
          <h2 className="cta-h">Ask your documents<br />anything.</h2>
          <Link to="/signin" className="btn btn-primary btn-xl">Sign in</Link>
        </section>
      </main>
    </PublicLayout>
  );
}
