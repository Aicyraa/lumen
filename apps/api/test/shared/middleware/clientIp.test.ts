import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER, clientIp } from "../../../src/shared/middleware/clientIp.js";

const appWith = (trustProxy: boolean | number | string) => {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.use(clientIp);
  app.get("/", (req, res) => res.json({ seen: req.headers[CLIENT_IP_HEADER] ?? null }));
  return app;
};

describe("clientIp", () => {
  it("stamps the address Express resolved, and drops the IPv4-mapped prefix", async () => {
    const res = await request(appWith(false)).get("/");
    expect(res.body.seen).toBe("127.0.0.1");
  });

  it("uses the visitor from X-Forwarded-For according to trust proxy, not the whole chain", async () => {
    const res = await request(appWith(2))
      .get("/")
      .set("X-Forwarded-For", "203.0.113.7, 198.51.100.1");
    expect(res.body.seen).toBe("203.0.113.7");
  });

  it("overwrites a header the client sent itself", async () => {
    const res = await request(appWith(false)).get("/").set(CLIENT_IP_HEADER, "1.2.3.4");
    expect(res.body.seen).toBe("127.0.0.1");
  });
});
