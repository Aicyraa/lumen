import { CodeBlock, PublicLayout, SectionLabel } from "../components/PublicLayout";

const ERRORS = [
  ["401", "invalid_api_key", "The x-api-key header is missing, wrong or revoked."],
  ["404", "not_found", "The document or request id does not exist in your workspace. Another workspace's ids look the same as missing ones."],
  ["413", "file_too_large", "The uploaded file is over the 10 MB limit."],
  ["415", "unsupported_type", "Only PDF, .txt and .md files are supported."],
  ["422", "invalid_request", "The body is not valid, for example an empty query or one over 2000 characters."],
  ["422", "no_models_configured", "Your workspace has no model yet. Add one in the Models tab of the dashboard."],
  ["429", "rate_limited", "Too many requests this minute for your workspace. Wait a moment and retry."],
  ["429", "monthly_limit", "The monthly request allowance for your workspace is used up."],
  ["429", "document_limit", "Your workspace has reached its document limit. Delete a document or ask for a higher limit."],
  ["502", "provider_error", "Every model for the chosen tier, and the fallback, failed. Retry shortly."],
];

const CHAT_RES = `{
  "request_id": "3f0c1a7b-5d2e-4c8a-9b61-0e7f4a2d9c13",
  "answer": "Enrollment closes on 15 March. [1]",
  "sources": [{ "document_id": "c1a2…", "chunk_id": 12, "score": 0.78 }],
  "route": { "model_tier": "cheap", "k": 3, "escalated": false, "difficulty": 0.0, "top_score": 0.78 },
  "usage": { "tokens_in": 812, "tokens_out": 64, "cost_usd": 0.0004, "latency_ms": 620 }
}`;

export function Docs() {
  return (
    <PublicLayout>
      <main className="doc">
        <SectionLabel>DOCS</SectionLabel>
        <h1 className="doc-h1">API reference</h1>
        <p className="lead">Everything your chatbot's backend needs: one key, one chat endpoint and a few document endpoints. All responses are JSON.</p>

        <section aria-labelledby="d-quick"><SectionLabel>01 — QUICKSTART</SectionLabel><h2 id="d-quick" className="h2s">Quickstart</h2>
          <ol className="doc-list">
            <li>Sign in and open <b>Documents</b>. Upload a PDF, .txt or .md file and wait for its status to become <span className="mono">ready</span>.</li>
            <li>Open <b>API keys</b>, create a key and copy it. It is shown once.</li>
            <li>Call <span className="mono">POST /v1/chat</span> from your backend:</li>
          </ol>
          <CodeBlock>{`curl -X POST $LUMEN_URL/v1/chat \\\n  -H "x-api-key: $LUMEN_API_KEY" \\\n  -H "content-type: application/json" \\\n  -d '{"query": "When does enrollment close?"}'`}</CodeBlock>
          <p className="body muted-2">Keep the key on your server. Never put it in a browser or mobile app.</p>
        </section>

        <section aria-labelledby="d-auth"><SectionLabel>02 — AUTHENTICATION</SectionLabel><h2 id="d-auth" className="h2s">Authentication</h2>
          <p className="body muted-2">Send your key in the <span className="mono text">x-api-key</span> header on every <span className="mono">/v1</span> request. A key belongs to one workspace, and every request only ever sees that workspace's documents. A missing, wrong or revoked key returns <span className="mono">401 invalid_api_key</span>.</p>
        </section>

        <section aria-labelledby="d-chat"><SectionLabel>03 — CHAT</SectionLabel><h2 id="d-chat" className="h2s">POST /v1/chat</h2>
          <p className="body muted-2">Body: <span className="mono">query</span> (string, 1 to 2000 characters) and optional <span className="mono">session_id</span> (string, any id of your own for grouping a conversation).</p>
          <CodeBlock>{`POST /v1/chat\nx-api-key: lum_••••••••\n\n{ "query": "When does enrollment close?", "session_id": "visitor-42" }`}</CodeBlock>
          <p className="body muted-2">Response <span className="mono">200</span>:</p>
          <CodeBlock>{CHAT_RES}</CodeBlock>
          <ul className="doc-list">
            <li><span className="mono">answer</span>: cites passages as <span className="mono">[1]</span>, <span className="mono">[2]</span>, numbered in the order of <span className="mono">sources</span>. When the documents do not contain the answer it is "I could not find that in the documents."</li>
            <li><span className="mono">sources</span>: the passages used, by document id, chunk id and similarity score. Passage text is not returned by this endpoint.</li>
            <li><span className="mono">route.model_tier</span>: <span className="mono">cheap</span>, <span className="mono">expensive</span> or <span className="mono">none</span> (nothing matched, so no model was called). <span className="mono">k</span> is the number of passages retrieved, <span className="mono">escalated</span> is true when the router chose the larger model out of caution, <span className="mono">top_score</span> is the best match.</li>
            <li><span className="mono">usage.cost_usd</span>: your estimated provider cost for this request, worked out from the per-1M-token prices you entered for your own models. It is <span className="mono">null</span> when the model that answered has no price set.</li>
          </ul>
        </section>

        <section aria-labelledby="d-docs"><SectionLabel>04 — DOCUMENTS</SectionLabel><h2 id="d-docs" className="h2s">Documents</h2>
          <div className="endpoint"><span className="mono">POST /v1/documents</span> Multipart form with one <span className="mono">file</span> field (PDF, .txt or .md, at most 10 MB). Returns <span className="mono">202</span>:</div>
          <CodeBlock>{`{ "document_id": "c1a2…", "status": "processing" }`}</CodeBlock>
          <div className="endpoint"><span className="mono">GET /v1/documents/:id</span> Returns <span className="mono">200</span>. Poll until <span className="mono">status</span> is <span className="mono">ready</span> or <span className="mono">failed</span>; <span className="mono">error</span> says why a file failed, for example a scanned PDF with no text.</div>
          <CodeBlock>{`{ "document_id": "c1a2…", "status": "ready", "chunk_count": 14, "error": null }`}</CodeBlock>
          <div className="endpoint"><span className="mono">DELETE /v1/documents/:id</span> Deletes the document and its passages. Returns <span className="mono">204</span>.</div>
        </section>

        <section aria-labelledby="d-fb"><SectionLabel>05 — FEEDBACK</SectionLabel><h2 id="d-fb" className="h2s">POST /v1/feedback</h2>
          <p className="body muted-2">Tell Lumen whether an answer helped. Body: <span className="mono">request_id</span> (from the chat response) and <span className="mono">rating</span> (<span className="mono">1</span> helpful or <span className="mono">-1</span> not helpful). Returns <span className="mono">204</span>, or <span className="mono">404 not_found</span> for an unknown request id.</p>
          <CodeBlock>{`{ "request_id": "3f0c1a7b-5d2e-4c8a-9b61-0e7f4a2d9c13", "rating": 1 }`}</CodeBlock>
        </section>

        <section aria-labelledby="d-err"><SectionLabel>06 — ERRORS</SectionLabel><h2 id="d-err" className="h2s">Error codes</h2>
          <p className="body muted-2">Every error has the same shape:</p>
          <CodeBlock>{`{ "error": { "code": "rate_limited", "message": "Too many requests." } }`}</CodeBlock>
          <div className="scroll-x">
            <table className="data" aria-label="Error codes">
              <thead><tr><th>STATUS</th><th>CODE</th><th>MEANING</th></tr></thead>
              <tbody>{ERRORS.map(([s, c, m]) => <tr key={c}><td className="mono">{s}</td><td className="mono">{c}</td><td>{m}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
