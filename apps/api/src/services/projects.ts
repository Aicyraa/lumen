import { randomBytes } from "node:crypto";

type Db = { query(sql: string, params: unknown[]): Promise<{ rows: any[] }> };

// A project is a Better Auth organization; "owned" means the user is its owner (a project you were added to does not count against the cap).
export const ownedProjectCount = async (db: Db, userId: string): Promise<number> =>
  (await db.query(`SELECT count(*)::int AS n FROM member WHERE "userId" = $1 AND role = 'owner'`, [userId])).rows[0].n;

// "Shop support" -> "shop-support-3fa9c1": readable, and the random tail keeps it unique without a lookup.
export const projectSlug = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "") || "project"}-${randomBytes(3).toString("hex")}`;

// The description lives in organization.metadata (a JSON string written by Better Auth).
export const descriptionOf = (metadata: unknown): string | null => {
  try {
    const m = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    return typeof m?.description === "string" && m.description ? m.description : null;
  } catch { return null; }
};
