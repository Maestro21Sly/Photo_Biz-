import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";
import { env } from "../env.js";

const message = { error: "Too many requests — please slow down and try again shortly." };

/**
 * Collapse an IPv6 address to its /64 prefix. Keying limits on the full address
 * is useless against IPv6: a single host is routinely handed a /64 (18 billion
 * billion addresses) and can rotate the low bits to look like a new client on
 * every request. IPv4-mapped addresses are keyed on the embedded IPv4.
 */
export function normalizeIp(raw: string | undefined): string {
  const ip = (raw ?? "unknown").split("%")[0]!; // drop any zone id
  if (!ip.includes(":")) return ip;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;

  const [head, tail] = ip.split("::");
  const hextets = (head ?? "").split(":").filter(Boolean).slice(0, 4);
  if (tail !== undefined) while (hextets.length < 4) hextets.push("0");
  return `${hextets.join(":")}::/64`;
}

const clientIp = (req: Request) => normalizeIp(req.ip);

function limiter(opts: Partial<Options> & { limit: number; windowMs: number }) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    message,
    // One switch so the broad integration suites aren't throttled by limiters
    // they aren't exercising, while the dedicated rate-limit tests turn it on.
    skip: () => !env.rateLimit.enabled,
    ...opts,
  });
}

/**
 * Strict, keyed by IP *and* email: stops a brute force against one account
 * without letting one user's typo storm lock out a whole campus NAT.
 */
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimit.authPerEmail,
  keyGenerator: (req) => `${clientIp(req)}:${(req.body?.email ?? "").toString().toLowerCase()}`,
});

/**
 * Companion to authLimiter, keyed by IP alone. Without it, credential stuffing
 * simply varies the email on every attempt and never trips the per-email bucket.
 */
export const authIpLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimit.authPerIp,
  keyGenerator: clientIp,
});

/**
 * For endpoints that consume an opaque secret carried in the body (refresh,
 * reset, verify). They have no email to key on, and unlimited attempts turn
 * them into a free oracle for guessing tokens.
 */
export const tokenLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimit.tokenPerIp,
  keyGenerator: clientIp,
});

/** Moderate: authenticated write endpoints (messages, bookings, reviews, uploads). */
export const writeLimiter = limiter({
  windowMs: 60 * 1000,
  limit: env.rateLimit.writePerUser,
  keyGenerator: (req) => req.user?.id ?? clientIp(req),
});

/** Global safety net for everything else. */
export const globalLimiter = limiter({
  windowMs: 60 * 1000,
  limit: env.rateLimit.global,
  keyGenerator: clientIp,
});
