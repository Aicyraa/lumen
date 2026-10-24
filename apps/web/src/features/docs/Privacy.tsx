import { DocLayout } from "./DocLayout";

const ITEMS = [
  ["Your documents", "The text of the files you upload is split into passages and stored with your workspace id so Lumen can find them when a question arrives. A search only ever looks at the workspace that owns the API key."],
  ["Your questions", "Questions are logged for your analytics, with the route taken, token counts, latency and the ids and match scores of the sources. The Requests and Analytics pages are built from this log. The answer text is not stored."],
  ["Document text and logs", "Full document text is never written to logs. The passages you see in Try it and in a request's detail are read live from your documents when you open them and are not stored again."],
  ["Model providers", "To write an answer, Lumen sends the question and the retrieved passages to the model provider you connected in the Models tab. That provider's own terms apply to what it receives."],
  ["Provider keys", "The API keys of your model providers are stored encrypted, are never shown again after you save them, and are decrypted only for the request that needs them."],
  ["Lumen API keys", "Your Lumen API keys are stored as hashes and shown once, when you create them. Revoke a key at any time on the API keys page."],
  ["Your account", "Signing in with Google, GitHub or email and password gives Lumen your name and email address so it can create your workspace and show who is signed in."],
];

const id = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const TOC = ITEMS.map(([t]) => ({ id: id(t), label: t }));

export function Privacy() {
  return (
    <DocLayout label="PRIVACY" title="What Lumen does with your data" toc={TOC}
      lead="A plain description of what the product does. If a behaviour is not listed here, Lumen does not do it.">
      {ITEMS.map(([t, b], i) => (
        <section key={t} id={id(t)} className="priv-row"><div className="mono muted-3">0{i + 1}</div><h2 className="priv-title">{t}</h2><p className="body muted-2">{b}</p></section>
      ))}
    </DocLayout>
  );
}
