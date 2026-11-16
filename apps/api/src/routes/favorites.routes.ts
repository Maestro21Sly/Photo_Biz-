import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/ratelimit.js";
import { notFound } from "../lib/errors.js";
import { photographerInclude, serializePhotographer } from "../lib/serialize.js";

export const favoritesRouter = Router();

favoritesRouter.use(authenticate);

// GET /favorites — the user's saved photographers.
favoritesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const favs = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: { photographer: { include: photographerInclude } },
    });
    res.json({ items: favs.map((f) => serializePhotographer(f.photographer, { isFavorite: true })) });
  })
);

// PUT /favorites/:photographerId — save.
favoritesRouter.put(
  "/:photographerId",
  writeLimiter,
  asyncHandler(async (req, res) => {
    // Checked up front so an unknown id answers 404 instead of surfacing a raw
    // foreign-key failure, and so unpublished profiles stay unaddressable.
    const photographer = await prisma.photographerProfile.findUnique({
      where: { id: req.params.photographerId },
      select: { id: true, isPublished: true },
    });
    if (!photographer || !photographer.isPublished) throw notFound("Photographer not found");

    await prisma.favorite.upsert({
      where: {
        userId_photographerId: { userId: req.user!.id, photographerId: photographer.id },
      },
      update: {},
      create: { userId: req.user!.id, photographerId: photographer.id },
    });
    res.status(204).end();
  })
);

// DELETE /favorites/:photographerId — unsave. Scoped to the caller's own rows.
favoritesRouter.delete(
  "/:photographerId",
  writeLimiter,
  asyncHandler(async (req, res) => {
    await prisma.favorite.deleteMany({
      where: { userId: req.user!.id, photographerId: req.params.photographerId },
    });
    res.status(204).end();
  })
);
