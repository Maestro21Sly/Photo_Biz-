import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/ratelimit.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { notify } from "../lib/notify.js";

export const reviewsRouter = Router();

const createSchema = z.object({
  photographerId: z.string(),
  bookingId: z.string(), // required: you can only review a shoot you completed
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).optional(),
});

/** Recomputes a photographer's cached rating average + count. */
async function recomputeRating(photographerId: string) {
  const agg = await prisma.review.aggregate({
    where: { photographerId },
    _avg: { rating: true },
    _count: true,
  });
  await prisma.photographerProfile.update({
    where: { id: photographerId },
    data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
  });
}

// POST /reviews — leave a review (one per completed booking when bookingId given).
reviewsRouter.post(
  "/",
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);

    const photographer = await prisma.photographerProfile.findUnique({
      where: { id: input.photographerId },
      select: { id: true, userId: true },
    });
    if (!photographer) throw notFound("Photographer not found");
    if (photographer.userId === req.user!.id) throw badRequest("You can't review yourself");

    const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking || booking.clientId !== req.user!.id) throw forbidden("Not your booking");
    if (booking.photographerId !== input.photographerId) throw badRequest("Booking doesn't match photographer");
    if (booking.status !== "COMPLETED") throw badRequest("You can review after the shoot is completed");

    const existing = await prisma.review.findUnique({ where: { bookingId: input.bookingId } });
    if (existing) throw badRequest("You've already reviewed this shoot");

    const review = await prisma.review.create({
      data: {
        photographerId: input.photographerId,
        authorId: req.user!.id,
        bookingId: input.bookingId,
        rating: input.rating,
        body: input.body ?? "",
      },
    });

    await recomputeRating(input.photographerId);

    await notify({
      userId: photographer.userId,
      type: "NEW_REVIEW",
      title: "New review",
      body: `${input.rating}★ — ${input.body?.slice(0, 80) ?? ""}`,
      data: { reviewId: review.id },
    });

    res.status(201).json({ id: review.id });
  })
);
