import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { corsOptions } from "./cors.js";
import { env } from "./env.js";
import { UPLOAD_DIR } from "./lib/objectStorage.js";
import { legalRouter } from "./routes/legal.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { photographersRouter } from "./routes/photographers.routes.js";
import { favoritesRouter } from "./routes/favorites.routes.js";
import { bookingsRouter } from "./routes/bookings.routes.js";
import { threadsRouter } from "./routes/threads.routes.js";
import { reviewsRouter } from "./routes/reviews.routes.js";
import { mediaRouter } from "./routes/media.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { reportsRouter, blocksRouter } from "./routes/safety.routes.js";
import { globalLimiter } from "./middleware/ratelimit.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  // Rate limiting is only as trustworthy as req.ip, and req.ip is only correct
  // if Express knows how many proxies sit in front of it. Never blanket-trust.
  app.set("trust proxy", env.trustProxy);
  app.disable("x-powered-by");

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // The legal pages are the only HTML this service renders and they use an
      // inline <style> block. Scripts are blocked outright, so an injected
      // <script> in any response body is inert.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          scriptSrc: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      referrerPolicy: { policy: "no-referrer" },
    })
  );
  app.use(cors(corsOptions));
  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: env.jsonBodyLimit }));
  if (!env.isProd && !env.isTest) app.use(morgan("dev"));

  // Serve uploaded portfolio images / avatars. Everything here was re-encoded by
  // sharp, but the extra headers make sure a file that somehow isn't an image
  // can't be rendered as an active document from our origin.
  app.use(
    "/uploads",
    express.static(UPLOAD_DIR, {
      maxAge: "7d",
      immutable: true,
      index: false,
      dotfiles: "deny",
      setHeaders: (res) => {
        res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    })
  );

  app.get("/health", (_req, res) => res.json({ ok: true, service: "snapcampus-api" }));

  // Public legal pages (App Store requires a reachable privacy policy URL).
  app.use("/legal", legalRouter);

  const api = express.Router();
  api.use(globalLimiter);
  api.use("/auth", authRouter);
  api.use("/photographers", photographersRouter);
  api.use("/favorites", favoritesRouter);
  api.use("/bookings", bookingsRouter);
  api.use("/threads", threadsRouter);
  api.use("/reviews", reviewsRouter);
  api.use("/media", mediaRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/reports", reportsRouter);
  api.use("/blocks", blocksRouter);
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
