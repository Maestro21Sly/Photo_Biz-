import { Router } from "express";
import { z } from "zod";
import type { BookingStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/ratelimit.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { notify } from "../lib/notify.js";
import { blockedUserIds } from "./safety.routes.js";

export const bookingsRouter = Router();

bookingsRouter.use(authenticate);

const createSchema = z.object({
  photographerId: z.string(),
  eventType: z.string().min(2).max(80),
  eventDate: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: "Pick a date and time in the future",
  }),
  location: z.string().min(2).max(160),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  durationHours: z.number().int().min(1).max(24).optional(),
  message: z.string().max(1000).optional(),
});

function bookingShape(b: {
  id: string;
  status: string;
  eventType: string;
  eventDate: Date;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  durationHours: number | null;
  message: string;
  quotedPrice: number | null;
  createdAt: Date;
  client?: { displayName: string; avatarUrl: string | null } | null;
  photographer?: { id: string; user: { displayName: string; avatarUrl: string | null } } | null;
}) {
  return {
    id: b.id,
    status: b.status,
    eventType: b.eventType,
    eventDate: b.eventDate,
    location: b.location,
    latitude: b.latitude ?? null,
    longitude: b.longitude ?? null,
    durationHours: b.durationHours,
    message: b.message,
    quotedPrice: b.quotedPrice,
    createdAt: b.createdAt,
    client: b.client ? { name: b.client.displayName, avatarUrl: b.client.avatarUrl } : undefined,
    photographer: b.photographer
      ? {
          id: b.photographer.id,
          name: b.photographer.user.displayName,
          avatarUrl: b.photographer.user.avatarUrl,
        }
      : undefined,
  };
}

// GET /bookings — bookings for the current user (as client and/or photographer).
bookingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });

    const bookings = await prisma.booking.findMany({
      where: {
        OR: [{ clientId: req.user!.id }, ...(profile ? [{ photographerId: profile.id }] : [])],
      },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { displayName: true, avatarUrl: true } },
        photographer: { include: { user: { select: { displayName: true, avatarUrl: true } } } },
        review: { select: { id: true } },
        thread: { select: { id: true } },
      },
    });

    res.json({
      items: bookings.map((b) => ({
        ...bookingShape(b),
        role: b.clientId === req.user!.id ? "client" : "photographer",
        reviewed: Boolean(b.review),
        threadId: b.thread?.id ?? null,
      })),
    });
  })
);

// GET /bookings/:id — full detail for either party (incl. pin + quote + thread).
bookingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { displayName: true, avatarUrl: true } },
        photographer: { include: { user: { select: { displayName: true, avatarUrl: true } } } },
        thread: { select: { id: true } },
        review: { select: { id: true } },
      },
    });
    if (!booking) throw notFound("Booking not found");
    const isClient = booking.clientId === req.user!.id;
    const isPhotographer = booking.photographer.userId === req.user!.id;
    if (!isClient && !isPhotographer) throw forbidden();

    res.json({
      ...bookingShape(booking),
      role: isClient ? "client" : "photographer",
      threadId: booking.thread?.id ?? null,
      reviewed: Boolean(booking.review),
    });
  })
);

// POST /bookings — student requests a booking. Also opens a chat thread.
bookingsRouter.post(
  "/",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);

    const photographer = await prisma.photographerProfile.findUnique({
      where: { id: input.photographerId },
      select: { id: true, userId: true, isPublished: true },
    });
    // Unpublished profiles are invisible in search; letting them be booked by id
    // would leak their existence and drag a draft account into the marketplace.
    if (!photographer || !photographer.isPublished) throw notFound("Photographer not found");
    if (photographer.userId === req.user!.id) throw badRequest("You can't book yourself");

    // A booking opens a thread and fires a push notification, so without this
    // check a blocked user still gets a channel to reach the person who blocked them.
    if ((await blockedUserIds(req.user!.id)).has(photographer.userId)) {
      throw forbidden("You can't book this photographer");
    }

    const booking = await prisma.booking.create({
      data: {
        clientId: req.user!.id,
        photographerId: photographer.id,
        eventType: input.eventType,
        eventDate: input.eventDate,
        location: input.location,
        latitude: input.latitude,
        longitude: input.longitude,
        durationHours: input.durationHours,
        message: input.message ?? "",
      },
      include: {
        photographer: { include: { user: { select: { displayName: true, avatarUrl: true } } } },
      },
    });

    // Ensure a chat thread exists between the two parties, linked to this booking.
    await prisma.thread.upsert({
      where: { clientId_photographerId: { clientId: req.user!.id, photographerId: photographer.id } },
      update: { bookingId: booking.id, lastMessageAt: new Date() },
      create: { clientId: req.user!.id, photographerId: photographer.id, bookingId: booking.id },
    });

    await notify({
      userId: photographer.userId,
      type: "BOOKING_REQUESTED",
      title: "New booking request",
      body: `${input.eventType} on ${input.eventDate.toLocaleDateString()}`,
      data: { bookingId: booking.id },
    });

    res.status(201).json(bookingShape(booking));
  })
);

const statusSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "COMPLETED", "CANCELLED"]),
  quotedPrice: z.number().int().min(0).max(1_000_000).optional(),
});

/**
 * Legal status transitions. Without this a photographer could jump a booking
 * straight from REQUESTED to COMPLETED (no acceptance, no shoot), resurrect a
 * CANCELLED booking, or re-COMPLETE the same booking repeatedly to inflate
 * `completedJobs` — all of which are reputation forgery on a marketplace.
 */
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ["ACCEPTED", "DECLINED", "CANCELLED"],
  ACCEPTED: ["COMPLETED", "CANCELLED"],
  DECLINED: [],
  COMPLETED: [],
  CANCELLED: [],
};

// PATCH /bookings/:id/status — photographer accepts/declines/completes; client cancels.
bookingsRouter.patch(
  "/:id/status",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { status, quotedPrice } = statusSchema.parse(req.body);
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { photographer: { select: { id: true, userId: true } } },
    });
    if (!booking) throw notFound("Booking not found");

    const isClient = booking.clientId === req.user!.id;
    const isPhotographer = booking.photographer.userId === req.user!.id;
    if (!isClient && !isPhotographer) throw forbidden();

    // Clients may only cancel; photographers manage accept/decline/complete.
    if (isClient && status !== "CANCELLED") throw forbidden("Only the photographer can do that");
    if (isPhotographer && status === "CANCELLED") throw forbidden("Decline instead of cancel");

    // The quote is the photographer's offer; a client must not be able to write
    // their own price onto the booking while cancelling it.
    if (quotedPrice !== undefined && !isPhotographer) {
      throw forbidden("Only the photographer can set the quote");
    }

    if (!ALLOWED_TRANSITIONS[booking.status].includes(status)) {
      throw conflict(`A ${booking.status.toLowerCase()} booking can't be marked ${status.toLowerCase()}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Guarding on the status we read is a compare-and-swap: two concurrent
      // "complete" calls can't both pass and double-count completedJobs.
      const claimed = await tx.booking.updateMany({
        where: { id: booking.id, status: booking.status },
        data: { status, ...(quotedPrice !== undefined ? { quotedPrice } : {}) },
      });
      if (claimed.count !== 1) throw conflict("That booking was just updated — reload and try again");

      if (status === "COMPLETED") {
        await tx.photographerProfile.update({
          where: { id: booking.photographerId },
          data: { completedJobs: { increment: 1 } },
        });
      }

      return tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: {
          client: { select: { displayName: true, avatarUrl: true } },
          photographer: { include: { user: { select: { displayName: true, avatarUrl: true } } } },
        },
      });
    });

    const typeMap = {
      ACCEPTED: "BOOKING_ACCEPTED",
      DECLINED: "BOOKING_DECLINED",
      COMPLETED: "BOOKING_COMPLETED",
      CANCELLED: "BOOKING_CANCELLED",
    } as const;

    // Notify the other party.
    await notify({
      userId: isClient ? booking.photographer.userId : booking.clientId,
      type: typeMap[status],
      title: `Booking ${status.toLowerCase()}`,
      body: booking.eventType,
      data: { bookingId: booking.id },
    });

    res.json(bookingShape(updated));
  })
);
