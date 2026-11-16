import request from "supertest";
import type { Server } from "node:http";
import { startTestServer, stopTestServer } from "./helpers/server.js";
import { disconnectDb, prisma, resetDb } from "./helpers/db.js";
import {
  API,
  completeBooking,
  createBooking,
  publishedPhotographer,
  signup,
  type TestUser,
} from "./helpers/factories.js";

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

const postReview = (author: TestUser, body: Record<string, unknown>) =>
  request(app).post(`${API}/reviews`).set("Authorization", `Bearer ${author.accessToken}`).send(body);

describe("leaving a review", () => {
  it("accepts one review from the client of a completed booking", async () => {
    const bookingId = await completeBooking(app, client, photographer);
    await postReview(client, {
      photographerId: photographer.profileId,
      bookingId,
      rating: 5,
      body: "Fantastic shoot",
    }).expect(201);

    const review = await prisma.review.findFirstOrThrow();
    expect(review.authorId).toBe(client.id);
    expect(review.rating).toBe(5);
  });

  it("updates the photographer's cached rating aggregate", async () => {
    const secondClient = await signup(app);
    const first = await completeBooking(app, client, photographer);
    const second = await completeBooking(app, secondClient, photographer);

    await postReview(client, { photographerId: photographer.profileId, bookingId: first, rating: 5 }).expect(201);
    await postReview(secondClient, {
      photographerId: photographer.profileId,
      bookingId: second,
      rating: 4,
    }).expect(201);

    const profile = await prisma.photographerProfile.findUniqueOrThrow({
      where: { id: photographer.profileId },
    });
    expect(profile.ratingCount).toBe(2);
    expect(profile.ratingAvg).toBeCloseTo(4.5, 5);
  });

  it("notifies the photographer", async () => {
    const bookingId = await completeBooking(app, client, photographer);
    await postReview(client, { photographerId: photographer.profileId, bookingId, rating: 5 }).expect(201);
    const notifications = await prisma.notification.findMany({ where: { userId: photographer.id } });
    expect(notifications.map((n) => n.type)).toContain("NEW_REVIEW");
  });

  it("surfaces the review on the public profile", async () => {
    const bookingId = await completeBooking(app, client, photographer);
    await postReview(client, {
      photographerId: photographer.profileId,
      bookingId,
      rating: 4,
      body: "Great eye",
    }).expect(201);

    const res = await request(app).get(`${API}/photographers/${photographer.profileId}`).expect(200);
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].body).toBe("Great eye");
    expect(res.body.rating).toEqual({ average: 4, count: 1 });
  });
});

describe("review authorization", () => {
  it("forbids reviewing someone else's booking", async () => {
    const bookingId = await completeBooking(app, client, photographer);
    await postReview(outsider, {
      photographerId: photographer.profileId,
      bookingId,
      rating: 1,
    }).expect(403);
    expect(await prisma.review.count()).toBe(0);
  });

  it("forbids the photographer reviewing their own work", async () => {
    const bookingId = await completeBooking(app, client, photographer);
    await postReview(photographer, {
      photographerId: photographer.profileId,
      bookingId,
      rating: 5,
    }).expect(400);
  });

  it("refuses a review before the shoot is completed", async () => {
    const bookingId = await createBooking(app, client, photographer);
    await postReview(client, { photographerId: photographer.profileId, bookingId, rating: 5 }).expect(400);
  });

  it("refuses a review on a cancelled booking", async () => {
    const bookingId = await createBooking(app, client, photographer);
    await request(app)
      .patch(`${API}/bookings/${bookingId}/status`)
      .set("Authorization", `Bearer ${client.accessToken}`)
      .send({ status: "CANCELLED" })
      .expect(200);
    await postReview(client, { photographerId: photographer.profileId, bookingId, rating: 5 }).expect(400);
  });

  it("refuses a second review for the same booking", async () => {
    const bookingId = await completeBooking(app, client, photographer);
    await postReview(client, { photographerId: photographer.profileId, bookingId, rating: 5 }).expect(201);
    await postReview(client, { photographerId: photographer.profileId, bookingId, rating: 1 }).expect(400);
    expect(await prisma.review.count()).toBe(1);
  });

  it("refuses to point a booking's review at a different photographer", async () => {
    const other = await publishedPhotographer(app);
    const bookingId = await completeBooking(app, client, photographer);
    await postReview(client, { photographerId: other.profileId, bookingId, rating: 1 }).expect(400);

    const profile = await prisma.photographerProfile.findUniqueOrThrow({ where: { id: other.profileId } });
    expect(profile.ratingCount).toBe(0);
  });

  it("requires a booking id — free-floating reviews aren't accepted", async () => {
    await postReview(client, { photographerId: photographer.profileId, rating: 5 }).expect(400);
  });

  it("validates the rating range", async () => {
    const bookingId = await completeBooking(app, client, photographer);
    await postReview(client, { photographerId: photographer.profileId, bookingId, rating: 0 }).expect(400);
    await postReview(client, { photographerId: photographer.profileId, bookingId, rating: 6 }).expect(400);
    await postReview(client, { photographerId: photographer.profileId, bookingId, rating: 4.5 }).expect(400);
  });

  it("requires authentication", async () => {
    await request(app).post(`${API}/reviews`).send({}).expect(401);
  });
});
