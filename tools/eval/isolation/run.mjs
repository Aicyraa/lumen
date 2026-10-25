// pnpm eval:isolation: runs the isolation suite with the rag-service interpreter (it has psycopg, uvicorn, torch).
// Uses EVAL_PYTHON if set, else this checkout's apps/rag-service/.venv, else the main worktree's.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const py = (dir) => join(dir, "apps/rag-service/.venv/bin/python");
const common = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root, encoding: "utf8" });
const candidates = [process.env.EVAL_PYTHON, py(root), common.status === 0 ? py(dirname(common.stdout.trim())) : null];
const python = candidates.find((p) => p && existsSync(p));
if (!python) {
  console.error("No Python found. Set EVAL_PYTHON or run `pnpm bootstrap` (apps/rag-service/.venv).");
  process.exit(2);
}
const r = spawnSync(python, ["-u", "-m", "isolation", ...process.argv.slice(2)], { cwd: join(root, "tools/eval"), stdio: "inherit" });
process.exit(r.status ?? 1);
