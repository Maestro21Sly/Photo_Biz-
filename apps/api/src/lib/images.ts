import sharp, { type Metadata, type SharpOptions } from "sharp";

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  contentType: string;
  ext: string;
  width: number;
  height: number;
}

/**
 * Formats we're willing to decode, identified from the buffer's magic bytes by
 * sharp — never from the client's Content-Type or filename, both of which are
 * attacker-controlled.
 *
 * SVG is excluded on purpose even though sharp can rasterize it: an SVG is a
 * document, and librsvg will follow external references in it, which turns an
 * "avatar upload" into server-side request forgery.
 */
const ALLOWED_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "gif", "avif", "heif", "tiff"]);

// A 10k x 10k PNG is ~1 MB compressed but 400 MB decoded. Capping decoded pixels
// is what stops a small upload from taking the process down.
const MAX_INPUT_PIXELS = 50_000_000;

export class InvalidImageError extends Error {}

/**
 * Re-encode an uploaded image to JPEG. This validates it's a real image, strips
 * all metadata (including EXIF GPS), neutralizes polyglot files, caps dimensions,
 * and produces a thumbnail. Throws InvalidImageError if the buffer isn't an
 * image we accept.
 */
export async function processImage(buffer: Buffer, maxDim = 1600): Promise<ProcessedImage> {
  const options: SharpOptions = {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
    // Animated inputs would otherwise be decoded frame-by-frame into memory; we
    // only ever publish a still, so decode the first frame and stop.
    pages: 1,
  };

  let meta: Metadata;
  try {
    meta = await sharp(buffer, options).metadata();
  } catch (err) {
    throw new InvalidImageError(err instanceof Error ? err.message : "Not a valid image");
  }

  if (!meta.width || !meta.height) throw new InvalidImageError("Not a valid image");
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new InvalidImageError(`Unsupported image format: ${meta.format ?? "unknown"}`);
  }

  try {
    const full = await sharp(buffer, options)
      .rotate() // auto-orient, drops EXIF
      .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    // Derived from the already re-encoded `full` rather than the original buffer
    // so the hostile input is decoded exactly once.
    const thumb = await sharp(full, options)
      .resize({ width: 400, height: 400, fit: "cover" })
      .jpeg({ quality: 70 })
      .toBuffer();

    const resized = await sharp(full).metadata();
    return {
      full,
      thumb,
      contentType: "image/jpeg",
      ext: "jpg",
      width: resized.width ?? maxDim,
      height: resized.height ?? maxDim,
    };
  } catch (err) {
    throw new InvalidImageError(err instanceof Error ? err.message : "Could not process image");
  }
}
