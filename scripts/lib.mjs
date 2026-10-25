// Shared helpers for the repo-level scripts. No dependencies, never prints secret values.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = process.env.LUMEN_ROOT || join(dirname(fileURLToPath(import.meta.url)), ".."); // LUMEN_ROOT: tests only
export const ENV_DIRS = ["apps/api", "apps/rag-service", "apps/web", "infra"];

export function parseEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

export const readAppEnv = (dir) => parseEnv(join(ROOT, dir, ".env"));
