import { Router } from "express";
import multer, { MulterError } from "multer";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { asyncHandler } from "../middleware/error.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/ratelimit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { processImage } from "../lib/images.js";
import { deleteByUrl, newKey, putObject } from "../lib/objectStorage.js";

const MAX_PORTFOLIO_IMAGES = 30;

/**
 * Buffer uploads in memory; sharp re-encodes before anything touches storage.
 *
 * The mimetype test here is only a cheap early reject — Content-Type and the
 * filename are both attacker-controlled. The authoritative check is
 * processImage(), which identifies the format from the file's magic bytes and
 * mints the stored extension from *that*, never from the upload.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1, fields: 4, parts: 6 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  },
});

export const mediaRouter = Router();
mediaRouter.use(authenticate);

// POST /media/avatar — square avatar (re-encoded, EXIF stripped).
mediaRouter.post(
  "/avatar",
  writeLimiter,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No file uploaded");
    let processed;
    try {
      processed = await processImage(req.file.buffer);
    } catch {
      throw badRequest("That file isn't a valid image");
    }
    const url = await putObject(newKey(processed.ext), processed.thumb, processed.contentType);
    await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: url } });
    res.status(201).json({ url });
  })
);

// POST /media/portfolio — full image + thumbnail to the photographer's gallery.
mediaRouter.post(
  "/portfolio",
  writeLimiter,
  requireRole("PHOTOGRAPHER"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No file uploaded");
    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!profile) throw notFound("No photographer profile");

    const count = await prisma.portfolioMedia.count({ where: { photographerId: profile.id } });
    if (count >= MAX_PORTFOLIO_IMAGES) throw badRequest(`Portfolio is limited to ${MAX_PORTFOLIO_IMAGES} photos`);

    let processed;
    try {
      processed = await processImage(req.file.buffer);
    } catch {
      throw badRequest("That file isn't a valid image");
    }

    const [url, thumbnailUrl] = await Promise.all([
      putObject(newKey(processed.ext), processed.full, processed.contentType),
      putObject(newKey(processed.ext), processed.thumb, processed.contentType),
    ]);

    const caption = typeof req.body?.caption === "string" ? req.body.caption.slice(0, 200) : "";
    const media = await prisma.portfolioMedia.create({
      data: {
        photographerId: profile.id,
        url,
        thumbnailUrl,
        caption,
        width: processed.width,
        height: processed.height,
        position: count,
      },
    });
    res.status(201).json({ id: media.id, url: media.url, thumbnailUrl: media.thumbnailUrl, caption: media.caption });
  })
);

// DELETE /media/portfolio/:id — remove image (must own it) + purge from storage.
mediaRouter.delete(
  "/portfolio/:id",
  requireRole("PHOTOGRAPHER"),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const media = await prisma.portfolioMedia.findUnique({
      where: { id: req.params.id },
      include: { photographer: { select: { userId: true } } },
    });
    if (!media || media.photographer.userId !== req.user!.id) throw notFound("Image not found");
    await prisma.portfolioMedia.delete({ where: { id: media.id } });
    await deleteByUrl(media.url);
    if (media.thumbnailUrl) await deleteByUrl(media.thumbnailUrl);
    res.status(204).end();
  })
);

// PUT /media/portfolio/order — reorder gallery.
mediaRouter.put(
  "/portfolio/order",
  requireRole("PHOTOGRAPHER"),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { order } = z
      .object({ order: z.array(z.string().min(1).max(64)).max(MAX_PORTFOLIO_IMAGES) })
      .parse(req.body);
    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!profile) throw notFound("No photographer profile");

    await prisma.$transaction(
      order.map((id, index) =>
        prisma.portfolioMedia.updateMany({ where: { id, photographerId: profile.id }, data: { position: index } })
      )
    );
    res.status(204).end();
  })
);
