import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate } from "../middleware/auth.js";
import { authIpLimiter, authLimiter, tokenLimiter, writeLimiter } from "../middleware/ratelimit.js";
import { sendPasswordReset, sendVerifyEmail } from "../lib/email.js";
import { badRequest, conflict, unauthorized } from "../lib/errors.js";
import { passwordSchema, passwordUsesEmail } from "../lib/password.js";
import {
  hashPassword,
  issueRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  verifyPassword,
  verifyPasswordDummy,
} from "../lib/auth.js";

export const authRouter = Router();

const emailSchema = z.string().email().max(254).toLowerCase();

// Login deliberately does *not* apply the signup password policy: rejecting a
// short password before checking it would tell an attacker the policy applies to
// a real account, and would lock out anyone whose password predates the policy.
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(60),
  role: z.enum(["STUDENT", "PHOTOGRAPHER"]).default("STUDENT"),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms & Privacy Policy" }),
  }),
});

// notify() forwards this straight to Expo's push service, so only accept the
// shape Expo issues rather than an arbitrary attacker-supplied string.
const expoPushTokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,128}\]$/, "Not a valid Expo push token");

function publicUser(u: { id: string; email: string; role: string; displayName: string; avatarUrl: string | null }) {
  return { id: u.id, email: u.email, role: u.role, displayName: u.displayName, avatarUrl: u.avatarUrl };
}

async function issueSession(user: { id: string; role: "STUDENT" | "PHOTOGRAPHER" | "ADMIN" }) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken };
}

/** Create a single-use, hashed email token (RESET or VERIFY) and return the raw value. */
async function createEmailToken(userId: string, purpose: "RESET" | "VERIFY", ttlMs: number): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, purpose, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return raw;
}

/**
 * Look up an unconsumed email token by its raw value.
 *
 * The claim is done with a conditional updateMany rather than read-then-write so
 * two simultaneous requests carrying the same token can't both succeed — a reset
 * link is single-use and the database, not the application, has to enforce that.
 */
async function consumeEmailToken(rawToken: string, purpose: "RESET" | "VERIFY") {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt < new Date()) {
    return null;
  }
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? record : null;
}

authRouter.post(
  "/signup",
  authIpLimiter,
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, displayName, role } = signupSchema.parse(req.body);
    if (passwordUsesEmail(password, email)) {
      throw badRequest("Password must not contain your email address");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    // Any product that prevents duplicate emails leaks existence here; hiding it
    // would mean silently accepting a signup the user can never log into. The
    // residual enumeration risk is capped by authIpLimiter instead.
    if (existing) throw conflict("An account with that email already exists");

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        displayName,
        role,
        acceptedTermsAt: new Date(),
        // Photographers get a draft profile immediately so onboarding can continue.
        photographerProfile:
          role === "PHOTOGRAPHER"
            ? { create: { campus: "", isPublished: false } }
            : undefined,
      },
    });

    // Fire off a verification email (best-effort; doesn't block signup).
    const verifyToken = await createEmailToken(user.id, "VERIFY", 24 * 60 * 60 * 1000);
    void sendVerifyEmail(user.email, `${env.appUrl}/verify-email?token=${verifyToken}`);

    const session = await issueSession(user);
    res.status(201).json({ user: publicUser(user), ...session });
  })
);

authRouter.post(
  "/login",
  authIpLimiter,
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });

    // Returning early on "no such user" would answer in ~1 ms while a real
    // account costs a full bcrypt round — a timing oracle that enumerates the
    // whole user table. Burn the same work on both branches.
    if (!user) {
      await verifyPasswordDummy(password);
      throw unauthorized("Incorrect email or password");
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized("Incorrect email or password");
    }

    const session = await issueSession(user);
    res.json({ user: publicUser(user), ...session });
  })
);

authRouter.post(
  "/refresh",
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1).max(512) }).parse(req.body);
    const rotated = await rotateRefreshToken(refreshToken);
    if (!rotated.ok) {
      // A replayed token means the token was captured; rotateRefreshToken has
      // already killed the whole family, so every device must sign in again.
      throw unauthorized(
        rotated.reason === "reused"
          ? "This session was ended for security reasons — please sign in again"
          : "Session expired, please sign in again"
      );
    }

    const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user) throw unauthorized();

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    res.json({ accessToken, refreshToken: rotated.token });
  })
);

