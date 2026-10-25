import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool } from "../../../src/shared/db/pool.js";
import { testConfig } from "../../helpers/env.js";

// The normalized schema (infra/sql 003 to 006) as it exists in lumen_test.
let pool: Pool;
const made: string[] = [];
beforeAll(() => {
  pool = createPool(testConfig().databaseUrl);
});
afterAll(async () => {
  for (const t of made) await pool.query("DELETE FROM tenants WHERE id = $1", [t]).catch(() => {});
  await pool.end();
});

const tenant = async () => {
  const id = `t-${randomUUID()}`;
  made.push(id);
  await pool.query("INSERT INTO tenants (id) VALUES ($1)", [id]);
  return id;
};
const doc = async (t: string) =>
  (
    await pool.query(
      "INSERT INTO documents (tenant_id, filename, status) VALUES ($1, 'f.md', 'ready') RETURNING id",
      [t],
    )
  ).rows[0].id as string;
const chunk = async (t: string, d: string) =>
  Number(
    (
      await pool.query(
        "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'x', array_fill(0, ARRAY[384])::vector) RETURNING id",
        [t, d],
      )
    ).rows[0].id,
  );
const log = async (t: string) =>
  (
    await pool.query("INSERT INTO request_logs (tenant_id, query) VALUES ($1, 'q') RETURNING id", [
      t,
    ])
  ).rows[0].id as string;
const count = async (table: string, t: string) =>
  (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [t])).rows[0].n;
const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e) => e.code as string,
  );

describe("tenants registry", () => {
  it("rejects rows for a tenant that does not exist (foreign key 23503) in every tenant table", async () => {
    const ghost = `ghost-${randomUUID()}`;
    expect(
      await code(
        pool.query("INSERT INTO documents (tenant_id, filename) VALUES ($1, 'f')", [ghost]),
      ),
    ).toBe("23503");
    expect(
      await code(
        pool.query("INSERT INTO request_logs (tenant_id, query) VALUES ($1, 'q')", [ghost]),
      ),
    ).toBe("23503");
    expect(
      await code(
        pool.query(
          `INSERT INTO tenant_models (tenant_id, tier, position, provider, model_id, endpoint_url, api_key_encrypted, key_hint)
           VALUES ($1, 'cheap', 0, 'openai', 'm', 'https://x.test', 'e', 'h')`,
          [ghost],
        ),
      ),
    ).toBe("23503");
    expect(
      await code(
        pool.query(
          `INSERT INTO model_calls (tenant_id, request_id, provider, model_id, tier, outcome) VALUES ($1, gen_random_uuid(), 'p', 'm', 'default', 'ok')`,
          [ghost],
        ),
      ),
    ).toBe("23503");
  });

  it("deleting the tenant removes its documents, chunks, requests, sources, models and calls in one statement", async () => {
    const t = await tenant();
    const other = await tenant();
    const d = await doc(t);
    const c = await chunk(t, d);
    const r = await log(t);
    await pool.query(
      "INSERT INTO request_sources (request_id, tenant_id, position, document_id, chunk_id, score) VALUES ($1, $2, 0, $3, $4, 0.5)",
      [r, t, d, c],
    );
    await pool.query(
      `INSERT INTO tenant_models (tenant_id, tier, position, provider, model_id, endpoint_url, api_key_encrypted, key_hint)
       VALUES ($1, 'cheap', 0, 'openai', 'm', 'https://x.test', 'e', 'h')`,
      [t],
    );
    await pool.query(
      `INSERT INTO model_calls (tenant_id, request_id, provider, model_id, tier, outcome) VALUES ($1, $2, 'p', 'm', 'default', 'ok')`,
      [t, r],
    );
    const keep = await doc(other);
    await pool.query("DELETE FROM tenants WHERE id = $1", [t]);
    for (const table of [
      "documents",
      "chunks",
      "request_logs",
      "request_sources",
      "tenant_models",
      "model_calls",
    ])
      expect([table, await count(table, t)]).toEqual([table, 0]);
    expect((await pool.query("SELECT 1 FROM documents WHERE id = $1", [keep])).rowCount).toBe(1);
  });
});

