// Request fields set by requireApiKey / requireSession; every route after them can rely on tenantId.
declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      apiKeyId?: string;
      userId?: string;
      tenantModels?: import("../middleware/tenantModels.js").TenantModels; // decrypted keys: never log
    }
  }
}
import type { Logger } from "pino";
import type { Config } from "../config/config.js";
import type { Pool } from "../db/pool.js";
import type { RagClient } from "../services/rag.js";

// What the route factories need; one object built in createApp.
export interface Deps {
  pool: Pool;
  rag: RagClient;
  config: Config;
  log: Logger;
  pending: Set<Promise<void>>; // background ingests still running
  resolveHost?: import("../lib/endpointGuard.js").GuardOptions["resolve"]; // tests inject DNS answers; default is the OS resolver
}

