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
let threadId: string;

beforeEach(async () => {
  await resetDb();
  client = await signup(app);
  photographer = await publishedPhotographer(app);
  outsider = await signup(app);

  const res = await request(app)
    .post(`${API}/threads`)
    .set("Authorization", `Bearer ${client.accessToken}`)
    .send({ photographerId: photographer.profileId })
    .expect(201);
  threadId = res.body.id;
});
afterAll(async () => {
  await stopTestServer(app);
  await disconnectDb();
});

const auth = (u: TestUser) => `Bearer ${u.accessToken}`;
const send = (id: string, u: TestUser, body: string) =>
  request(app).post(`${API}/threads/${id}/messages`).set("Authorization", auth(u)).send({ body });
const read = (id: string, u: TestUser) =>
  request(app).get(`${API}/threads/${id}/messages`).set("Authorization", auth(u));

describe("opening threads", () => {
  it("reuses the same thread instead of creating duplicates", async () => {
    const again = await request(app)
      .post(`${API}/threads`)
      .set("Authorization", auth(client))
      .send({ photographerId: photographer.profileId })
      .expect(201);
    expect(again.body.id).toBe(threadId);
    expect(await prisma.thread.count()).toBe(1);
  });

  it("refuses a thread with yourself", async () => {
    await request(app)
      .post(`${API}/threads`)
      .set("Authorization", auth(photographer))
      .send({ photographerId: photographer.profileId })
      .expect(403);
  });

  it("404s an unknown or unpublished photographer", async () => {
    await request(app)
      .post(`${API}/threads`)
      .set("Authorization", auth(client))
      .send({ photographerId: "nope" })
      .expect(404);

    const draft = await signup(app, { role: "PHOTOGRAPHER" });
    await request(app)
      .post(`${API}/threads`)
      .set("Authorization", auth(client))
      .send({ photographerId: draft.profileId })
      .expect(404);
  });
});

