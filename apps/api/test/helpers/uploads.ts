import request from "supertest";
import type { Ctx, Tenant } from "./ctx.js";

// POST a file to /v1/documents (API key) or /api/dashboard/documents (session cookie); `fields` are extra form fields.
export function uploadFile(
  ctx: Ctx,
  tenant: Tenant,
  { via = "v1", name = "f.md", body = "hello", fields = {} } = {} as {
    via?: "v1" | "dash";
    name?: string;
    body?: string;
    fields?: Record<string, string>;
  },
) {
  let req =
    via === "v1"
      ? request(ctx.app).post("/v1/documents").set("x-api-key", tenant.apiKey)
      : request(ctx.app).post("/api/dashboard/documents").set("cookie", tenant.cookie);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach("file", Buffer.from(body), name);
}

// Polls until `done` is true, so a test waits for the effect itself instead of sleeping a fixed time.
export async function until(done: () => boolean | Promise<boolean>, { tries = 100, ms = 40 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (await done()) return;
    await new Promise((r) => setTimeout(r, ms));
  }
  throw new Error("condition not reached");
}
