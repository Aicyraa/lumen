import "./shared/config/env.js";
import { createLogger } from "./shared/lib/logger.js";
import { createApp } from "./app.js";
import { createAuth } from "./modules/auth/auth.js";
import { loadConfig, type Config } from "./shared/config/config.js";
import { createPool } from "./shared/db/pool.js";
import { createRagClient } from "./shared/services/rag.js";
import { createMailer } from "./modules/auth/mailer.js";
import { sweepInterrupted } from "./modules/documents/sweep.js";

const log = createLogger();

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  log.fatal((err as Error).message); // names only, never values
  process.exit(1);
}

const pool = createPool(config.databaseUrl, config.dbConnectionTimeoutMs);
const auth = createAuth({ pool, config, mailer: createMailer({ config, log }), log });
const rag = createRagClient(config);
await sweepInterrupted({ pool, config, log });

const app = createApp({ config, pool, auth, rag, log });
const port = Number(process.env.PORT || new URL(config.authUrl).port || 3000);
const server = app.listen(port, () => log.info({ port, devRoutes: config.devRoutes }, "api listening"));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(async () => { await app.locals.idle(); await pool.end(); process.exit(0); }));
}
