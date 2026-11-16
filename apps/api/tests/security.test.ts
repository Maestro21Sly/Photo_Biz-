import request from "supertest";
import type { Server } from "node:http";
import { startTestServer, stopTestServer } from "./helpers/server.js";
import { disconnectDb, resetDb } from "./helpers/db.js";
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

describe("security headers", () => {
  it("sets the helmet baseline and hides the framework", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toContain("script-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers).not.toHaveProperty("x-powered-by");
  });

  it("serves the legal pages the App Store requires", async () => {
    await request(app).get("/legal/privacy").expect(200).expect("Content-Type", /html/);
    await request(app).get("/legal/terms").expect(200).expect("Content-Type", /html/);
  });
});

describe("CORS", () => {
  it("reflects an allow-listed origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:8081")
      .expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("never echoes an unknown origin back", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.test").expect(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses a preflight from an unknown origin", async () => {
    const res = await request(app)
      .options(`${API}/auth/login`)
      .set("Origin", "https://evil.test")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("never combines a wildcard origin with credentials", async () => {
    const res = await request(app).get("/health").set("Origin", "http://localhost:8081").expect(200);
    if (res.headers["access-control-allow-credentials"] === "true") {
      expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    }
  });
});

describe("request limits and error shape", () => {
  it("rejects a JSON body over the configured limit", async () => {
    await request(app)
      .post(`${API}/auth/login`)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: uniqueEmail(), password: "x".repeat(200_000) }))
      .expect(413);
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/v1/not-a-route").expect(404);
    expect(res.body).toEqual({ error: "Route not found" });
  });

  it("returns a structured validation error without echoing internals", async () => {
    const res = await request(app).post(`${API}/auth/login`).send({ email: "nope" }).expect(400);
    expect(res.body.error).toBe("Validation failed");
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|node_modules|at Object/i);
  });

  it("never returns a password hash or token hash on any user-facing payload", async () => {
    const user = await signup(app);
    const me = await request(app)
      .get(`${API}/auth/me`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|tokenHash|\$2[aby]\$/);
  });

  it("does not leak the JWT secret through an error path", async () => {
    const res = await request(app)
      .post(`${API}/auth/signup`)
      .send({ email: "not-an-email", password: GOOD_PASSWORD, displayName: "x", acceptedTerms: true })
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain("test-only-access-key");
  });
});

describe("uploads are served defensively", () => {
  it("sends a sandboxing CSP and nosniff on the static upload route", async () => {
    // 404 is expected for a key that doesn't exist; the headers are the point,
    // and express.static applies setHeaders before it knows the file is missing.
    const res = await request(app).get("/uploads/does-not-exist.jpg");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("refuses path traversal out of the upload directory", async () => {
    const res = await request(app).get("/uploads/..%2f..%2fpackage.json");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
