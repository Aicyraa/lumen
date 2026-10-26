import { fileURLToPath } from "node:url";

// Real variables win over the file (loadEnvFile never overrides); a missing file is fine (production sets them in the environment).
export function loadEnvFile(path: string) {
  try {
    process.loadEnvFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// apps/api/.env only.
loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
