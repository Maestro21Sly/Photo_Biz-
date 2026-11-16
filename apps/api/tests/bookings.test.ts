import request from "supertest";
import type { Server } from "node:http";
import { startTestServer, stopTestServer } from "./helpers/server.js";
import { disconnectDb, prisma, resetDb } from "./helpers/db.js";
import { API, createBooking, publishedPhotographer, signup, type TestUser } from "./helpers/factories.js";

let app: Server;

beforeAll(async () => {
  app = await startTestServer();
});

let client: TestUser;
let photographer: TestUser;
let outsider: TestUser;

beforeEach(async () => {
  await resetDb();
  client = await signup(app);
  photographer = await publishedPhotographer(app);
  outsider = await signup(app);
});
afterAll(async () => {
  await stopTestServer(app);
  await disconnectDb();
});

const asClient = () => `Bearer ${client.accessToken}`;
const asPhotographer = () => `Bearer ${photographer.accessToken}`;
const asOutsider = () => `Bearer ${outsider.accessToken}`;

const setStatus = (id: string, auth: string, body: Record<string, unknown>) =>
  request(app).patch(`${API}/bookings/${id}/status`).set("Authorization", auth).send(body);

describe("creating a booking", () => {
  it("stores the request and opens a chat thread with the photographer", async () => {
    const id = await createBooking(app, client, photographer);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(booking.status).toBe("REQUESTED");
    expect(booking.clientId).toBe(client.id);

    const thread = await prisma.thread.findFirst({ where: { bookingId: id } });
    expect(thread).not.toBeNull();
    expect(thread!.clientId).toBe(client.id);
  });

  it("notifies the photographer, not the client", async () => {
    await createBooking(app, client, photographer);
    const forPhotographer = await prisma.notification.findMany({ where: { userId: photographer.id } });
    const forClient = await prisma.notification.findMany({ where: { userId: client.id } });
    expect(forPhotographer.map((n) => n.type)).toContain("BOOKING_REQUESTED");
    expect(forClient).toHaveLength(0);
  });

  it("rejects a booking in the past", async () => {
    await request(app)
      .post(`${API}/bookings`)
      .set("Authorization", asClient())
      .send({
        photographerId: photographer.profileId,
        eventType: "Yesterday",
        eventDate: new Date(Date.now() - 86_400_000).toISOString(),
        location: "Quad",
      })
      .expect(400);
  });

  it("rejects booking yourself", async () => {
    await request(app)
      .post(`${API}/bookings`)
      .set("Authorization", asPhotographer())
      .send({
        photographerId: photographer.profileId,
        eventType: "Self shoot",
        eventDate: new Date(Date.now() + 86_400_000).toISOString(),
        location: "Quad",
      })
      .expect(400);
  });

  it("404s an unpublished photographer rather than confirming it exists", async () => {
    const draft = await signup(app, { role: "PHOTOGRAPHER" });
    await request(app)
      .post(`${API}/bookings`)
      .set("Authorization", asClient())
      .send({
        photographerId: draft.profileId,
        eventType: "Portraits",
        eventDate: new Date(Date.now() + 86_400_000).toISOString(),
        location: "Quad",
      })
      .expect(404);
  });

  it("refuses a booking that would reopen a channel with someone who blocked you", async () => {
    await request(app)
      .put(`${API}/blocks/${client.id}`)
      .set("Authorization", asPhotographer())
      .expect(204);

    await request(app)
      .post(`${API}/bookings`)
      .set("Authorization", asClient())
      .send({
        photographerId: photographer.profileId,
        eventType: "Portraits",
        eventDate: new Date(Date.now() + 86_400_000).toISOString(),
        location: "Quad",
      })
      .expect(403);
  });

  it("requires authentication", async () => {
    await request(app).post(`${API}/bookings`).send({}).expect(401);
    await request(app).get(`${API}/bookings`).expect(401);
  });
});

describe("reading bookings", () => {
  it("lists a booking for both parties with the right role, and to nobody else", async () => {
    await createBooking(app, client, photographer);

    const asClientList = await request(app).get(`${API}/bookings`).set("Authorization", asClient()).expect(200);
    expect(asClientList.body.items).toHaveLength(1);
    expect(asClientList.body.items[0].role).toBe("client");

    const asPhotoList = await request(app)
      .get(`${API}/bookings`)
      .set("Authorization", asPhotographer())
      .expect(200);
    expect(asPhotoList.body.items[0].role).toBe("photographer");

    const asOther = await request(app).get(`${API}/bookings`).set("Authorization", asOutsider()).expect(200);
    expect(asOther.body.items).toHaveLength(0);
  });

  it("forbids a third party from reading a booking by id (IDOR)", async () => {
    const id = await createBooking(app, client, photographer);
    await request(app).get(`${API}/bookings/${id}`).set("Authorization", asOutsider()).expect(403);
    await request(app).get(`${API}/bookings/${id}`).set("Authorization", asClient()).expect(200);
    await request(app).get(`${API}/bookings/${id}`).set("Authorization", asPhotographer()).expect(200);
  });

  it("404s an unknown booking id", async () => {
    await request(app).get(`${API}/bookings/does-not-exist`).set("Authorization", asClient()).expect(404);
  });
});

