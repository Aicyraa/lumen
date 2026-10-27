// node scripts/check-docs.mjs
// Fails (exit 1) when a relative Markdown link, a #anchor, or a backticked repo path in a tracked .md file does not resolve.
// Paths are resolved against the files git tracks (what a public clone has), not the working tree. .agents/ is skipped. No dependencies.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { ROOT } from "./lib.mjs";

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 }).split("\0").filter(Boolean);
const files = new Set(tracked);
const dirs = new Set(tracked.flatMap((f) => f.split("/").slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join("/"))));
const mdFiles = tracked.filter((f) => f.endsWith(".md") && !f.startsWith(".agents/"));

// Real paths that git does not track (secrets, generated output): mentioned in docs on purpose.
const UNTRACKED_OK = /(^|\/)(\.env(?!\.example)(\.[\w-]+)?|results\.csv|verdicts\.csv|\.eval_state\.json|review-run|app\/models|uploads|graphify-out|\.venv|node_modules|dist)(\/|$)/;
// A backticked token is checked only when it looks like a repo path.
const PATHISH = /^(\.{1,2}\/|docs\/|apps\/|infra\/|tools\/|scripts\/|\.claude\/|\.serena\/|\.github\/)|[\w-]\.md$/;

const slugger = () => {
  const seen = new Map();
  return (title) => {
    const base = title.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
};

// Split a file into prose lines (outside code fences) with their 1-based numbers.
const prose = (text) => {
  let fence = false;
  return text.split("\n").flatMap((line, i) => {
    if (/^\s*```/.test(line)) { fence = !fence; return []; }
    return fence ? [] : [[i + 1, line]];
  });
};

const anchorCache = new Map();
const anchorsOf = (file) => {
  if (!anchorCache.has(file)) {
    const slug = slugger();
    const set = new Set();
    for (const [, line] of prose(readFileSync(join(ROOT, file), "utf8"))) {
      const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) set.add(slug(m[1]));
    }
    anchorCache.set(file, set);
  }
  return anchorCache.get(file);
};

const exists = (p) => files.has(p) || dirs.has(p) || UNTRACKED_OK.test(p);
const problems = [];

for (const file of mdFiles) {
  const base = dirname(file);
  const fail = (line, ref, why) => problems.push(`${file}:${line}: ${ref} (${why})`);
  for (const [n, line] of prose(readFileSync(join(ROOT, file), "utf8"))) {
    // Markdown links [text](target)
    for (const m of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue; // http:, https:, mailto:
      const [pathPart, anchor] = target.split("#");
      const resolved = pathPart ? posix.normalize(pathPart.startsWith("/") ? pathPart.slice(1) : posix.join(base, decodeURI(pathPart.split("?")[0]))) : file;
      if (!exists(resolved.replace(/\/$/, ""))) { fail(n, target, "no such file"); continue; }
      if (anchor && files.has(resolved) && resolved.endsWith(".md") && !anchorsOf(resolved).has(anchor)) fail(n, target, "no such heading");
    }
    // `repo/paths` in backticks
    for (const m of line.matchAll(/`([^`\s]+)`/g)) {
      const token = m[1].replace(/[.,;:]+$/, "");
      if (!PATHISH.test(token) || /[*<>{}$|=()]|\.\.\.|^https?:/.test(token)) continue;
      const clean = token.replace(/\/$/, "");
      const candidates = [posix.normalize(clean), posix.normalize(posix.join(base, clean))];
      if (!candidates.some(exists)) fail(n, token, "no such file");
    }
  }
}

if (problems.length) {
  console.error(`check-docs: ${problems.length} reference(s) do not resolve:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`check-docs: ${mdFiles.length} Markdown files, every link and file reference resolves`);
