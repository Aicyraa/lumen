import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

// Rule 12: tenant-supplied endpoints are untrusted. https only (http://localhost outside production),
// no private/loopback/link-local/metadata addresses, no redirects, timeouts.
export interface Address { address: string; family: number }
export interface GuardOptions {
  production: boolean;
  resolve?: (host: string) => Promise<Address[]>; // injectable for tests
}
export class EndpointError extends Error {}

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96]] as const) blocked.addSubnet(net, bits, "ipv6");
const loopback = new BlockList();
loopback.addSubnet("127.0.0.0", 8, "ipv4");
loopback.addAddress("::1", "ipv6");

const family = (addr: string) => (isIP(addr) === 6 ? "ipv6" : "ipv4");
// BlockList treats IPv4-mapped IPv6 (::ffff:a.b.c.d) as the IPv4 address.
const isBlocked = (addr: string) => blocked.check(addr, family(addr));
// the only exception: http://localhost in development may reach loopback
const allowLoopback = (url: URL, o: GuardOptions) => !o.production && url.protocol === "http:" && url.hostname === "localhost";
const bare = (host: string) => host.replace(/^\[|\]$/g, "");

function checkAddresses(addrs: Address[], url: URL, o: GuardOptions) {
  if (!addrs.length) throw new EndpointError("The endpoint host did not resolve to an address.");
  for (const { address } of addrs) {
    if (allowLoopback(url, o) && loopback.check(address, family(address))) continue;
    if (isBlocked(address)) throw new EndpointError("The endpoint points to a private or internal address, which is not allowed.");
  }
}

const defaultResolve = async (host: string): Promise<Address[]> => dnsLookup(host, { all: true });

// Syntax, scheme and address check. Returns the parsed URL.
export async function assertEndpoint(raw: string, o: GuardOptions): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new EndpointError("The endpoint URL is not valid."); }
  const localDev = !o.production && url.protocol === "http:" && url.hostname === "localhost";
  if (url.protocol !== "https:" && !localDev) throw new EndpointError("The endpoint URL must use https.");
  if (url.username || url.password) throw new EndpointError("The endpoint URL must not contain credentials.");
  const host = bare(url.hostname);
  if (isIP(host)) { checkAddresses([{ address: host, family: isIP(host) }], url, o); return url; }
  let addrs: Address[];
  try { addrs = await (o.resolve ?? defaultResolve)(host); } catch { throw new EndpointError("The endpoint host could not be resolved."); }
  checkAddresses(addrs, url, o);
  return url;
}

// POST that re-checks the address at connect time (via `lookup`), so a DNS answer that changes between
// assertEndpoint and connect (rebinding) is still refused. Redirects are never followed.
// shortcut: one overall timeout (plus socket idle timeout) instead of separate connect/read timers.
export async function guardedPost(raw: string, o: GuardOptions & { timeoutMs: number; maxBodyBytes: number; headers: Record<string, string>; body: string }):
  Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const url = await assertEndpoint(raw, o);
  const resolve = o.resolve ?? defaultResolve;
  const lookup = ((hostname: string, options: { all?: boolean }, cb: (...a: unknown[]) => void) => {
    resolve(hostname).then((addrs) => {
      try { checkAddresses(addrs, url, o); } catch (e) { return cb(e); }
      if (options?.all) cb(null, addrs); else cb(null, addrs[0].address, addrs[0].family);
    }, () => cb(new EndpointError("The endpoint host could not be resolved.")));
  }) as unknown as http.RequestOptions["lookup"];
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolveP, reject) => {
    const req = client.request(url, {
      method: "POST", lookup, timeout: o.timeoutMs, agent: false,
      headers: { ...o.headers, "content-length": Buffer.byteLength(o.body) },
    }, (res) => {
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (c: Buffer) => { size += c.length; if (size <= o.maxBodyBytes) chunks.push(c); }); // cap what we keep
      res.on("end", () => {
        clearTimeout(timer);
        resolveP({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string>, body: Buffer.concat(chunks).toString("utf8") });
      });
      res.on("error", fail);
    });
    const timer = setTimeout(() => fail(new EndpointError("The endpoint timed out.")), o.timeoutMs);
    const fail = (e: Error) => { clearTimeout(timer); req.destroy(); reject(e); };
    req.on("timeout", () => fail(new EndpointError("The endpoint timed out.")));
    req.on("error", fail);
    req.end(o.body);
  });
}
