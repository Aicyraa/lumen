import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeCtx, type Ctx, type Tenant } from "../helpers/ctx.js";

let ctx: Ctx, a: Tenant;
beforeAll(async () => { ctx = await makeCtx({ dashboardOrigin: "http://localhost:5173" }); a = await ctx.createTenant("a"); });
afterAll(async () => { await ctx.close(); });

const routes = ["/api/dashboard/usage", "/api/dashboard/requests", "/api/dashboard/analytics/summary", "/api/dashboard/analytics/unanswered", "/api/dashboard/documents", "/api/dashboard/models"];

describe("CORS for the dashboard origin", () => {
  it.each(routes)("%s allows the DASHBOARD_ORIGIN with credentials", async (path) => {
    const res = await request(ctx.app).get(path).set("origin", "http://localhost:5173").set("cookie", a.cookie);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("answers the preflight for a credentialed JSON POST (feedback) from the dashboard origin", async () => {
    const res = await request(ctx.app).options("/api/dashboard/feedback").set("origin", "http://localhost:5173")
      .set("access-control-request-method", "POST").set("access-control-request-headers", "content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(res.headers["access-control-allow-methods"]).toMatch(/DELETE/); // document delete and model remove are DELETE/PATCH
  });

  it("does not echo another origin", async () => {
    const res = await request(ctx.app).get("/api/dashboard/usage").set("origin", "https://evil.example").set("cookie", a.cookie);
    expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
  });
});
