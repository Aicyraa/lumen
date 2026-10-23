// Request fields set by requireApiKey / requireSession; every route after them can rely on tenantId.
declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      apiKeyId?: string;
      userId?: string;
    }
  }
}
import type { Logger } from "pino";
import type { Config } from "./config/config.js";
import type { Pool } from "./db/pool.js";
import type { RagClient } from "./rag.js";

// What the route factories need; one object built in createApp.
export interface Deps {
  pool: Pool;
  rag: RagClient;
  config: Config;
  log: Logger;
  pending: Set<Promise<void>>; // background ingests still running
}

