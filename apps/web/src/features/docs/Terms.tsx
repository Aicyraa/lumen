import { Link } from "react-router";
import { DocLayout } from "./DocLayout";

const ITEMS = [
  [
    "Using Lumen",
    "You need an account to use Lumen. You are responsible for what happens under it, including the projects you create and the API keys you issue. You must be allowed to enter into these terms, and you must give correct sign-in details.",
  ],
  [
    "Your content",
    "You keep ownership of the documents you upload and the questions you ask. You give Lumen permission to process them only to run the service for you: to index your documents, find passages and write answers. You confirm that you have the right to upload what you upload.",
  ],
  [
    "Acceptable use",
    "Do not use Lumen for anything unlawful, or to upload content you have no right to use. Do not try to reach another workspace's data, to get around a limit, or to disturb the service for other people. Do not share a Lumen API key with people who should not have it.",
  ],
  [
    "API keys and model providers",
    "Keep your API keys secret and use them from your server, not from a browser. Revoke a key on the API keys page if it may have leaked. You connect your own model providers: their terms apply to what they receive, and any fees they charge you are between you and them.",
  ],
  [
    "Limits and availability",
    "Lumen applies limits to documents, to requests per minute and to requests per month, and it may change them. The service is provided as it is: it may be slow, change, or be unavailable, and Lumen makes no promise of uptime.",
  ],
  [
    "Answers can be wrong",
    "Answers are written by the model providers you connect, from the passages Lumen finds in your documents. Lumen checks that the quotes it shows exist in those passages, but an answer can still be incomplete or wrong. Check anything that matters before you rely on it. Lumen's answers are not professional advice.",
  ],
  [
    "Suspension and ending",
    "You can stop using Lumen at any time and delete a project on its Settings page. Lumen may suspend or end access if these terms are broken, if the service or other users are at risk, or if the law requires it.",
  ],
  [
    "No warranty and liability",
    "To the extent the law allows, Lumen is provided without warranties of any kind, and Lumen is not liable for indirect or consequential loss, or for loss of data, profit or business that comes from using it. Nothing here limits a right you have by law that cannot be limited.",
  ],
  [
    "Changes to these terms",
    "Lumen may update these terms. The version on this page is the current one, and using Lumen after a change means you accept it.",
  ],
];

const id = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const TOC = ITEMS.map(([t]) => ({ id: id(t), label: t }));

export function Terms() {
  return (
    <DocLayout
      label="TERMS"
      title="Terms of service"
      toc={TOC}
      lead={
        <>
          The rules for using Lumen, in plain words. By creating an account or calling the API you agree to them. What Lumen
          does with your data is on the <Link to="/privacy">Privacy page</Link>.
        </>
      }
    >
      {ITEMS.map(([t, b], i) => (
        <section key={t} id={id(t)} className="priv-row">
          <div className="mono muted-3">0{i + 1}</div>
          <h2 className="priv-title">{t}</h2>
          <p className="body muted-2">{b}</p>
        </section>
      ))}
    </DocLayout>
  );
}
