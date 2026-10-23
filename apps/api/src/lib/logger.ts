import pino from "pino";

// Rule 4 / 11: provider keys, secrets, cookies and snippets are never logged, at any depth and in any letter case.
// pino's redact paths only match fixed depths, so every argument is walked before it is serialised.
const SECRET_KEYS = new Set(["api_key", "apikey", "api_key_encrypted", "authorization", "cookie", "set-cookie", "x-api-key", "x-internal-secret", "internalsecret", "snippet"]);
const MAX_DEPTH = 25; // deeper than any real log object; beyond it the value is dropped rather than risk a leak

function scrub(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  if (depth > MAX_DEPTH) return "[truncated]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => scrub(v, seen, depth + 1));
  // an Error keeps its name, message and stack and its own properties (HTTP clients attach config.headers)
  const source: Record<string, unknown> = value instanceof Error
    ? { ...value, type: value.name, message: value.message, stack: value.stack }
    : (value as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) out[k] = SECRET_KEYS.has(k.toLowerCase()) ? "[redacted]" : scrub(v, seen, depth + 1);
  return out;
}

export const createLogger = (stream?: pino.DestinationStream, level = "info") =>
  pino({
    level,
    hooks: { logMethod(args, method) { method.apply(this, args.map((a) => scrub(a, new WeakSet(), 0)) as Parameters<typeof method>); } },
  }, stream as pino.DestinationStream);