describe("message authorization", () => {
  it("lets both participants read and write", async () => {
    await send(threadId, client, "Hi, are you free Saturday?").expect(201);
    await send(threadId, photographer, "Yes — what time?").expect(201);

    const asClient = await read(threadId, client).expect(200);
    expect(asClient.body.items).toHaveLength(2);
    expect(asClient.body.items[0].mine).toBe(true);
    expect(asClient.body.items[1].mine).toBe(false);
  });

  it("forbids a non-participant from reading the conversation", async () => {
    await send(threadId, client, "Private plans").expect(201);
    const res = await read(threadId, outsider).expect(403);
    expect(JSON.stringify(res.body)).not.toContain("Private plans");
  });

  it("forbids a non-participant from posting into the conversation", async () => {
    await send(threadId, outsider, "I should not be here").expect(403);
    expect(await prisma.message.count({ where: { threadId } })).toBe(0);
  });

  it("does not leak other people's threads in the list", async () => {
    await send(threadId, client, "hello").expect(201);
    const res = await request(app).get(`${API}/threads`).set("Authorization", auth(outsider)).expect(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("404s an unknown thread id rather than 403, for both read and write", async () => {
    await read("no-such-thread", client).expect(404);
    await send("no-such-thread", client, "hi").expect(404);
  });

  it("requires authentication", async () => {
    await request(app).get(`${API}/threads`).expect(401);
    await request(app).get(`${API}/threads/${threadId}/messages`).expect(401);
    await request(app).post(`${API}/threads/${threadId}/messages`).send({ body: "hi" }).expect(401);
  });
});

describe("message content and read state", () => {
  it("rejects an empty or oversized body", async () => {
    await send(threadId, client, "").expect(400);
    await send(threadId, client, "x".repeat(2001)).expect(400);
  });

  it("marks the counterparty's messages read on fetch, and not your own", async () => {
    await send(threadId, client, "one").expect(201);
    await send(threadId, photographer, "two").expect(201);

    await read(threadId, client).expect(200);

    const fromPhotographer = await prisma.message.findFirstOrThrow({ where: { senderId: photographer.id } });
    const fromClient = await prisma.message.findFirstOrThrow({ where: { senderId: client.id } });
    expect(fromPhotographer.readAt).not.toBeNull();
    expect(fromClient.readAt).toBeNull();
  });

  it("reports unread counts per participant", async () => {
    await send(threadId, photographer, "ping").expect(201);
    const res = await request(app).get(`${API}/threads`).set("Authorization", auth(client)).expect(200);
    expect(res.body.items[0].unread).toBe(1);
    expect(res.body.items[0].lastMessage.body).toBe("ping");
  });

  it("notifies the recipient of a new message", async () => {
    await send(threadId, client, "hello there").expect(201);
    const notifications = await prisma.notification.findMany({ where: { userId: photographer.id } });
    expect(notifications.map((n) => n.type)).toContain("NEW_MESSAGE");
  });
});

describe("blocking", () => {
  it("stops the blocked user from sending further messages", async () => {
    await send(threadId, client, "hi").expect(201);
    await request(app).put(`${API}/blocks/${client.id}`).set("Authorization", auth(photographer)).expect(204);

    await send(threadId, client, "still here").expect(403);
    expect(await prisma.message.count({ where: { threadId } })).toBe(1);
  });

  it("is symmetrical — the blocker can't message the blocked user either", async () => {
    await request(app).put(`${API}/blocks/${client.id}`).set("Authorization", auth(photographer)).expect(204);
    await send(threadId, photographer, "one more thing").expect(403);
  });

  it("lifts the restriction on unblock", async () => {
    await request(app).put(`${API}/blocks/${client.id}`).set("Authorization", auth(photographer)).expect(204);
    await send(threadId, client, "blocked").expect(403);
    await request(app)
      .delete(`${API}/blocks/${client.id}`)
      .set("Authorization", auth(photographer))
      .expect(204);
    await send(threadId, client, "unblocked").expect(201);
  });

  it("refuses to block yourself or an unknown user", async () => {
    await request(app).put(`${API}/blocks/${client.id}`).set("Authorization", auth(client)).expect(400);
    await request(app).put(`${API}/blocks/nobody`).set("Authorization", auth(client)).expect(404);
  });

  it("only lists your own blocks", async () => {
    await request(app).put(`${API}/blocks/${client.id}`).set("Authorization", auth(photographer)).expect(204);
    const mine = await request(app).get(`${API}/blocks`).set("Authorization", auth(photographer)).expect(200);
    const theirs = await request(app).get(`${API}/blocks`).set("Authorization", auth(client)).expect(200);
    expect(mine.body.items).toEqual([client.id]);
    expect(theirs.body.items).toEqual([]);
  });
});

describe("reports", () => {
  it("files a report against another user", async () => {
    await request(app)
      .post(`${API}/reports`)
      .set("Authorization", auth(client))
      .send({ targetUserId: photographer.id, reason: "SPAM", note: "Unsolicited messages", threadId })
      .expect(201);

    const report = await prisma.report.findFirstOrThrow();
    expect(report.reporterId).toBe(client.id);
    expect(report.targetUserId).toBe(photographer.id);
  });

  it("refuses to attach a conversation the reporter isn't part of", async () => {
    await request(app)
      .post(`${API}/reports`)
      .set("Authorization", auth(outsider))
      .send({ targetUserId: photographer.id, reason: "SPAM", threadId })
      .expect(403);
    expect(await prisma.report.count()).toBe(0);
  });

  it("refuses self-reports and unknown targets", async () => {
    await request(app)
      .post(`${API}/reports`)
      .set("Authorization", auth(client))
      .send({ targetUserId: client.id, reason: "OTHER" })
      .expect(400);
    await request(app)
      .post(`${API}/reports`)
      .set("Authorization", auth(client))
      .send({ targetUserId: "ghost", reason: "OTHER" })
      .expect(404);
  });
});

describe("booking-linked threads", () => {
  it("attaches the booking's thread so both parties can find it", async () => {
    const bookingId = await createBooking(app, client, photographer);
    const res = await request(app)
      .get(`${API}/bookings/${bookingId}`)
      .set("Authorization", auth(photographer))
      .expect(200);
    expect(res.body.threadId).toBe(threadId);
  });
});
