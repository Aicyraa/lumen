import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/lib/logger.js";

describe("createLogger redaction", () => {
  it("masks provider keys and secrets wherever the models payload is logged", () => {
    const lines: string[] = [];
    const log = createLogger(new Writable({ write(c, _e, cb) { lines.push(String(c)); cb(); } }), "debug");
    log.info({ api_key: "sk-top-1111" }, "a");
    log.info({ models: { cheap: [{ model_id: "m", api_key: "sk-deep-2222" }] } }, "b");
    log.info({ model: { api_key_encrypted: "iv.tag.ct-3333", apiKey: "sk-camel-4444" } }, "c");
    log.info({ req: { headers: { "x-api-key": "lum-5555", cookie: "c=6666", authorization: "Bearer 7777", "x-internal-secret": "8888" } } }, "d");
    const out = lines.join("");
    for (const secret of ["1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888"]) expect(out).not.toContain(secret);
    expect(out).toContain('"model_id":"m"');
  });
});
