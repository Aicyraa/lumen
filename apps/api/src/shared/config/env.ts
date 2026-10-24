import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// apps/api/.env only (plus the real environment: real variables win).
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
