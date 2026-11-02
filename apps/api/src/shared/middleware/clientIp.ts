import type { RequestHandler } from "express";

// Better Auth reads the client address for its rate limits and sessions from request headers, and only accepts an
// X-Forwarded-For with a single entry, so behind Vercel and Render (several entries) or in dev (none) it finds no address.
// Express already resolves the visitor from TRUST_PROXY, so hand Better Auth that result in one header of our own.
// It is overwritten on every request, so a client cannot choose its own address.
export const CLIENT_IP_HEADER = "x-lumen-client-ip";

export const clientIp: RequestHandler = (req, _res, next) => {
  const ip = req.ip?.replace(/^::ffff:/, ""); // an IPv4 peer arrives IPv4-mapped on a dual-stack socket
  if (ip) req.headers[CLIENT_IP_HEADER] = ip;
  else delete req.headers[CLIENT_IP_HEADER];
  next();
};