authRouter.post(
  "/logout",
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1).max(512) }).parse(req.body);
    await revokeRefreshToken(refreshToken);
    res.status(204).end();
  })
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { photographerProfile: { select: { id: true, isPublished: true } } },
    });
    if (!user) throw unauthorized();
    res.json({
      ...publicUser(user),
      phone: user.phone,
      emailVerified: user.emailVerified,
      photographerProfileId: user.photographerProfile?.id ?? null,
      profilePublished: user.photographerProfile?.isPublished ?? null,
    });
  })
);

const pushSchema = z.object({ pushToken: expoPushTokenSchema.nullable() });
authRouter.put(
  "/push-token",
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { pushToken } = pushSchema.parse(req.body);
    await prisma.user.update({ where: { id: req.user!.id }, data: { pushToken } });
    res.status(204).end();
  })
);

// PATCH /auth/me — edit your own account (name, phone). Avatar uses /media/avatar.
const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(60).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});
authRouter.patch(
  "/me",
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const data = profileSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user!.id }, data });
    res.json({ ...publicUser(user), phone: user.phone });
  })
);

// POST /auth/change-password — verify current, set new, revoke other sessions.
authRouter.post(
  "/change-password",
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest("Current password is incorrect");
    }
    if (passwordUsesEmail(newPassword, user.email)) {
      throw badRequest("Password must not contain your email address");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    // Invalidate every refresh token so other devices — including an attacker's —
    // must re-authenticate with the new password.
    await revokeAllRefreshTokens(user.id);
    res.status(204).end();
  })
);

// POST /auth/forgot-password — issue a single-use reset token.
authRouter.post(
  "/forgot-password",
  authIpLimiter,
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    let devToken: string | undefined;
    if (user) {
      const raw = await createEmailToken(user.id, "RESET", 60 * 60 * 1000);
      void sendPasswordReset(user.email, `${env.appUrl}/reset-password?token=${raw}`);
      if (!env.isProd) devToken = raw; // convenience for local testing only
    } else {
      // Match the cost of the token-issuing branch so the 200 response doesn't
      // become a timing oracle for "is this address registered".
      await verifyPasswordDummy(email);
    }
    // Always 200 to avoid account enumeration.
    res.json({ ok: true, ...(devToken ? { devToken } : {}) });
  })
);

// POST /auth/reset-password — consume token, set new password.
authRouter.post(
  "/reset-password",
  tokenLimiter,
  authIpLimiter,
  asyncHandler(async (req, res) => {
    const { token, newPassword } = z
      .object({ token: z.string().min(1).max(512), newPassword: passwordSchema })
      .parse(req.body);
    const record = await consumeEmailToken(token, "RESET");
    if (!record) throw badRequest("This reset link is invalid or expired");

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      // Whoever triggered the reset may not be the one holding a stolen session.
      prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      // Any other outstanding reset links for this account are now stale.
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, purpose: "RESET", usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    res.status(204).end();
  })
);

// POST /auth/verify-email — confirm an email via the token from the verify link.
authRouter.post(
  "/verify-email",
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(1).max(512) }).parse(req.body);
    const record = await consumeEmailToken(token, "VERIFY");
    if (!record) throw badRequest("This verification link is invalid or expired");
    await prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } });
    res.status(204).end();
  })
);

// POST /auth/resend-verification — request a fresh verification email.
authRouter.post(
  "/resend-verification",
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw unauthorized();
    if (user.emailVerified) return res.status(204).end();
    const raw = await createEmailToken(user.id, "VERIFY", 24 * 60 * 60 * 1000);
    void sendVerifyEmail(user.email, `${env.appUrl}/verify-email?token=${raw}`);
    res.status(204).end();
  })
);

// DELETE /auth/me — permanent account deletion (App Store 5.1.1(v) / GDPR).
authRouter.delete(
  "/me",
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw badRequest("Password is incorrect");
    }
    // Relations cascade on delete (profile, bookings, reviews, threads, etc.).
    await prisma.user.delete({ where: { id: user.id } });
    res.status(204).end();
  })
);
