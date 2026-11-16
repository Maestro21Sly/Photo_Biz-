import type { Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { corsOptions } from "./cors.js";
import { prisma } from "./db.js";
import { verifyAccessToken } from "./lib/auth.js";

let io: IOServer | null = null;

export function setIo(server: IOServer): void {
  io = server;
}

/** Emit an event to a specific user's room (rooms are keyed by user id). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

/**
 * Authenticated Socket.IO server.
 *
 * Room membership is decided entirely server-side: the only room a socket ever
 * enters is `user:<its own id>`, and no client-callable event is registered, so
 * there is no path for a client to subscribe itself to another user's stream.
 * Any inbound event is therefore either a client bug or probing, and is ignored.
 */
export function createIo(httpServer: HttpServer): IOServer {
  const server = new IOServer(httpServer, {
    cors: {
      origin: corsOptions.origin as string | string[],
      credentials: Boolean(corsOptions.credentials),
    },
    // Clients never send us payloads; a small cap removes the memory-exhaustion
    // vector that the 1 MB default leaves open on an unauthenticated handshake.
    maxHttpBufferSize: 8 * 1024,
  });

  server.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized"));
    try {
      const payload = verifyAccessToken(token);
      // A deleted account's JWT stays cryptographically valid until it expires;
      // check the account still exists before granting a long-lived socket.
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true },
      });
      if (!user) return next(new Error("unauthorized"));
      socket.data.userId = payload.sub;
      socket.data.tokenExp = payload.exp ?? 0;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  server.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    // Without this a socket authenticated once keeps streaming another user's
    // notifications forever — long after the 15-minute access token expired and
    // long after a password change was supposed to end the session.
    const expiresInMs = (socket.data.tokenExp as number) * 1000 - Date.now();
    if (expiresInMs > 0) {
      const timer = setTimeout(() => socket.disconnect(true), expiresInMs);
      socket.on("disconnect", () => clearTimeout(timer));
    } else {
      socket.disconnect(true);
    }
  });

  setIo(server);
  return server;
}
