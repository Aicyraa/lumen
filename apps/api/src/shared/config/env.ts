import dotenv from "dotenv";

// apps/api/.env only (plus the real environment: real variables win).
dotenv.config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
