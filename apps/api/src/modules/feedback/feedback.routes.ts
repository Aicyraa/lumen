import type { RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../../shared/lib/errors.js";
import type { Deps } from "../../shared/types/types.js";

const body = z.object({ request_id: z.uuid(), rating: z.union([z.literal(1), z.literal(-1)]) });

export const feedbackHandler =
  ({ pool }: Deps): RequestHandler =>
  async (req, res) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success)
      throw new ApiError(
        422,
        "invalid_request",
        `Invalid request: ${parsed.error.issues[0].path.join(".") || "body"}.`,
      );
    const { rowCount } = await pool.query(
      "UPDATE request_logs SET feedback = $3 WHERE id = $1 AND tenant_id = $2",
      [parsed.data.request_id, req.tenantId, parsed.data.rating],
    );
    if (!rowCount) throw new ApiError(404, "not_found", "Request not found.");
    res.status(204).end();
  };
