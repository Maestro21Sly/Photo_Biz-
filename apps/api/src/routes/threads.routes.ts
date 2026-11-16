import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/ratelimit.js";
import { forbidden, notFound } from "../lib/errors.js";
import { notify } from "../lib/notify.js";
import { emitToUser } from "../realtime.js";
import { blockedUserIds } from "./safety.routes.js";

export const threadsRouter = Router();

threadsRouter.use(authenticate);

/** Returns the two user ids participating in a thread. */
async function threadParticipants(threadId: string) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: { photographer: { select: { userId: true } } },
  });
  if (!thread) return null;
  return { thread, clientUserId: thread.clientId, photographerUserId: thread.photographer.userId };
}

// GET /threads — conversation list with last message + unread count.
threadsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });

    const threads = await prisma.thread.findMany({
      where: {
        OR: [{ clientId: req.user!.id }, ...(profile ? [{ photographerId: profile.id }] : [])],
      },
      orderBy: { lastMessageAt: "desc" },
      include: {
        client: { select: { id: true, displayName: true, avatarUrl: true } },
        photographer: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const items = await Promise.all(
      threads.map(async (t) => {
        const meIsClient = t.clientId === req.user!.id;
        const other = meIsClient
          ? { name: t.photographer.user.displayName, avatarUrl: t.photographer.user.avatarUrl }
          : { name: t.client.displayName, avatarUrl: t.client.avatarUrl };
        const unread = await prisma.message.count({
          where: { threadId: t.id, readAt: null, senderId: { not: req.user!.id } },
        });
        return {
          id: t.id,
          photographerId: t.photographerId,
          other,
          lastMessage: t.messages[0]
            ? { body: t.messages[0].body, createdAt: t.messages[0].createdAt }
            : null,
          unread,
          lastMessageAt: t.lastMessageAt,
        };
      })
    );

    res.json({ items });
  })
);

// POST /threads — open (or reuse) a thread with a photographer.
threadsRouter.post(
  "/",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { photographerId } = z.object({ photographerId: z.string().min(1).max(64) }).parse(req.body);
    const photographer = await prisma.photographerProfile.findUnique({
      where: { id: photographerId },
      select: { id: true, userId: true, isPublished: true },
    });
    if (!photographer || !photographer.isPublished) throw notFound("Photographer not found");
    if (photographer.userId === req.user!.id) throw forbidden("You can't message yourself");
    if ((await blockedUserIds(req.user!.id)).has(photographer.userId)) {
      throw forbidden("You can't message this user");
    }

    const thread = await prisma.thread.upsert({
      where: { clientId_photographerId: { clientId: req.user!.id, photographerId } },
      update: {},
      create: { clientId: req.user!.id, photographerId },
    });
    res.status(201).json({ id: thread.id });
  })
);

// GET /threads/:id/messages — message history (also marks incoming as read).
threadsRouter.get(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const info = await threadParticipants(req.params.id);
    if (!info) throw notFound("Conversation not found");
    if (![info.clientUserId, info.photographerUserId].includes(req.user!.id)) throw forbidden();

    const messages = await prisma.message.findMany({
      where: { threadId: req.params.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    await prisma.message.updateMany({
      where: { threadId: req.params.id, senderId: { not: req.user!.id }, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({
      items: messages.map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        mine: m.senderId === req.user!.id,
        createdAt: m.createdAt,
      })),
    });
  })
);

// POST /threads/:id/messages — send a message (realtime + push to the other party).
threadsRouter.post(
  "/:id/messages",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { body } = z.object({ body: z.string().min(1).max(2000) }).parse(req.body);
    const info = await threadParticipants(req.params.id);
    if (!info) throw notFound("Conversation not found");
    if (![info.clientUserId, info.photographerUserId].includes(req.user!.id)) throw forbidden();

    const recipientId =
      req.user!.id === info.clientUserId ? info.photographerUserId : info.clientUserId;

    if ((await blockedUserIds(req.user!.id)).has(recipientId)) {
      throw forbidden("You can't message this user");
    }

    const message = await prisma.message.create({
      data: { threadId: req.params.id, senderId: req.user!.id, body },
    });
    await prisma.thread.update({
      where: { id: req.params.id },
      data: { lastMessageAt: message.createdAt },
    });

    const payload = {
      id: message.id,
      threadId: req.params.id,
      body: message.body,
      senderId: message.senderId,
      createdAt: message.createdAt,
    };
    emitToUser(recipientId, "message", payload);

    const sender = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { displayName: true },
    });
    await notify({
      userId: recipientId,
      type: "NEW_MESSAGE",
      title: sender?.displayName ?? "New message",
      body: body.slice(0, 120),
      data: { threadId: req.params.id },
    });

    res.status(201).json({ ...payload, mine: true });
  })
);
