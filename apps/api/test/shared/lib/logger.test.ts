import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../../src/shared/lib/logger.js";

describe("createLogger redaction", () => {
  it("masks provider keys and secrets wherever the models payload is logged", () => {
    const lines: string[] = [];
    const log = createLogger(
      new Writable({
        write(c, _e, cb) {
          lines.push(String(c));
          cb();
        },
      }),
      "debug",
    );
    log.info({ api_key: "sk-top-zqone" }, "a");
    log.info({ models: { cheap: [{ model_id: "m", api_key: "sk-deep-zqtwo" }] } }, "b");
    log.info({ model: { api_key_encrypted: "iv.tag.ct-zqthree", apiKey: "sk-camel-zqfour" } }, "c");
    log.info(
      {
        req: {
          headers: {
            "x-api-key": "lum-zqfive",
            cookie: "c=zqsix",
            authorization: "Bearer zqseven",
            "x-internal-secret": "zqeight",
          },
        },
      },
      "d",
    );
    const out = lines.join("");
    for (const secret of [
      "zqone",
      "zqtwo",
      "zqthree",
      "zqfour",
      "zqfive",
      "zqsix",
      "zqseven",
      "zqeight",
    ])
      expect(out).not.toContain(secret);
    expect(out).toContain('"model_id":"m"');
  });

  const capture = () => {
    const lines: string[] = [];
    const log = createLogger(
      new Writable({
        write(c, _e, cb) {
          lines.push(String(c));
          cb();
        },
      }),
      "debug",
    );
    return { log, out: () => lines.join("") };
  };

  it("masks capitalised headers inside an error's config.headers (an HTTP client error carries the request)", () => {
    const { log, out } = capture();
    const err = Object.assign(new Error("request failed"), {
      config: {
        headers: {
          Authorization: "Bearer SECRET-A",
          Cookie: "s=SECRET-B",
          "X-Api-Key": "SECRET-C",
          "X-Internal-Secret": "SECRET-D",
          "content-type": "json",
        },
      },
    });
    log.error({ err }, "provider call failed");
    log.error(err); // an Error as the only argument
    const o = out();
    for (const s of ["SECRET-A", "SECRET-B", "SECRET-C", "SECRET-D"]) expect(o, s).not.toContain(s);
    expect(o).toContain("request failed");
    expect(o).toContain("content-type");
  });

  it("masks api_key and the other secrets at any depth, inside arrays too", () => {
    const { log, out } = capture();
    log.info({ a: { b: { c: { d: { e: { f: { api_key: "SECRET-DEEP" } } } } } } }, "six levels");
    log.info(
      {
        list: [
          {
            x: [
              {
                y: {
                  apiKey: "SECRET-ARR",
                  snippet: "SECRET-SNIP",
                  api_key_encrypted: "SECRET-ENC",
                },
              },
            ],
          },
        ],
      },
      "arrays",
    );
    const o = out();
    for (const s of ["SECRET-DEEP", "SECRET-ARR", "SECRET-SNIP", "SECRET-ENC"])
      expect(o, s).not.toContain(s);
  });

  it("survives circular references and keeps non-secret fields", () => {
    const { log, out } = capture();
    const loop: Record<string, unknown> = { name: "visible", api_key: "SECRET-LOOP" };
    loop.self = loop;
    log.info({ loop }, "cycle");
    expect(out()).toContain("visible");
    expect(out()).not.toContain("SECRET-LOOP");
  });
});
