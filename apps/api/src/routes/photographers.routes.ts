import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate, optionalAuth, requireRole } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/ratelimit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { photographerInclude, serializePhotographer } from "../lib/serialize.js";
import { optionalExternalUrlSchema } from "../lib/urls.js";
import { blockedUserIds } from "./safety.routes.js";

export const photographersRouter = Router();

const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  specialty: z.string().trim().optional(),
  campus: z.string().trim().optional(),
  sort: z.enum(["top", "new", "price", "near"]).default("top"),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
});

const EARTH_KM = 6371;
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// GET /photographers — search, filter, paginate, and (optionally) sort by distance.
photographersRouter.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { q, specialty, campus, sort, cursor, limit, lat, lng, radiusKm, maxPrice, minRating } =
      listQuerySchema.parse(req.query);
    const hasGeo = lat != null && lng != null;

    // Hide photographers involved in a block with the viewer (either direction).
    const blocked = req.user ? [...(await blockedUserIds(req.user.id))] : [];

    // Optional bounding box for "near me" so we don't scan the whole table.
    let geoBox: Prisma.PhotographerProfileWhereInput = {};
    if (hasGeo && radiusKm) {
      const dLat = radiusKm / 111;
      const dLng = radiusKm / (111 * Math.max(0.1, Math.cos((lat! * Math.PI) / 180)));
      geoBox = {
        latitude: { gte: lat! - dLat, lte: lat! + dLat },
        longitude: { gte: lng! - dLng, lte: lng! + dLng },
      };
    }

    const where: Prisma.PhotographerProfileWhereInput = {
      isPublished: true,
      ...(blocked.length ? { userId: { notIn: blocked } } : {}),
      ...(campus ? { campus: { contains: campus, mode: "insensitive" } } : {}),
      ...(minRating ? { ratingAvg: { gte: minRating } } : {}),
      ...(maxPrice != null
        ? { OR: [{ startingAt: { lte: maxPrice } }, { hourlyRate: { lte: maxPrice } }] }
        : {}),
      ...geoBox,
      ...(specialty
        ? { specialties: { some: { specialty: { name: { equals: specialty, mode: "insensitive" } } } } }
        : {}),
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { user: { displayName: { contains: q, mode: "insensitive" } } },
                  { campus: { contains: q, mode: "insensitive" } },
                  { headline: { contains: q, mode: "insensitive" } },
                  { bio: { contains: q, mode: "insensitive" } },
                  { specialties: { some: { specialty: { name: { contains: q, mode: "insensitive" } } } } },
                ],
              },
            ],
          }
        : {}),
    };

    const withDistance = (p: Parameters<typeof serializePhotographer>[0], isFav: boolean) => {
      const base = serializePhotographer(p, { isFavorite: isFav });
      const distanceKm =
        hasGeo && base.location ? Number(haversineKm(lat!, lng!, base.location.latitude, base.location.longitude).toFixed(1)) : null;
      return { ...base, distanceKm };
    };

    const favSet = async (ids: string[]) => {
      if (!req.user) return new Set<string>();
      const favs = await prisma.favorite.findMany({
        where: { userId: req.user.id, photographerId: { in: ids } },
        select: { photographerId: true },
      });
      return new Set(favs.map((f) => f.photographerId));
    };

    // "Near me" sorts by computed distance in JS (no PostGIS) — single page.
    if (sort === "near" && hasGeo) {
      const rows = await prisma.photographerProfile.findMany({ where, include: photographerInclude, take: 200 });
      const favorites = await favSet(rows.map((r) => r.id));
      const items = rows
        .map((p) => withDistance(p, favorites.has(p.id)))
        .filter((p) => p.distanceKm != null)
        .sort((a, b) => (a.distanceKm! - b.distanceKm!))
        .slice(0, limit);
      res.json({ items, nextCursor: null });
      return;
    }

    const orderBy: Prisma.PhotographerProfileOrderByWithRelationInput =
      sort === "new"
        ? { createdAt: "desc" }
        : sort === "price"
          ? { startingAt: "asc" }
          : [{ isVerified: "desc" }, { ratingAvg: "desc" }, { ratingCount: "desc" }] as never;

    const rows = await prisma.photographerProfile.findMany({
      where,
      include: photographerInclude,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const favorites = await favSet(page.map((p) => p.id));

    res.json({
      items: page.map((p) => withDistance(p, favorites.has(p.id))),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    });
  })
);

