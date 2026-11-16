import request from "supertest";
import type { Server } from "node:http";
import { startTestServer, stopTestServer } from "./helpers/server.js";
import { disconnectDb, prisma, resetDb } from "./helpers/db.js";
import { API, makeAdmin, publishedPhotographer, signup, type TestUser } from "./helpers/factories.js";

let app: Server;

beforeAll(async () => {
  app = await startTestServer();
});

let student: TestUser;
let photographer: TestUser;

beforeEach(async () => {
  await resetDb();
  student = await signup(app);
  photographer = await publishedPhotographer(app, { headline: "Campus portraits", startingAt: 8000 });
});
afterAll(async () => {
  await stopTestServer(app);
  await disconnectDb();
});

const auth = (u: TestUser) => `Bearer ${u.accessToken}`;

describe("discovery", () => {
  it("lists published photographers to anonymous callers", async () => {
    const res = await request(app).get(`${API}/photographers`).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(photographer.profileId);
  });

  it("hides unpublished profiles from search and from direct fetch by strangers", async () => {
    const draft = await signup(app, { role: "PHOTOGRAPHER" });

    const list = await request(app).get(`${API}/photographers`).expect(200);
    expect(list.body.items.map((p: { id: string }) => p.id)).not.toContain(draft.profileId);

    await request(app).get(`${API}/photographers/${draft.profileId}`).expect(404);
    await request(app)
      .get(`${API}/photographers/${draft.profileId}`)
      .set("Authorization", auth(student))
      .expect(404);

    // ...but the owner can still see their own draft.
    await request(app)
      .get(`${API}/photographers/${draft.profileId}`)
      .set("Authorization", auth(draft))
      .expect(200);
  });

  it("filters by campus and free-text query", async () => {
    await publishedPhotographer(app, { campus: "Riverside College", headline: "Weddings" });

    const byCampus = await request(app).get(`${API}/photographers?campus=Riverside`).expect(200);
    expect(byCampus.body.items).toHaveLength(1);

    const byText = await request(app).get(`${API}/photographers?q=Weddings`).expect(200);
    expect(byText.body.items).toHaveLength(1);
  });

  it("hides photographers involved in a block with the viewer", async () => {
    await request(app).put(`${API}/blocks/${photographer.id}`).set("Authorization", auth(student)).expect(204);
    const res = await request(app).get(`${API}/photographers`).set("Authorization", auth(student)).expect(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("rejects out-of-range pagination and filter values", async () => {
    await request(app).get(`${API}/photographers?limit=500`).expect(400);
    await request(app).get(`${API}/photographers?minRating=9`).expect(400);
    await request(app).get(`${API}/photographers?lat=200&lng=0`).expect(400);
  });

  it("marks favourites for the signed-in viewer only", async () => {
    await request(app)
      .put(`${API}/favorites/${photographer.profileId}`)
      .set("Authorization", auth(student))
      .expect(204);

    const signedIn = await request(app)
      .get(`${API}/photographers`)
      .set("Authorization", auth(student))
      .expect(200);
    expect(signedIn.body.items[0].isFavorite).toBe(true);

    const anonymous = await request(app).get(`${API}/photographers`).expect(200);
    expect(anonymous.body.items[0].isFavorite).toBe(false);
  });
});

describe("profile editing (RBAC)", () => {
  it("lets a photographer edit their own profile", async () => {
    const res = await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", auth(photographer))
      .send({ headline: "Golden hour specialist", specialties: ["Portraits", "Events"] })
      .expect(200);

    expect(res.body.headline).toBe("Golden hour specialist");
    expect(res.body.specialties.sort()).toEqual(["Events", "Portraits"]);
  });

  it("denies students the photographer-only endpoints", async () => {
    await request(app).get(`${API}/photographers/me`).set("Authorization", auth(student)).expect(403);
    await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", auth(student))
      .send({ headline: "Not mine" })
      .expect(403);
    await request(app)
      .post(`${API}/photographers/me/request-verification`)
      .set("Authorization", auth(student))
      .expect(403);
  });

  it("has no route to edit another photographer's profile", async () => {
    const other = await publishedPhotographer(app);
    await request(app)
      .put(`${API}/photographers/${other.profileId}`)
      .set("Authorization", auth(photographer))
      .send({ headline: "Hijacked" })
      .expect(404);

    const untouched = await prisma.photographerProfile.findUniqueOrThrow({ where: { id: other.profileId } });
    expect(untouched.headline).not.toBe("Hijacked");
  });

  it("rejects profile links with a non-http scheme", async () => {
    for (const portfolioUrl of [
      "javascript:alert(document.cookie)",
      "data:text/html,<script>1</script>",
      "file:///etc/passwd",
      "not-a-url",
    ]) {
      await request(app)
        .put(`${API}/photographers/me`)
        .set("Authorization", auth(photographer))
        .send({ portfolioUrl })
        .expect(400);
    }

    await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", auth(photographer))
      .send({ portfolioUrl: "https://example.test/work", instagram: "https://instagram.com/someone" })
      .expect(200);
  });

  it("clears a link when the app sends an empty string", async () => {
    await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", auth(photographer))
      .send({ portfolioUrl: "https://example.test/work" })
      .expect(200);
    const res = await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", auth(photographer))
      .send({ portfolioUrl: "" })
      .expect(200);
    expect(res.body.portfolioUrl).toBeNull();
  });

  it("validates pricing and geo bounds", async () => {
    await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", auth(photographer))
      .send({ hourlyRate: -1 })
      .expect(400);
    await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", auth(photographer))
      .send({ latitude: 91 })
      .expect(400);
    await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", auth(photographer))
      .send({ specialties: Array.from({ length: 13 }, (_, i) => `s${i}`) })
      .expect(400);
  });
});

describe("verification (admin-only)", () => {
  it("moves a self-request to PENDING but never to VERIFIED", async () => {
    await request(app)
      .post(`${API}/photographers/me/request-verification`)
      .set("Authorization", auth(photographer))
      .expect(200);

    const profile = await prisma.photographerProfile.findUniqueOrThrow({
      where: { id: photographer.profileId },
    });
    expect(profile.verificationStatus).toBe("PENDING");
    expect(profile.isVerified).toBe(false);
  });

  it("denies non-admins the verify endpoint", async () => {
    await request(app)
      .patch(`${API}/photographers/${photographer.profileId}/verify`)
      .set("Authorization", auth(photographer))
      .send({ approve: true })
      .expect(403);
    await request(app)
      .patch(`${API}/photographers/${photographer.profileId}/verify`)
      .set("Authorization", auth(student))
      .send({ approve: true })
      .expect(403);
    await request(app)
      .patch(`${API}/photographers/${photographer.profileId}/verify`)
      .send({ approve: true })
      .expect(401);

    const profile = await prisma.photographerProfile.findUniqueOrThrow({
      where: { id: photographer.profileId },
    });
    expect(profile.isVerified).toBe(false);
  });

  it("lets an admin approve and revoke", async () => {
    const admin = await makeAdmin(app, await signup(app));

    await request(app)
      .patch(`${API}/photographers/${photographer.profileId}/verify`)
      .set("Authorization", auth(admin))
      .send({ approve: true })
      .expect(200);
    expect(
      (await prisma.photographerProfile.findUniqueOrThrow({ where: { id: photographer.profileId } })).isVerified
    ).toBe(true);

    await request(app)
      .patch(`${API}/photographers/${photographer.profileId}/verify`)
      .set("Authorization", auth(admin))
      .send({ approve: false })
      .expect(200);
    expect(
      (await prisma.photographerProfile.findUniqueOrThrow({ where: { id: photographer.profileId } }))
        .verificationStatus
    ).toBe("REJECTED");
  });

  it("does not honour a role claim that only exists in the client's token request", async () => {
    // The role in the JWT is signed by us at login; a student who simply asks
    // for ADMIN at signup stays a student (covered in auth.test.ts) and so is
    // still refused here after a fresh login.
    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: student.email, password: student.password })
      .expect(200);
    await request(app)
      .patch(`${API}/photographers/${photographer.profileId}/verify`)
      .set("Authorization", `Bearer ${res.body.accessToken}`)
      .send({ approve: true })
      .expect(403);
  });
});

describe("favorites", () => {
  it("saves, lists, and removes", async () => {
    await request(app)
      .put(`${API}/favorites/${photographer.profileId}`)
      .set("Authorization", auth(student))
      .expect(204);
    // Idempotent.
    await request(app)
      .put(`${API}/favorites/${photographer.profileId}`)
      .set("Authorization", auth(student))
      .expect(204);

    const list = await request(app).get(`${API}/favorites`).set("Authorization", auth(student)).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].isFavorite).toBe(true);

    await request(app)
      .delete(`${API}/favorites/${photographer.profileId}`)
      .set("Authorization", auth(student))
      .expect(204);
    const after = await request(app).get(`${API}/favorites`).set("Authorization", auth(student)).expect(200);
    expect(after.body.items).toHaveLength(0);
  });

  it("404s an unknown or unpublished photographer instead of failing on the foreign key", async () => {
    await request(app).put(`${API}/favorites/nope`).set("Authorization", auth(student)).expect(404);

    const draft = await signup(app, { role: "PHOTOGRAPHER" });
    await request(app).put(`${API}/favorites/${draft.profileId}`).set("Authorization", auth(student)).expect(404);
  });

  it("keeps one user's favourites out of another's list", async () => {
    const other = await signup(app);
    await request(app)
      .put(`${API}/favorites/${photographer.profileId}`)
      .set("Authorization", auth(student))
      .expect(204);

    const theirs = await request(app).get(`${API}/favorites`).set("Authorization", auth(other)).expect(200);
    expect(theirs.body.items).toHaveLength(0);

    // Deleting by id only ever touches your own row.
    await request(app)
      .delete(`${API}/favorites/${photographer.profileId}`)
      .set("Authorization", auth(other))
      .expect(204);
    const mine = await request(app).get(`${API}/favorites`).set("Authorization", auth(student)).expect(200);
    expect(mine.body.items).toHaveLength(1);
  });

  it("requires authentication", async () => {
    await request(app).get(`${API}/favorites`).expect(401);
    await request(app).put(`${API}/favorites/${photographer.profileId}`).expect(401);
  });
});

describe("notifications", () => {
  it("only ever returns and marks the caller's own notifications", async () => {
    await prisma.notification.createMany({
      data: [
        { userId: student.id, type: "SYSTEM", title: "Mine" },
        { userId: photographer.id, type: "SYSTEM", title: "Theirs" },
      ],
    });

    const list = await request(app).get(`${API}/notifications`).set("Authorization", auth(student)).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.unread).toBe(1);

    const theirs = await prisma.notification.findFirstOrThrow({ where: { userId: photographer.id } });
    await request(app)
      .post(`${API}/notifications/read`)
      .set("Authorization", auth(student))
      .send({ ids: [theirs.id] })
      .expect(204);

    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
  });

  it("rejects an unbounded id list", async () => {
    await request(app)
      .post(`${API}/notifications/read`)
      .set("Authorization", auth(student))
      .send({ ids: Array.from({ length: 201 }, (_, i) => `id-${i}`) })
      .expect(400);
  });
});