describe("request_sources", () => {
  it("keeps the row, with null ids, when its document or chunk is deleted", async () => {
    const t = await tenant();
    const d = await doc(t);
    const c = await chunk(t, d);
    const r = await log(t);
    await pool.query(
      "INSERT INTO request_sources (request_id, tenant_id, position, document_id, chunk_id, score) VALUES ($1, $2, 0, $3, $4, 0.9)",
      [r, t, d, c],
    );
    await pool.query("DELETE FROM documents WHERE id = $1 AND tenant_id = $2", [d, t]);
    const { rows } = await pool.query(
      "SELECT position, document_id, chunk_id, score FROM request_sources WHERE request_id = $1 AND tenant_id = $2",
      [r, t],
    );
    expect(rows).toEqual([
      { position: 0, document_id: null, chunk_id: null, score: expect.closeTo(0.9, 5) },
    ]);
  });

  it("cannot point at another tenant's document or request", async () => {
    const a = await tenant();
    const b = await tenant();
    const docB = await doc(b);
    const ra = await log(a);
    expect(
      await code(
        pool.query(
          "INSERT INTO request_sources (request_id, tenant_id, position, document_id) VALUES ($1, $2, 0, $3)",
          [ra, a, docB],
        ),
      ),
    ).toBe("23503");
    expect(
      await code(
        pool.query(
          "INSERT INTO request_sources (request_id, tenant_id, position) VALUES ($1, $2, 0)",
          [ra, b],
        ),
      ),
    ).toBe("23503");
  });
});

describe("request_sources and chunks", () => {
  it("cannot point at another tenant's chunk (foreign keys on)", async () => {
    const a = await tenant();
    const b = await tenant();
    const chunkB = await chunk(b, await doc(b));
    const ra = await log(a);
    expect(
      await code(
        pool.query(
          "INSERT INTO request_sources (request_id, tenant_id, position, chunk_id) VALUES ($1, $2, 0, $3)",
          [ra, a, chunkB],
        ),
      ),
    ).toBe("23503");
  });

  it("deleting a chunk leaves the source row with a NULL chunk_id and keeps its tenant", async () => {
    const t = await tenant();
    const d = await doc(t);
    const c = await chunk(t, d);
    const r = await log(t);
    await pool.query(
      "INSERT INTO request_sources (request_id, tenant_id, position, document_id, chunk_id) VALUES ($1, $2, 0, $3, $4)",
      [r, t, d, c],
    );
    await pool.query("DELETE FROM chunks WHERE id = $1 AND tenant_id = $2", [c, t]);
    const { rows } = await pool.query(
      "SELECT tenant_id, document_id, chunk_id FROM request_sources WHERE request_id = $1 AND tenant_id = $2",
      [r, t],
    );
    expect(rows).toEqual([{ tenant_id: t, document_id: d, chunk_id: null }]);
  });
});

