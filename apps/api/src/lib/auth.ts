import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  exp?: number;
}

const JWT_ALGORITHM = "HS256" as const;
const JWT_ISSUER = "snapcampus-api";
const JWT_AUDIENCE = "snapcampus-app";

// A real bcrypt hash of a value nobody knows. Comparing against it on the
// "user not found" branch keeps login latency indistinguishable from a wrong
// password, which is what stops an attacker enumerating accounts by timing.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), env.bcryptRounds);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.bcryptRounds);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Burns the same work as a real comparison so a missing account looks identical. */
export async function verifyPasswordDummy(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = {
    expiresIn: env.accessTokenTtl as jwt.SignOptions["expiresIn"],
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign({ sub: payload.sub, role: payload.role }, env.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  // Pinning the algorithm matters: a verifier left to its defaults honours
  // whatever `alg` the token header claims, which is the root of the classic
  // algorithm-confusion attacks. issuer/audience stop a token minted for some
  // other service (or a future refresh-token JWT) being replayed as an access token.
  return jwt.verify(token, env.jwtAccessSecret, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as AccessTokenPayload;
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Refresh tokens are opaque random strings. We store only a hash, so a DB leak
 * can't be replayed. Returns the raw token to hand to the client.
 *
 * `familyId` ties every token descended from one login together — see rotateRefreshToken.
 */
export async function issueRefreshToken(userId: string, familyId?: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      familyId: familyId ?? crypto.randomUUID(),
      expiresAt,
    },
  });
  return raw;
}

export type RotateResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: "invalid" | "expired" | "reused" };

/**
 * Rotate a refresh token, with reuse detection.
 *
 * A refresh token is single-use. Rotated tokens are marked revoked rather than
 * deleted, because a second presentation of an already-rotated token is the only
 * signal we ever get that a token was stolen. At that point we can't distinguish
 * the thief from the victim, so we revoke the whole family and force a re-login.
 */
export async function rotateRefreshToken(raw: string): Promise<RotateResult> {
  const tokenHash = hashToken(raw);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return { ok: false, reason: "invalid" };

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, reason: "reused" };
  }

  if (existing.expiresAt < new Date()) return { ok: false, reason: "expired" };

  // Conditional update = compare-and-swap. Two concurrent refreshes carrying the
  // same token race here; exactly one wins and the loser is treated as a replay.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count !== 1) return { ok: false, reason: "reused" };

  const token = await issueRefreshToken(existing.userId, existing.familyId);
  return { ok: true, userId: existing.userId, token };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Kills every live session for a user (password change, reset, account recovery). */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
