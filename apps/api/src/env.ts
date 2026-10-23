import dotenv from "dotenv";

// Repo-root .env for local runs; real environment variables win.
dotenv.config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
