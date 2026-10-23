import pino from "pino";

// Rule 4 / 11: provider keys, the internal secret, cookies and API keys are never logged, at any depth
// the models payload could appear (models.cheap[0].api_key is three levels down).
const secretNames = ["api_key", "apiKey", "api_key_encrypted", "authorization", "cookie", "x-api-key", "x-internal-secret", "internalSecret", "snippet"];
export const redactPaths = secretNames.flatMap((n) => [n, `*.${n}`, `*.*.${n}`, `*.*.*.${n}`, `*.*.*.*.${n}`].map((p) => (/[-]/.test(n) ? p.replace(n, `["${n}"]`) : p)));

export const createLogger = (stream?: pino.DestinationStream, level = "info") =>
  pino({ level, redact: { paths: redactPaths, censor: "[redacted]" } }, stream as pino.DestinationStream);
