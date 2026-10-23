import "./config/env.js";
import pino from "pino";
import { createApp } from "./app.js";
import { createAuth } from "./auth/auth.js";
import { loadConfig, type Config } from "./config/config.js";
import { createPool } from "./db/pool.js";
import { createRagClient } from "./rag.js";
import { sweepInterrupted } from "./sweep.js";

const log = pino({ redact: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-api-key']"] });

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  log.fatal((err as Error).message); // names only, never values
  process.exit(1);
}

const pool = createPool(config.databaseUrl);
const auth = createAuth({ pool, config });
const rag = createRagClient(config);
await sweepInterrupted({ pool, config, log });

const app = createApp({ config, pool, auth, rag, log });
const port = Number(process.env.PORT || new URL(config.authUrl).port || 3000);
const server = app.listen(port, () => log.info({ port, devRoutes: config.devRoutes }, "api listening"));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(async () => { await app.locals.idle(); await pool.end(); process.exit(0); }));
}
