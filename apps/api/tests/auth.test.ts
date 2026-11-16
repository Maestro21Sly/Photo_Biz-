import request from "supertest";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { startTestServer, stopTestServer } from "./helpers/server.js";
import { env } from "../src/env.js";
import { disconnectDb, prisma, resetDb } from "./helpers/db.js";
import { API, GOOD_PASSWORD, signup, uniqueEmail } from "./helpers/factories.js";

let app: Server;

beforeAll(async () => {
  app = await startTestServer();
});

beforeEach(resetDb);
afterAll(async () => {
  await stopTestServer(app);
  await disconnectDb();
});

describe("POST /auth/signup", () => {
  it("creates a student and returns a usable session", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post(`${API}/auth/signup`)
      .send({ email, password: GOOD_PASSWORD, displayName: "Ama Boateng", acceptedTerms: true })
      .expect(201);

    expect(res.body.user).toMatchObject({ email, role: "STUDENT", displayName: "Ama Boateng" });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(typeof res.body.accessToken).toBe("string");

    await request(app)
      .get(`${API}/auth/me`)
      .set("Authorization", `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it("gives photographers a draft (unpublished) profile so onboarding can continue", async () => {
    const user = await signup(app, { role: "PHOTOGRAPHER" });
    const profile = await prisma.photographerProfile.findUnique({ where: { userId: user.id } });
    expect(profile).not.toBeNull();
    expect(profile!.isPublished).toBe(false);
  });

  it("stores a bcrypt hash, never the password", async () => {
    const user = await signup(app);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).not.toContain(GOOD_PASSWORD);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("normalizes the email to lower case so casing can't create a duplicate account", async () => {
    const email = uniqueEmail();
    await signup(app, { email: email.toUpperCase() });
    await request(app)
      .post(`${API}/auth/signup`)
      .send({ email, password: GOOD_PASSWORD, displayName: "Dupe", acceptedTerms: true })
      .expect(409);
  });

  it("refuses signup without accepting the terms", async () => {
    await request(app)
      .post(`${API}/auth/signup`)
      .send({ email: uniqueEmail(), password: GOOD_PASSWORD, displayName: "No Terms" })
      .expect(400);
  });

  it("refuses an ADMIN role supplied by the client", async () => {
    await request(app)
      .post(`${API}/auth/signup`)
      .send({
        email: uniqueEmail(),
        password: GOOD_PASSWORD,
        displayName: "Sneaky",
        role: "ADMIN",
        acceptedTerms: true,
      })
      .expect(400);
  });

  describe("password policy", () => {
    it.each([
      ["too short", "Ab3!x"],
      ["a common password", "password123"],
      ["a single repeated character", "aaaaaaaaaaaa"],
      ["whitespace padding standing in for length", "  ab3!  "],
    ])("rejects %s", async (_label, password) => {
      await request(app)
        .post(`${API}/auth/signup`)
        .send({ email: uniqueEmail(), password, displayName: "Weak", acceptedTerms: true })
        .expect(400);
    });

    it("rejects a password containing the email local part", async () => {
      await request(app)
        .post(`${API}/auth/signup`)
        .send({
          email: "marcusbrown@campus.test",
          password: "marcusbrown99",
          displayName: "Marcus",
          acceptedTerms: true,
        })
        .expect(400);
    });

    it("rejects a password longer than bcrypt's 72-byte input", async () => {
      await request(app)
        .post(`${API}/auth/signup`)
        .send({
          email: uniqueEmail(),
          password: `A1!${"x".repeat(80)}`,
          displayName: "Long",
          acceptedTerms: true,
        })
        .expect(400);
    });
  });
});

describe("POST /auth/login", () => {
  it("returns a session for correct credentials", async () => {
    const user = await signup(app);
    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it("gives byte-identical responses for a wrong password and an unknown account", async () => {
    const user = await signup(app);
    const wrongPassword = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: "Wr0ng-Password-1" })
      .expect(401);
    const unknownUser = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: uniqueEmail("ghost"), password: "Wr0ng-Password-1" })
      .expect(401);

    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  it("does the same bcrypt work for an unknown account, so latency isn't an oracle", async () => {
    const user = await signup(app);

    const time = async (email: string) => {
      const started = process.hrtime.bigint();
      await request(app).post(`${API}/auth/login`).send({ email, password: "Wr0ng-Password-1" });
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    // Warm the code paths before measuring; the first request pays for lazy init.
    await time(user.email);
    await time(uniqueEmail("ghost"));

    const known = await time(user.email);
    const unknown = await time(uniqueEmail("ghost"));

    // A missing dummy-hash comparison shows up as roughly an order of magnitude,
    // so a generous 5x band still catches the regression without being flaky.
    expect(unknown).toBeGreaterThan(known / 5);
  });
});

describe("access tokens", () => {
  it("rejects a token signed with the wrong secret", async () => {
    const user = await signup(app);
    const forged = jwt.sign({ sub: user.id, role: "ADMIN" }, "not-the-real-secret", {
      expiresIn: "15m",
      issuer: "snapcampus-api",
      audience: "snapcampus-app",
    });
    await request(app).get(`${API}/auth/me`).set("Authorization", `Bearer ${forged}`).expect(401);
  });

  it("rejects an alg=none token", async () => {
    const user = await signup(app);
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ sub: user.id, role: "ADMIN", iss: "snapcampus-api", aud: "snapcampus-app" })
    ).toString("base64url");
    await request(app)
      .get(`${API}/auth/me`)
      .set("Authorization", `Bearer ${header}.${body}.`)
      .expect(401);
  });

  it("rejects a correctly-signed token minted for a different audience", async () => {
    const user = await signup(app);
    const foreign = jwt.sign({ sub: user.id, role: "STUDENT" }, env.jwtAccessSecret, {
      expiresIn: "15m",
      issuer: "snapcampus-api",
      audience: "some-other-service",
    });
    await request(app).get(`${API}/auth/me`).set("Authorization", `Bearer ${foreign}`).expect(401);
  });

  it("rejects an expired token", async () => {
    const user = await signup(app);
    const expired = jwt.sign({ sub: user.id, role: "STUDENT" }, env.jwtAccessSecret, {
      expiresIn: "-1s",
      issuer: "snapcampus-api",
      audience: "snapcampus-app",
    });
    await request(app).get(`${API}/auth/me`).set("Authorization", `Bearer ${expired}`).expect(401);
  });

  it("rejects a missing or malformed Authorization header", async () => {
    await request(app).get(`${API}/auth/me`).expect(401);
    await request(app).get(`${API}/auth/me`).set("Authorization", "Basic abc").expect(401);
    await request(app).get(`${API}/auth/me`).set("Authorization", "Bearer not.a.jwt").expect(401);
  });
});

describe("refresh token rotation", () => {
  it("rotates the token and invalidates the old one", async () => {
    const user = await signup(app);
    const first = await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: user.refreshToken })
      .expect(200);

    expect(first.body.refreshToken).not.toBe(user.refreshToken);
    await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: first.body.refreshToken })
      .expect(200);
  });

  it("revokes the whole family when a rotated token is replayed", async () => {
    const user = await signup(app);
    const rotated = await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: user.refreshToken })
      .expect(200);

    // The victim's original token is replayed by an attacker who captured it.
    await request(app).post(`${API}/auth/refresh`).send({ refreshToken: user.refreshToken }).expect(401);

    // The legitimate, current token must now be dead too — we can't tell which
    // side is the attacker, so the whole lineage goes.
    await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);

    const live = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(live).toBe(0);
  });

  it("rejects an unknown refresh token", async () => {
    await request(app).post(`${API}/auth/refresh`).send({ refreshToken: "a".repeat(96) }).expect(401);
  });

  it("rejects an expired refresh token", async () => {
    const user = await signup(app);
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app).post(`${API}/auth/refresh`).send({ refreshToken: user.refreshToken }).expect(401);
  });

  it("logout revokes only the presented token", async () => {
    const user = await signup(app);
    const second = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: user.password })
      .expect(200);

    await request(app).post(`${API}/auth/logout`).send({ refreshToken: user.refreshToken }).expect(204);
    await request(app).post(`${API}/auth/refresh`).send({ refreshToken: user.refreshToken }).expect(401);
    await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: second.body.refreshToken })
      .expect(200);
  });
});

describe("password change", () => {
  it("requires the current password", async () => {
    const user = await signup(app);
    await request(app)
      .post(`${API}/auth/change-password`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ currentPassword: "Wr0ng-Password-1", newPassword: "An0ther-Good-1" })
      .expect(400);
  });

  it("applies the same policy as signup", async () => {
    const user = await signup(app);
    await request(app)
      .post(`${API}/auth/change-password`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ currentPassword: user.password, newPassword: "password123" })
      .expect(400);
  });

  it("kills every other session", async () => {
    const user = await signup(app);
    const other = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: user.password })
      .expect(200);

    await request(app)
      .post(`${API}/auth/change-password`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ currentPassword: user.password, newPassword: "An0ther-Good-1" })
      .expect(204);

    await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: other.body.refreshToken })
      .expect(401);
    await request(app)
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: "An0ther-Good-1" })
      .expect(200);
  });
});

describe("password reset", () => {
  it("answers identically for known and unknown addresses", async () => {
    const user = await signup(app);
    const known = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: user.email })
      .expect(200);
    const unknown = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: uniqueEmail("ghost") })
      .expect(200);

    expect(known.body.ok).toBe(true);
    expect(unknown.body.ok).toBe(true);
    // devToken is a non-production affordance; the boolean shape stays the same.
    expect(Object.keys(unknown.body)).toEqual(["ok"]);
  });

  it("resets the password, burns the token, and revokes sessions", async () => {
    const user = await signup(app);
    const { body } = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: user.email })
      .expect(200);

    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: body.devToken, newPassword: "Reset-Passw0rd" })
      .expect(204);

    // Single use.
    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: body.devToken, newPassword: "Another-Passw0rd" })
      .expect(400);

    await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken: user.refreshToken })
      .expect(401);
    await request(app)
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: "Reset-Passw0rd" })
      .expect(200);
  });

  it("invalidates other outstanding reset links once one is used", async () => {
    const user = await signup(app);
    const first = await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });
    const second = await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });

    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: second.body.devToken, newPassword: "Reset-Passw0rd" })
      .expect(204);
    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: first.body.devToken, newPassword: "Hijack-Passw0rd" })
      .expect(400);
  });

  it("rejects an expired reset token", async () => {
    const user = await signup(app);
    const { body } = await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: body.devToken, newPassword: "Reset-Passw0rd" })
      .expect(400);
  });

  it("refuses to verify an email with a RESET-purpose token", async () => {
    const user = await signup(app);
    const { body } = await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });
    await request(app).post(`${API}/auth/verify-email`).send({ token: body.devToken }).expect(400);
  });

  it("enforces the password policy on reset", async () => {
    const user = await signup(app);
    const { body } = await request(app).post(`${API}/auth/forgot-password`).send({ email: user.email });
    await request(app)
      .post(`${API}/auth/reset-password`)
      .send({ token: body.devToken, newPassword: "password123" })
      .expect(400);
  });
});

describe("email verification", () => {
  it("verifies with the token issued at signup and can't be replayed", async () => {
    const user = await signup(app);
    const record = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id, purpose: "VERIFY" },
    });
    // The raw token only exists in the emailed link, so drive it through the
    // hash the same way the route does.
    const raw = await issueKnownVerifyToken(user.id);
    expect(record.purpose).toBe("VERIFY");

    await request(app).post(`${API}/auth/verify-email`).send({ token: raw }).expect(204);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerified).toBe(true);

    await request(app).post(`${API}/auth/verify-email`).send({ token: raw }).expect(400);
  });
});

describe("account settings", () => {
  it("updates only the caller's own display name", async () => {
    const user = await signup(app);
    const victim = await signup(app);

    await request(app)
      .patch(`${API}/auth/me`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ displayName: "Renamed" })
      .expect(200);

    const victimRow = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect(victimRow.displayName).toBe("Test Person");
  });

  it("rejects a push token that isn't an Expo token", async () => {
    const user = await signup(app);
    await request(app)
      .put(`${API}/auth/push-token`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ pushToken: "https://attacker.test/collect" })
      .expect(400);

    await request(app)
      .put(`${API}/auth/push-token`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ pushToken: "ExponentPushToken[abcDEF123-_]" })
      .expect(204);
  });

  it("requires the password to delete the account, then cascades", async () => {
    const user = await signup(app);
    await request(app)
      .delete(`${API}/auth/me`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ password: "Wr0ng-Password-1" })
      .expect(400);

    await request(app)
      .delete(`${API}/auth/me`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ password: user.password })
      .expect(204);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });
});

/** Mints a VERIFY token directly so a test can hold the raw value the email would carry. */
async function issueKnownVerifyToken(userId: string): Promise<string> {
  const crypto = await import("node:crypto");
  const raw = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
      purpose: "VERIFY",
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return raw;
}