// GET /photographers/specialties — for filter chips.
photographersRouter.get(
  "/specialties",
  asyncHandler(async (_req, res) => {
    const specialties = await prisma.specialty.findMany({ orderBy: { name: "asc" } });
    res.json({ items: specialties.map((s) => s.name) });
  })
);

// GET /photographers/me — the signed-in photographer's own profile (for editing).
photographersRouter.get(
  "/me",
  authenticate,
  requireRole("PHOTOGRAPHER"),
  asyncHandler(async (req, res) => {
    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      include: photographerInclude,
    });
    if (!profile) throw notFound("No photographer profile");
    res.json(serializePhotographer(profile));
  })
);

const profileUpdateSchema = z.object({
  campus: z.string().min(1).max(80).optional(),
  headline: z.string().max(120).optional(),
  bio: z.string().max(1000).optional(),
  responseTime: z.string().max(80).optional(),
  pricingModel: z.enum(["HOURLY", "PACKAGE", "CUSTOM"]).optional(),
  priceLabel: z.string().max(80).optional(),
  hourlyRate: z.number().int().min(0).nullable().optional(),
  minimumHours: z.number().int().min(0).nullable().optional(),
  startingAt: z.number().int().min(0).nullable().optional(),
  negotiable: z.boolean().optional(),
  pricingNotes: z.string().max(500).optional(),
  // These are rendered by the app as tappable Linking.openURL targets — see
  // lib/urls.ts for why the scheme has to be pinned to http(s).
  instagram: optionalExternalUrlSchema,
  portfolioUrl: optionalExternalUrlSchema,
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isPublished: z.boolean().optional(),
  specialties: z.array(z.string().min(1).max(40)).max(12).optional(),
});

// PUT /photographers/me — update profile + specialties.
photographersRouter.put(
  "/me",
  authenticate,
  requireRole("PHOTOGRAPHER"),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const data = profileUpdateSchema.parse(req.body);
    const profile = await prisma.photographerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("No photographer profile");

    const { specialties, ...fields } = data;

    await prisma.$transaction(async (tx) => {
      await tx.photographerProfile.update({ where: { id: profile.id }, data: fields });

      if (specialties) {
        await tx.photographerSpecialty.deleteMany({ where: { photographerId: profile.id } });
        for (const name of specialties) {
          const specialty = await tx.specialty.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          await tx.photographerSpecialty.create({
            data: { photographerId: profile.id, specialtyId: specialty.id },
          });
        }
      }
    });

    const updated = await prisma.photographerProfile.findUnique({
      where: { id: profile.id },
      include: photographerInclude,
    });
    res.json(serializePhotographer(updated!));
  })
);

// POST /photographers/me/request-verification — submit for review (-> PENDING).
photographersRouter.post(
  "/me/request-verification",
  authenticate,
  requireRole("PHOTOGRAPHER"),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const profile = await prisma.photographerProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile) throw notFound("No photographer profile");
    if (profile.isVerified) throw badRequest("You're already verified");
    await prisma.photographerProfile.update({
      where: { id: profile.id },
      data: { verificationStatus: "PENDING" },
    });
    res.json({ verificationStatus: "PENDING" });
  })
);

// PATCH /photographers/:id/verify — admin grants/revokes verification.
photographersRouter.patch(
  "/:id/verify",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    const updated = await prisma.photographerProfile.update({
      where: { id: req.params.id },
      data: { isVerified: approve, verificationStatus: approve ? "VERIFIED" : "REJECTED" },
    });
    res.json({ isVerified: updated.isVerified, verificationStatus: updated.verificationStatus });
  })
);

// GET /photographers/:id — public detail.
photographersRouter.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.photographerProfile.findUnique({
      where: { id: req.params.id },
      include: photographerInclude,
    });
    if (!profile || (!profile.isPublished && profile.userId !== req.user?.id)) {
      throw notFound("Photographer not found");
    }

    let isFavorite = false;
    if (req.user) {
      const fav = await prisma.favorite.findUnique({
        where: { userId_photographerId: { userId: req.user.id, photographerId: profile.id } },
      });
      isFavorite = Boolean(fav);
    }

    const reviews = await prisma.review.findMany({
      where: { photographerId: profile.id },
      include: { author: { select: { displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({
      ...serializePhotographer(profile, { isFavorite }),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        author: r.author.displayName,
        authorAvatar: r.author.avatarUrl,
        createdAt: r.createdAt,
      })),
    });
  })
);
