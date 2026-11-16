import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/ratelimit.js";

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

// GET /notifications — recent, with unread count.
notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);
    res.json({ items, unread });
  })
);

// POST /notifications/read — mark all (or a subset) read.
// The id list is bounded so a caller can't push an unbounded IN (...) into Postgres.
const readSchema = z.object({ ids: z.array(z.string().min(1).max(64)).max(200).optional() });
notificationsRouter.post(
  "/read",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { ids } = readSchema.parse(req.body ?? {});
    await prisma.notification.updateMany({
      // Always scoped by userId, so an id belonging to someone else is a no-op.
      where: { userId: req.user!.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    res.status(204).end();
  })
);
