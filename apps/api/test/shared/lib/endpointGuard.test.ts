import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertEndpoint, guardedPost } from "../../../src/shared/lib/endpointGuard.js";

const publicIp = async () => [{ address: "93.184.216.34", family: 4 }];
const dev = { production: false, resolve: publicIp };
const prod = { production: true, resolve: publicIp };

describe("assertEndpoint: scheme and shape", () => {
  it("accepts https to a public address", async () => {
    await expect(assertEndpoint("https://api.example.com/v1", prod)).resolves.toBeInstanceOf(URL);
  });
  it.each([
    "http://api.example.com/v1",
    "ftp://api.example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "not a url",
    "",
  ])("refuses %j", async (url) => {
    await expect(assertEndpoint(url, dev)).rejects.toThrow();
  });
  it("refuses credentials in the URL", async () => {
    await expect(assertEndpoint("https://user:pw@api.example.com/v1", dev)).rejects.toThrow(
      /credentials/,
    );
  });
  it("allows http://localhost only outside production", async () => {
    await expect(
      assertEndpoint("http://localhost:11434/v1", { production: false }),
    ).resolves.toBeInstanceOf(URL);
    await expect(
      assertEndpoint("http://localhost:11434/v1", { production: true }),
    ).rejects.toThrow();
  });
  it("does not make https://localhost or http://127.0.0.1 an exception", async () => {
    const loop = async () => [{ address: "127.0.0.1", family: 4 }]; // what the OS resolver says for localhost
    await expect(
      assertEndpoint("https://localhost/v1", { production: false, resolve: loop }),
    ).rejects.toThrow();
    await expect(assertEndpoint("http://127.0.0.1:11434/v1", dev)).rejects.toThrow();
  });
});

describe("assertEndpoint: private, loopback, link-local and metadata addresses", () => {
  it.each([
    "https://127.0.0.1/v1",
    "https://127.1.2.3/v1",
    "https://10.0.0.5/v1",
    "https://172.16.0.1/v1",
    "https://172.31.255.255/v1",
    "https://192.168.1.1/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://0.0.0.0/v1",
    "https://100.64.0.1/v1",
    "https://2130706433/v1",
    "https://0x7f.1/v1",
    "https://[::1]/v1",
    "https://[fc00::1]/v1",
    "https://[fd12:3456::1]/v1",
    "https://[fe80::1]/v1",
    "https://[::]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://[::ffff:169.254.169.254]/v1",
    "https://[::ffff:10.0.0.1]/v1",
  ])("refuses the literal address in %s", async (url) => {
    await expect(assertEndpoint(url, dev)).rejects.toThrow(/private|internal|not allowed/i);
  });
  it("accepts a public literal address", async () => {
    await expect(assertEndpoint("https://93.184.216.34/v1", prod)).resolves.toBeInstanceOf(URL);
  });
  it("refuses a hostname that resolves to a private address, even if another answer is public", async () => {
    const mixed = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.1.1.1", family: 4 },
    ];
    await expect(
      assertEndpoint("https://evil.example.com/v1", { production: true, resolve: mixed }),
    ).rejects.toThrow(/private|internal|not allowed/i);
    const meta = async () => [{ address: "169.254.169.254", family: 4 }];
    await expect(
      assertEndpoint("https://evil.example.com/v1", { production: true, resolve: meta }),
    ).rejects.toThrow();
  });
  it("refuses a hostname that does not resolve", async () => {
    const none = async () => {
      throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    };
    await expect(
      assertEndpoint("https://nope.example.com/v1", { production: true, resolve: none }),
    ).rejects.toThrow(/resolve/);
  });
});

describe("guardedPost", () => {
  let server: Server;
  let port: number;
  let hits: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url!);
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "http://169.254.169.254/latest" });
        return res.end();
      }
      if (req.url === "/hang") return; // never answers
      res
        .writeHead(200, {
          "content-type": "application/json",
          "x-ratelimit-remaining-requests": "9",
        })
        .end('{"ok":true}');
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });
  const opts = { production: false, timeoutMs: 400, maxBodyBytes: 4096, headers: {}, body: "{}" };

  it("posts and returns status, headers and body", async () => {
    const res = await guardedPost(`http://localhost:${port}/ok`, opts);
    expect(res.status).toBe(200);
    expect(res.headers["x-ratelimit-remaining-requests"]).toBe("9");
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
  it("does not follow redirects", async () => {
    hits = [];
    const res = await guardedPost(`http://localhost:${port}/redirect`, opts);
    expect(res.status).toBe(302);
    expect(hits).toEqual(["/redirect"]);
  });
  it("times out when the endpoint never answers", async () => {
    await expect(guardedPost(`http://localhost:${port}/hang`, opts)).rejects.toThrow(/timed out/);
  });
  it("refuses a private literal without connecting", async () => {
    await expect(guardedPost(`http://127.0.0.1:${port}/ok`, opts)).rejects.toThrow();
    await expect(guardedPost("https://169.254.169.254/latest", opts)).rejects.toThrow();
  });
  it("re-checks the address at connect time (DNS rebinding): a name that later resolves to a private IP is refused", async () => {
    let calls = 0;
    const rebinding = async () =>
      ++calls === 1
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }];
    const o = {
      production: true,
      resolve: rebinding,
      timeoutMs: 400,
      maxBodyBytes: 4096,
      headers: {},
      body: "{}",
    };
    await assertEndpoint("https://rebind.example.com/v1", o);
    await expect(guardedPost("https://rebind.example.com/v1", o)).rejects.toThrow(
      /private|internal|not allowed/i,
    );
  });
});
