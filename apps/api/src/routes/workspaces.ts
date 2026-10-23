import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import type { Auth } from "../auth/auth.js";
import { ApiError } from "../lib/errors.js";
import { MONTH_START_SQL } from "../lib/range.js";
import { descriptionOf, ownedProjectCount, projectSlug } from "../services/projects.js";
import type { Deps } from "../types/types.js";
import "../types/types.js";

const notFound = () => new ApiError(404, "not_found", "Project not found.");
const forbidden = () => new ApiError(403, "forbidden", "Only a project owner or admin can do that.");
const roles = (role: string) => role.split(","); // Better Auth stores several roles comma-separated

// Projects of the signed-in user (a project = a Better Auth organization = a tenant). These routes do not need an active project.
// A project is only visible through the user's own membership row, so another user's id is a 404.
export function workspacesRouter({ pool, config }: Deps, auth: Auth) {
  const r = Router();
  const name = z.string().trim().min(1).max(config.projectNameMaxChars);
  const description = z.string().trim().max(config.projectDescriptionMaxChars);
  const createBody = z.object({ name, description: description.nullish() });
  const patchBody = z.object({ name: name.optional(), description: description.nullish() }).refine((b) => b.name !== undefined || b.description !== undefined);
  const invalid = (e: z.ZodError) => new ApiError(422, "invalid_request", `Invalid request: ${e.issues[0]?.path.join(".") || "body"}.`);

  // Counts are keyed by tenant_id = the organization id, and only for organizations the user belongs to (rule 1).
  const select = (extra = "") => `
    SELECT o.id, o.name, o.slug, o.metadata, o."createdAt" AS created_at, m.role,
           (SELECT count(*)::int FROM documents d WHERE d.tenant_id = o.id) AS documents,
           (SELECT count(*)::int FROM request_logs l WHERE l.tenant_id = o.id AND l.created_at >= ${MONTH_START_SQL}) AS requests_this_month
    FROM member m JOIN organization o ON o.id = m."organizationId"
    WHERE m."userId" = $1 ${extra} ORDER BY o."createdAt", o.id`;
  const shape = ({ metadata, ...w }: any) => ({ ...w, description: descriptionOf(metadata) });
  const one = async (userId: string, id: string) => {
    const { rows } = await pool.query(select(`AND o.id = $2`), [userId, id]);
    return rows[0] ? shape(rows[0]) : null;
  };

  r.get("/", async (req, res) => {
    const { rows } = await pool.query(select(), [req.userId]);
    res.json({ workspaces: rows.map(shape) });
  });

  r.post("/", async (req, res) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) throw invalid(parsed.error);
    const { name: n, description: d } = parsed.data;
    const client = await pool.connect();
    let id: string;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["projects:" + req.userId]); // two creates cannot both pass the cap check
      if (await ownedProjectCount(client, req.userId!) >= config.maxProjectsPerUser) throw new ApiError(422, "project_limit", `You can own at most ${config.maxProjectsPerUser} projects.`);
      const org = await auth.api.createOrganization({
        body: { name: n, slug: projectSlug(n), metadata: d ? { description: d } : undefined, keepCurrentActiveOrganization: true },
        headers: fromNodeHeaders(req.headers), // the session decides the owner; a userId in our body is never read
      });
      id = (org as { id: string }).id;
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.status(201).json({ workspace: await one(req.userId!, id) });
  });

  // The caller's membership of one project, or a 404 (also for ids that are not ids).
  const membership = async (userId: string, id: string) => {
    if (!z.string().min(1).max(100).safeParse(id).success) throw notFound();
    const { rows } = await pool.query(
      `SELECT o.name, m.role FROM member m JOIN organization o ON o.id = m."organizationId" WHERE m."userId" = $1 AND m."organizationId" = $2`, [userId, id]);
    if (!rows[0]) throw notFound();
    return { name: rows[0].name as string, roles: roles(rows[0].role) };
  };

  r.patch("/:id", async (req, res) => {
    const me = await membership(req.userId!, req.params.id);
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) throw invalid(parsed.error);
    if (!me.roles.some((x) => x === "owner" || x === "admin")) throw forbidden();
    const { name: n, description: d } = parsed.data;
    if (n !== undefined) await pool.query(`UPDATE organization SET name = $2 WHERE id = $1`, [req.params.id, n]);
    if (d !== undefined) await pool.query(`UPDATE organization SET metadata = $2 WHERE id = $1`, [req.params.id, d ? JSON.stringify({ description: d }) : null]);
    res.json({ workspace: await one(req.userId!, req.params.id) });
  });

  r.delete("/:id", async (req, res) => {
    const me = await membership(req.userId!, req.params.id);
    if (!me.roles.includes("owner")) throw forbidden();
    if (req.body?.name !== me.name) throw new ApiError(422, "name_mismatch", "Type the project's name to confirm.");
    const id = req.params.id;
    // One transaction: all of the tenant's data, its keys and members, then the organization. Any failure leaves everything in place.
    // Uploaded files need no cleanup: each is removed as soon as its ingest finishes, and an ingest still running for this
    // project fails harmlessly because its document row is gone.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const sql of [
        "DELETE FROM model_calls WHERE tenant_id = $1",
        "DELETE FROM request_logs WHERE tenant_id = $1",
        "DELETE FROM tenant_models WHERE tenant_id = $1",
        "DELETE FROM chunks WHERE tenant_id = $1",
        "DELETE FROM documents WHERE tenant_id = $1",
        `DELETE FROM apikey WHERE "referenceId" = $1`,
        `DELETE FROM invitation WHERE "organizationId" = $1`,
        `DELETE FROM member WHERE "organizationId" = $1`,
        `UPDATE session SET "activeOrganizationId" = NULL WHERE "activeOrganizationId" = $1`,
        "DELETE FROM organization WHERE id = $1",
      ]) await client.query(sql, [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.status(204).end();
  });

  return r;
}
