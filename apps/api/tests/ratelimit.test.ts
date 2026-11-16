/**
 * Rate limiting is switched off for the rest of the suite (see .env.test) so the
 * shared counters don't leak between unrelated tests. This file turns it back on
 * with deliberately tiny limits, which is why every import of application code
 * happens *after* the environment is set — src/env.ts snapshots it at load.
 *
 * TRUST_PROXY=1 lets each test present its own X-Forwarded-For and therefore get
 * its own bucket, since express-rate-limit's store lives for the whole file.
 */
const OVERRIDES: Record<string, string> = {
  RATE_LIMIT_DISABLED: "false",
  RATE_LIMIT_AUTH_PER_EMAIL: "3",
  RATE_LIMIT_AUTH_PER_IP: "8",
  RATE_LIMIT_TOKEN_PER_IP: "4",
  RATE_LIMIT_WRITE_PER_USER: "3",
  RATE_LIMIT_GLOBAL: "200",
  TRUST_PROXY: "1",
};

// process.env is shared by every suite in a worker, so the originals are captured
// here and put back in afterAll — otherwise a suite that happens to be scheduled
// after this one would inherit three-request write limits and fail at random.
const ORIGINALS = Object.fromEntries(Object.keys(OVERRIDES).map((k) => [k, process.env[k]]));
Object.assign(process.env, OVERRIDES);

import request from "supertest";
import type { Server } from "node:http";

const { startTestServer, stopTestServer } = require("./helpers/server") as typeof import("./helpers/server");
const { resetDb, disconnectDb } = require("./helpers/db") as typeof import("./helpers/db");
const factories = require("./helpers/factories") as typeof import("./helpers/factories");

const { API, GOOD_PASSWORD, publishedPhotographer, signup, uniqueEmail } = factories;

let app: Server;

beforeAll(async () => {
  app = await startTestServer();
});

let ipCounter = 0;
/** A fresh client IP per test, so one test's throttling can't spill into the next. */
const nextIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

beforeEach(resetDb);
afterAll(async () => {
  for (const [key, value] of Object.entries(ORIGINALS)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await stopTestServer(app);
  await disconnectDb();
});

describe("auth endpoints", () => {
  it("throttles repeated password guesses against one account", async () => {
    const ip = nextIp();
    const email = uniqueEmail("victim");
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .set("X-Forwarded-For", ip)
        .send({ email, password: "Wr0ng-Password-1" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it("throttles credential stuffing that rotates the email on every attempt", async () => {
    // Every attempt uses a fresh address, so the per-email bucket never fills —
    // only the IP-keyed companion limiter can catch this.
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .set("X-Forwarded-For", ip)
        .send({ email: uniqueEmail("spray"), password: "Wr0ng-Password-1" });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 401)).toHaveLength(8);
  });

  it("does not let one attacker's IP lock out everyone else", async () => {
    const attackerIp = nextIp();
    const innocentIp = nextIp();
    const email = uniqueEmail("shared");

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`${API}/auth/login`)
        .set("X-Forwarded-For", attackerIp)
        .send({ email, password: "Wr0ng-Password-1" });
    }

    const user = await signup(app, { email: uniqueEmail("legit") });
    const res = await request(app)
      .post(`${API}/auth/login`)
      .set("X-Forwarded-For", innocentIp)
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
  });

  it("throttles signup", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post(`${API}/auth/signup`)
        .set("X-Forwarded-For", ip)
        .send({
          email: uniqueEmail("flood"),
          password: GOOD_PASSWORD,
          displayName: "Flooder",
          acceptedTerms: true,
        });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it("throttles password-reset requests", async () => {
    const ip = nextIp();
    const email = uniqueEmail("reset");
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post(`${API}/auth/forgot-password`)
        .set("X-Forwarded-For", ip)
        .send({ email });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it("throttles refresh-token guessing", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post(`${API}/auth/refresh`)
        .set("X-Forwarded-For", ip)
        .send({ refreshToken: `guess-${i}`.padEnd(96, "0") });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 4)).toEqual([401, 401, 401, 401]);
    expect(statuses.slice(4)).toEqual([429, 429]);
  });

  it("throttles email-verification token guessing", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post(`${API}/auth/verify-email`)
        .set("X-Forwarded-For", ip)
        .send({ token: `t${i}` });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it("returns a JSON body and standard headers when throttled", async () => {
    const ip = nextIp();
    const email = uniqueEmail("headers");
    let res = await request(app)
      .post(`${API}/auth/login`)
      .set("X-Forwarded-For", ip)
      .send({ email, password: "Wr0ng-Password-1" });
    for (let i = 0; i < 5 && res.status !== 429; i++) {
      res = await request(app)
        .post(`${API}/auth/login`)
        .set("X-Forwarded-For", ip)
        .send({ email, password: "Wr0ng-Password-1" });
    }

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many requests/i);
    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
  });
});

describe("authenticated write endpoints", () => {
  it("throttles per user rather than per IP", async () => {
    const author = await signup(app);
    const other = await signup(app);
    const photographer = await publishedPhotographer(app);

    const openThread = (token: string) =>
      request(app)
        .post(`${API}/threads`)
        .set("Authorization", `Bearer ${token}`)
        .send({ photographerId: photographer.profileId });

    const mine: number[] = [];
    for (let i = 0; i < 5; i++) mine.push((await openThread(author.accessToken)).status);
    expect(mine).toContain(429);

    // A different user sharing the same IP still has their own budget.
    expect((await openThread(other.accessToken)).status).toBe(201);
  });
});
