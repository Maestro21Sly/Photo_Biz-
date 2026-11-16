import request from "supertest";
import type { Server } from "node:http";
import { startTestServer, stopTestServer } from "./helpers/server.js";
import { disconnectDb, prisma, resetDb } from "./helpers/db.js";
import { API, publishedPhotographer, signup } from "./helpers/factories.js";

let app: Server;

beforeAll(async () => {
  app = await startTestServer();
});

beforeEach(resetDb);
afterAll(async () => {
  await stopTestServer(app);
  await disconnectDb();
});

/** Seeds three published photographers with distinct ratings, prices, and pins. */
async function seedMarketplace() {
  const cheap = await publishedPhotographer(app, {
    campus: "State University",
    startingAt: 5000,
    ratingAvg: 3.2,
    ratingCount: 4,
    latitude: 40.0,
    longitude: -75.0,
  });
  const mid = await publishedPhotographer(app, {
    campus: "State University",
    startingAt: 9000,
    ratingAvg: 4.9,
    ratingCount: 30,
    isVerified: true,
    latitude: 40.3,
    longitude: -75.0,
  });
  const pricey = await publishedPhotographer(app, {
    campus: "Riverside College",
    startingAt: 20000,
    ratingAvg: 4.1,
    ratingCount: 9,
    latitude: 41.5,
    longitude: -75.0,
  });
  return { cheap, mid, pricey };
}

const ids = (body: { items: { id: string }[] }) => body.items.map((p) => p.id);

describe("sorting", () => {
  it("puts verified, highest-rated photographers first by default", async () => {
    const { mid } = await seedMarketplace();
    const res = await request(app).get(`${API}/photographers`).expect(200);
    expect(ids(res.body)[0]).toBe(mid.profileId);
  });

  it("sorts by price ascending", async () => {
    const { cheap, mid, pricey } = await seedMarketplace();
    const res = await request(app).get(`${API}/photographers?sort=price`).expect(200);
    expect(ids(res.body)).toEqual([cheap.profileId, mid.profileId, pricey.profileId]);
  });

  it("sorts newest first", async () => {
    const { pricey } = await seedMarketplace();
    const res = await request(app).get(`${API}/photographers?sort=new`).expect(200);
    expect(ids(res.body)[0]).toBe(pricey.profileId);
  });

  it("sorts by distance and reports it when a location is supplied", async () => {
    const { cheap, mid, pricey } = await seedMarketplace();
    const res = await request(app)
      .get(`${API}/photographers?sort=near&lat=40&lng=-75`)
      .expect(200);

    expect(ids(res.body)).toEqual([cheap.profileId, mid.profileId, pricey.profileId]);
    expect(res.body.items[0].distanceKm).toBe(0);
    expect(res.body.items[1].distanceKm).toBeGreaterThan(30);
  });

  it("restricts a near-me search to the requested radius", async () => {
    const { cheap } = await seedMarketplace();
    const res = await request(app)
      .get(`${API}/photographers?sort=near&lat=40&lng=-75&radiusKm=10`)
      .expect(200);
    expect(ids(res.body)).toEqual([cheap.profileId]);
  });

  it("omits distance when the caller gives no location", async () => {
    await seedMarketplace();
    const res = await request(app).get(`${API}/photographers`).expect(200);
    expect(res.body.items.every((p: { distanceKm: number | null }) => p.distanceKm === null)).toBe(true);
  });
});

describe("filtering", () => {
  it("filters by maximum price across both pricing fields", async () => {
    const { cheap, mid } = await seedMarketplace();
    const res = await request(app).get(`${API}/photographers?maxPrice=9000`).expect(200);
    expect(ids(res.body).sort()).toEqual([cheap.profileId, mid.profileId].sort());
  });

  it("filters by minimum rating", async () => {
    const { mid } = await seedMarketplace();
    const res = await request(app).get(`${API}/photographers?minRating=4.5`).expect(200);
    expect(ids(res.body)).toEqual([mid.profileId]);
  });

  it("filters by specialty", async () => {
    const { mid } = await seedMarketplace();
    await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", `Bearer ${mid.accessToken}`)
      .send({ specialties: ["Graduation"] })
      .expect(200);

    const res = await request(app).get(`${API}/photographers?specialty=graduation`).expect(200);
    expect(ids(res.body)).toEqual([mid.profileId]);
  });
});

describe("pagination", () => {
  it("pages with a cursor and stops at the end", async () => {
    for (let i = 0; i < 5; i++) await publishedPhotographer(app);

    const first = await request(app).get(`${API}/photographers?limit=2`).expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await request(app)
      .get(`${API}/photographers?limit=2&cursor=${first.body.nextCursor}`)
      .expect(200);
    expect(second.body.items).toHaveLength(2);
    expect(ids(second.body)).not.toEqual(expect.arrayContaining(ids(first.body)));

    const third = await request(app)
      .get(`${API}/photographers?limit=2&cursor=${second.body.nextCursor}`)
      .expect(200);
    expect(third.body.items).toHaveLength(1);
    expect(third.body.nextCursor).toBeNull();
  });
});

describe("specialties catalogue", () => {
  it("lists the specialties used by profiles", async () => {
    const photographer = await publishedPhotographer(app);
    await request(app)
      .put(`${API}/photographers/me`)
      .set("Authorization", `Bearer ${photographer.accessToken}`)
      .send({ specialties: ["Portraits", "Sports"] })
      .expect(200);

    const res = await request(app).get(`${API}/photographers/specialties`).expect(200);
    expect(res.body.items).toEqual(["Portraits", "Sports"]);
  });

  it("replaces the specialty set rather than accumulating it", async () => {
    const photographer = await publishedPhotographer(app);
    const put = (specialties: string[]) =>
      request(app)
        .put(`${API}/photographers/me`)
        .set("Authorization", `Bearer ${photographer.accessToken}`)
        .send({ specialties })
        .expect(200);

    await put(["Portraits", "Sports"]);
    const res = await put(["Events"]);
    expect(res.body.specialties).toEqual(["Events"]);

    const links = await prisma.photographerSpecialty.count({
      where: { photographerId: photographer.profileId },
    });
    expect(links).toBe(1);
  });
});

describe("own profile", () => {
  it("returns the caller's own profile including unpublished state", async () => {
    const draft = await signup(app, { role: "PHOTOGRAPHER" });
    const res = await request(app)
      .get(`${API}/photographers/me`)
      .set("Authorization", `Bearer ${draft.accessToken}`)
      .expect(200);
    expect(res.body.id).toBe(draft.profileId);
    expect(res.body.isPublished).toBe(false);
  });

  it("404s a profile id that doesn't exist", async () => {
    await request(app).get(`${API}/photographers/no-such-profile`).expect(404);
  });

  it("refuses a second verification request once verified", async () => {
    const photographer = await publishedPhotographer(app, { isVerified: true });
    await request(app)
      .post(`${API}/photographers/me/request-verification`)
      .set("Authorization", `Bearer ${photographer.accessToken}`)
      .expect(400);
  });
});
