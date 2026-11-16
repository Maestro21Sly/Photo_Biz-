import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";

/** Wrap async route handlers so thrown/rejected errors reach the error middleware. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  fn: T
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found" });
}

// Prisma error codes we can map to a meaningful status. Anything else stays a
// 500 so we never leak query internals to a client.
const PRISMA_STATUS: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: "That record already exists" },
  P2003: { status: 400, message: "That referenced record doesn't exist" },
  P2025: { status: 404, message: "Not found" },
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  // Multer rejects oversized/extra files by throwing. Left unhandled these
  // surface as opaque 500s, which reads as a server bug rather than user error.
  if (err instanceof MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({
      error: err.code === "LIMIT_FILE_SIZE" ? "That file is too large" : "Invalid upload",
    });
    return;
  }
  // body-parser signals "body too large" / "malformed JSON" with an http status
  // on the error. Without this they surfaced as 500s, which made a client-side
  // mistake look like a server fault and hid the body limit from callers.
  if (typeof err === "object" && err !== null && "type" in err) {
    const bodyErr = err as { type?: string; status?: number; statusCode?: number };
    const status = bodyErr.status ?? bodyErr.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({
        error: bodyErr.type === "entity.too.large" ? "Request body is too large" : "Malformed request body",
      });
      return;
    }
  }

  const code = typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
  const mapped = code ? PRISMA_STATUS[code] : undefined;
  if (mapped) {
    res.status(mapped.status).json({ error: mapped.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
}
