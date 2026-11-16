import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/ratelimit.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";

/* --------------------------------------------------------------- Reports -- */

export const reportsRouter = Router();
reportsRouter.use(authenticate);

const reportSchema = z.object({
  targetUserId: z.string().min(1).max(64),
  reason: z.enum(["HARASSMENT", "SPAM", "INAPPROPRIATE", "SCAM", "SAFETY", "OTHER"]),
  note: z.string().max(1000).optional(),
  threadId: z.string().min(1).max(64).optional(),
});

// POST /reports — file a report against another user.
reportsRouter.post(
  "/",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const input = reportSchema.parse(req.body);
    if (input.targetUserId === req.user!.id) throw badRequest("You can't report yourself");

    const target = await prisma.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true },
    });
    if (!target) throw notFound("That user doesn't exist");

    // A report may cite a thread as evidence, but only one the reporter is in —
    // otherwise the threadId field is a way to attach someone else's private
    // conversation id to a moderation ticket.
    if (input.threadId) {
      const thread = await prisma.thread.findUnique({
        where: { id: input.threadId },
        select: { clientId: true, photographer: { select: { userId: true } } },
      });
      if (!thread || ![thread.clientId, thread.photographer.userId].includes(req.user!.id)) {
        throw forbidden("That conversation isn't yours to report");
      }
    }

    await prisma.report.create({
      data: {
        reporterId: req.user!.id,
        targetUserId: input.targetUserId,
        reason: input.reason,
        note: input.note ?? "",
        threadId: input.threadId,
      },
    });
    res.status(201).json({ ok: true });
  })
);

/* ---------------------------------------------------------------- Blocks -- */

export const blocksRouter = Router();
blocksRouter.use(authenticate);

// GET /blocks — ids of users the current user has blocked.
blocksRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const blocks = await prisma.block.findMany({
      where: { blockerId: req.user!.id },
      select: { blockedId: true },
    });
    res.json({ items: blocks.map((b) => b.blockedId) });
  })
);

// PUT /blocks/:userId — block a user (also stops them messaging you).
blocksRouter.put(
  "/:userId",
  writeLimiter,
  asyncHandler(async (req, res) => {
    if (req.params.userId === req.user!.id) throw badRequest("You can't block yourself");
    const target = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true },
    });
    if (!target) throw notFound("That user doesn't exist");
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.user!.id, blockedId: req.params.userId } },
      update: {},
      create: { blockerId: req.user!.id, blockedId: req.params.userId },
    });
    res.status(204).end();
  })
);

// DELETE /blocks/:userId — unblock.
blocksRouter.delete(
  "/:userId",
  writeLimiter,
  asyncHandler(async (req, res) => {
    await prisma.block.deleteMany({
      where: { blockerId: req.user!.id, blockedId: req.params.userId },
    });
    res.status(204).end();
  })
);

/** Returns the set of user ids that block-conflict with `userId` (either direction). */
export async function blockedUserIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  return ids;
}