describe("derived values are views, not columns", () => {
  it("has no chunk_count, token, cost or sources column left", async () => {
    const { rows } = await pool.query(
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
       WHERE table_schema = 'public' AND (table_name, column_name) IN
         (('documents','chunk_count'), ('request_logs','tokens_in'), ('request_logs','tokens_out'), ('request_logs','cost_usd'), ('request_logs','sources'))`,
    );
    expect(rows).toEqual([]);
  });

  it("document_stats counts a document's chunks inside its own tenant", async () => {
    const t = await tenant();
    const d = await doc(t);
    const empty = await doc(t);
    await chunk(t, d);
    await chunk(t, d);
    const { rows } = await pool.query(
      "SELECT document_id, chunk_count FROM document_stats WHERE tenant_id = $1 ORDER BY chunk_count DESC",
      [t],
    );
    expect(rows).toEqual([
      { document_id: d, chunk_count: 2 },
      { document_id: empty, chunk_count: 0 },
    ]);
  });

  it("document_stats ignores a chunk row of another tenant that names the document (stale or corrupted data)", async () => {
    const a = await tenant();
    const b = await tenant();
    const d = await doc(a);
    await chunk(a, d);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL session_replication_role = replica"); // skips FK triggers: plants what the constraints forbid
      await c.query(
        "INSERT INTO chunks (tenant_id, document_id, content, embedding) VALUES ($1, $2, 'planted', array_fill(0, ARRAY[384])::vector)",
        [b, d],
      );
      await c.query("COMMIT");
    } finally {
      c.release();
    }
    const { rows } = await pool.query(
      "SELECT chunk_count FROM document_stats WHERE tenant_id = $1 AND document_id = $2",
      [a, d],
    );
    expect(rows).toEqual([{ chunk_count: 1 }]);
  });

  it("request_usage sums the tokens and cost of a request's attempts, null cost when none was priced", async () => {
    const t = await tenant();
    const priced = await log(t);
    const unpriced = await log(t);
    const none = await log(t);
    const call = (r: string, i: number | null, o: number | null, cost: number | null) =>
      pool.query(
        `INSERT INTO model_calls (tenant_id, request_id, provider, model_id, tier, outcome, tokens_in, tokens_out, cost_usd)
         VALUES ($1, $2, 'p', 'm', 'default', 'ok', $3, $4, $5)`,
        [t, r, i, o, cost],
      );
    await call(priced, 10, 2, 0.001);
    await call(priced, 5, 1, 0.002);
    await call(priced, null, null, null);
    await call(unpriced, 7, 3, null);
    const { rows } = await pool.query(
      "SELECT request_id, tokens_in, tokens_out, cost_usd::float8 AS cost_usd FROM request_usage WHERE tenant_id = $1",
      [t],
    );
    const by = Object.fromEntries(rows.map((r) => [r.request_id, r]));
    expect(by[priced]).toMatchObject({ tokens_in: 15, tokens_out: 3, cost_usd: 0.003 });
    expect(by[unpriced]).toMatchObject({ tokens_in: 7, tokens_out: 3, cost_usd: null });
    expect(by[none]).toMatchObject({ tokens_in: null, tokens_out: null, cost_usd: null });
  });
});

describe("indexes and row level security", () => {
  const APP = [
    "tenants",
    "documents",
    "chunks",
    "request_logs",
    "request_sources",
    "tenant_models",
    "model_calls",
  ];

  it("has row level security enabled on every application table", async () => {
    const { rows } = await pool.query(
      "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1) AND relrowsecurity",
      [APP],
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...APP].sort());
  });

  it("indexes every foreign key (an index starts with its first column, or with all of its columns in any order)", async () => {
    const { rows } = await pool.query(
      `SELECT c.conrelid::regclass::text AS tbl, c.conname FROM pg_constraint c
       WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND c.conrelid::regclass::text = ANY($1)
         AND NOT EXISTS (
           SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
             AND ((i.indkey::int2[])[0] = c.conkey[1]
               OR ARRAY(SELECT unnest((i.indkey::int2[])[0:cardinality(c.conkey) - 1]) ORDER BY 1)
                = ARRAY(SELECT unnest(c.conkey) ORDER BY 1)))`,
      [APP],
    );
    expect(rows).toEqual([]);
  });
});

describe("Better Auth tables and Data API roles", () => {
  const AUTH = [
    "user",
    "session",
    "account",
    "verification",
    "organization",
    "member",
    "invitation",
    "apikey",
  ];

  it("has row level security enabled on all 8 Better Auth tables (after auth:migrate)", async () => {
    const { rows } = await pool.query(
      "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1) AND relrowsecurity",
      [AUTH],
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...AUTH].sort());
  });

  // Only where the Supabase roles exist (a scratch database with CREATE ROLE anon/authenticated); skipped on plain Postgres.
  it("gives anon and authenticated no privilege on any table, view or sequence", async () => {
    const roles = (
      await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")
    ).rows.map((r) => r.rolname as string);
    if (!roles.length) return;
    const { rows } = await pool.query(
      `SELECT c.relname, r AS role, c.relkind
       FROM pg_class c CROSS JOIN unnest($1::text[]) AS r
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'S')
         AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(r, c.oid, 'USAGE, SELECT, UPDATE')
                  ELSE has_table_privilege(r, c.oid, 'SELECT, INSERT, UPDATE, DELETE') END`,
      [roles],
    );
    expect(rows).toEqual([]);
  });
});
