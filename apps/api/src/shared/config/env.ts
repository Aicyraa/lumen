import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Real variables win over the file; a missing file is fine (production sets them in the environment).
export function loadEnvFile(path: string) {
  dotenv.config({ path, quiet: true });
}

// apps/api/.env only.
loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
