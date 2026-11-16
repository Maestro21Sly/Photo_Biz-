import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { io as connect, type Socket } from "socket.io-client";
import type { Server as IOServer } from "socket.io";
import { createApp } from "../src/app.js";
import { createIo } from "../src/realtime.js";
import { signAccessToken } from "../src/lib/auth.js";
import { disconnectDb, resetDb } from "./helpers/db.js";
import { API, publishedPhotographer, signup, type TestUser } from "./helpers/factories.js";

let httpServer: HttpServer;
let io: IOServer;
let url: string;
const openSockets: Socket[] = [];

beforeAll(async () => {
  httpServer = createServer(createApp());
  io = createIo(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

beforeEach(resetDb);

afterEach(() => {
  while (openSockets.length) openSockets.pop()!.disconnect();
});

afterAll(async () => {
  io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await disconnectDb();
});

/** Connects a client and resolves once the handshake either succeeds or is refused. */
function connectSocket(token?: string): Promise<{ socket: Socket; error?: string }> {
  return new Promise((resolve) => {
    const socket = connect(url, {
      transports: ["websocket"],
      auth: token ? { token } : {},
      reconnection: false,
      forceNew: true,
    });
    openSockets.push(socket);
    socket.on("connect", () => resolve({ socket }));
    socket.on("connect_error", (err) => resolve({ socket, error: err.message }));
  });
}

const nextEvent = (socket: Socket, event: string, ms = 1500) =>
  new Promise<unknown | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

describe("socket handshake", () => {
  it("refuses a connection with no token", async () => {
    const { error } = await connectSocket();
    expect(error).toBe("unauthorized");
  });

  it("refuses a token signed with the wrong key", async () => {
    const jwt = await import("jsonwebtoken");
    const forged = jwt.default.sign({ sub: "someone", role: "ADMIN" }, "wrong-secret", {
      expiresIn: "15m",
      issuer: "snapcampus-api",
      audience: "snapcampus-app",
    });
    const { error } = await connectSocket(forged);
    expect(error).toBe("unauthorized");
  });

  it("refuses an expired token", async () => {
    const user = await signup(httpServer);
    const jwt = await import("jsonwebtoken");
    const { env } = await import("../src/env.js");
    const expired = jwt.default.sign({ sub: user.id, role: "STUDENT" }, env.jwtAccessSecret, {
      expiresIn: "-1s",
      issuer: "snapcampus-api",
      audience: "snapcampus-app",
    });
    const { error } = await connectSocket(expired);
    expect(error).toBe("unauthorized");
  });

  it("refuses a valid token for an account that no longer exists", async () => {
    // Signed by us, cryptographically fine, but the user was deleted — a plain
    // signature check would have handed out a live socket.
    const orphan = signAccessToken({ sub: "deleted-user-id", role: "STUDENT" });
    const { error } = await connectSocket(orphan);
    expect(error).toBe("unauthorized");
  });

  it("accepts a valid token", async () => {
    const user = await signup(httpServer);
    const { socket, error } = await connectSocket(user.accessToken);
    expect(error).toBeUndefined();
    expect(socket.connected).toBe(true);
  });
});

describe("room isolation", () => {
  let client: TestUser;
  let photographer: TestUser;
  let eavesdropper: TestUser;
  let threadId: string;

  beforeEach(async () => {
    client = await signup(httpServer);
    photographer = await publishedPhotographer(httpServer);
    eavesdropper = await signup(httpServer);

    const res = await request(httpServer)
      .post(`${API}/threads`)
      .set("Authorization", `Bearer ${client.accessToken}`)
      .send({ photographerId: photographer.profileId })
      .expect(201);
    threadId = res.body.id;
  });

  it("delivers a message to the recipient", async () => {
    const { socket } = await connectSocket(photographer.accessToken);
    const received = nextEvent(socket, "message");

    await request(httpServer)
      .post(`${API}/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${client.accessToken}`)
      .send({ body: "See you at 4" })
      .expect(201);

    expect(await received).toMatchObject({ threadId, body: "See you at 4", senderId: client.id });
  });

  it("does not deliver that message to anyone else", async () => {
    const { socket } = await connectSocket(eavesdropper.accessToken);
    const received = nextEvent(socket, "message");

    await request(httpServer)
      .post(`${API}/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${client.accessToken}`)
      .send({ body: "Private plans" })
      .expect(201);

    expect(await received).toBeNull();
  });

  it("gives a client no way to subscribe itself to another user's room", async () => {
    const { socket } = await connectSocket(eavesdropper.accessToken);
    const received = nextEvent(socket, "message");

    // The server registers no client-callable events, so these are inert. If a
    // join handler were ever added without a membership check, this would start
    // receiving the other conversation and fail.
    socket.emit("join", `user:${photographer.id}`);
    socket.emit("subscribe", { room: `user:${photographer.id}` });
    socket.emit("join", `thread:${threadId}`);
    await new Promise((r) => setTimeout(r, 100));

    await request(httpServer)
      .post(`${API}/threads/${threadId}/messages`)
      .set("Authorization", `Bearer ${client.accessToken}`)
      .send({ body: "Still private" })
      .expect(201);

    expect(await received).toBeNull();

    // The socket only ever belongs to its own user room.
    const rooms = [...(io.sockets.sockets.get(socket.id!)?.rooms ?? [])];
    expect(rooms.filter((r) => r.startsWith("user:"))).toEqual([`user:${eavesdropper.id}`]);
    expect(rooms).not.toContain(`user:${photographer.id}`);
  });
});
