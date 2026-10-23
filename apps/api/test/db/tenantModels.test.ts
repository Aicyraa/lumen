import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool.js";
import { testConfig } from "../helpers/env.js";

const pool = createPool(testConfig().databaseUrl);
const tenant = "schema-test-tenant";
const insert = (tier: string, position: number, provider = "openai") => pool.query(
  `INSERT INTO tenant_models (tenant_id, tier, position, provider, model_id, endpoint_url, api_key_encrypted, key_hint)
   VALUES ($1, $2, $3, $4, 'm', 'https://x.test/v1', 'enc', 'sk-...abcd')`, [tenant, tier, position, provider]);
beforeAll(() => pool.query("DELETE FROM tenant_models WHERE tenant_id = $1", [tenant]));
afterAll(async () => { await pool.query("DELETE FROM tenant_models WHERE tenant_id = $1", [tenant]); await pool.end(); });

describe("infra/sql/002_tenant_models.sql", () => {
  it("allows one model per (tenant, tier, position) and the same position in another tier", async () => {
    await insert("cheap", 0);
    await insert("expensive", 0);
    await expect(insert("cheap", 0)).rejects.toThrow(/tenant_models_tenant_id_tier_position_key/);
  });
  it("rejects an unknown tier or provider", async () => {
    await expect(insert("huge", 5)).rejects.toThrow(/check/);
    await expect(insert("cheap", 6, "mystery")).rejects.toThrow(/check/);
  });
  it("defaults status to connected and leaves rate_limits null", async () => {
    const { rows } = await pool.query("SELECT status, rate_limits, rate_limits_seen_at FROM tenant_models WHERE tenant_id = $1 LIMIT 1", [tenant]);
    expect(rows[0]).toEqual({ status: "connected", rate_limits: null, rate_limits_seen_at: null });
  });
  it("model_calls accepts the default tier and rejects an unknown outcome", async () => {
    const row = (outcome: string) => pool.query(
      `INSERT INTO model_calls (tenant_id, request_id, provider, model_id, tier, outcome) VALUES ($1, gen_random_uuid(), 'p', 'm', 'default', $2)`, [tenant, outcome]);
    await row("ok");
    await expect(row("exploded")).rejects.toThrow(/check/);
    await pool.query("DELETE FROM model_calls WHERE tenant_id = $1", [tenant]);
  });
});