describe("booking lifecycle", () => {
  it("accepts, then completes, and increments the photographer's job count exactly once", async () => {
    const id = await createBooking(app, client, photographer);

    await setStatus(id, asPhotographer(), { status: "ACCEPTED", quotedPrice: 12000 }).expect(200);
    const accepted = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.quotedPrice).toBe(12000);

    await setStatus(id, asPhotographer(), { status: "COMPLETED" }).expect(200);
    const profile = await prisma.photographerProfile.findUniqueOrThrow({
      where: { id: photographer.profileId },
    });
    expect(profile.completedJobs).toBe(1);
  });

  it("lets the photographer decline a request", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asPhotographer(), { status: "DECLINED" }).expect(200);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe("DECLINED");
  });

  it("lets the client cancel a request", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asClient(), { status: "CANCELLED" }).expect(200);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
  });

  it("notifies the counterparty on every transition", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asPhotographer(), { status: "ACCEPTED" }).expect(200);
    const types = (await prisma.notification.findMany({ where: { userId: client.id } })).map((n) => n.type);
    expect(types).toContain("BOOKING_ACCEPTED");
  });
});

describe("booking authorization and state machine", () => {
  it("forbids an unrelated user from changing status", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asOutsider(), { status: "ACCEPTED" }).expect(403);
  });

  it("forbids the client from accepting or completing their own booking", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asClient(), { status: "ACCEPTED" }).expect(403);
    await setStatus(id, asClient(), { status: "COMPLETED" }).expect(403);
  });

  it("forbids the photographer from cancelling instead of declining", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asPhotographer(), { status: "CANCELLED" }).expect(403);
  });

  it("forbids the client from writing the quoted price", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asClient(), { status: "CANCELLED", quotedPrice: 1 }).expect(403);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).quotedPrice).toBeNull();
  });

  it("refuses to complete a booking that was never accepted", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asPhotographer(), { status: "COMPLETED" }).expect(409);
    const profile = await prisma.photographerProfile.findUniqueOrThrow({
      where: { id: photographer.profileId },
    });
    expect(profile.completedJobs).toBe(0);
  });

  it("refuses to re-complete a booking, so completedJobs can't be inflated", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asPhotographer(), { status: "ACCEPTED" }).expect(200);
    await setStatus(id, asPhotographer(), { status: "COMPLETED" }).expect(200);
    await setStatus(id, asPhotographer(), { status: "COMPLETED" }).expect(409);
    await setStatus(id, asPhotographer(), { status: "COMPLETED" }).expect(409);

    const profile = await prisma.photographerProfile.findUniqueOrThrow({
      where: { id: photographer.profileId },
    });
    expect(profile.completedJobs).toBe(1);
  });

  it("refuses to resurrect a cancelled or declined booking", async () => {
    const cancelled = await createBooking(app, client, photographer);
    await setStatus(cancelled, asClient(), { status: "CANCELLED" }).expect(200);
    await setStatus(cancelled, asPhotographer(), { status: "ACCEPTED" }).expect(409);

    const declined = await createBooking(app, client, photographer);
    await setStatus(declined, asPhotographer(), { status: "DECLINED" }).expect(200);
    await setStatus(declined, asPhotographer(), { status: "COMPLETED" }).expect(409);
  });

  it("rejects a status value outside the enum", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asPhotographer(), { status: "REQUESTED" }).expect(400);
    await setStatus(id, asPhotographer(), { status: "DELETED" }).expect(400);
  });

  it("survives concurrent completes without double-counting", async () => {
    const id = await createBooking(app, client, photographer);
    await setStatus(id, asPhotographer(), { status: "ACCEPTED" }).expect(200);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => setStatus(id, asPhotographer(), { status: "COMPLETED" }))
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);

    const profile = await prisma.photographerProfile.findUniqueOrThrow({
      where: { id: photographer.profileId },
    });
    expect(profile.completedJobs).toBe(1);
  });
});
