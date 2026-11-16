import type { CorsOptions } from "cors";
import { env } from "./env.js";

const allowAnyOrigin = env.corsOrigins === "*";

/**
 * Shared by the HTTP app and the Socket.IO server so a socket can never reach an
 * origin the REST API refuses. It lives in its own module rather than app.ts to
 * keep app → routes → realtime → app from becoming an import cycle.
 *
 * `credentials` is deliberately tied to having an explicit allowlist: reflecting
 * an arbitrary Origin back *with* credentials is functionally "no same-origin
 * policy", which is the shape the previous `origin: true, credentials: true` had.
 */
export const corsOptions: CorsOptions = allowAnyOrigin
  ? { origin: "*", credentials: false, maxAge: 600 }
  : { origin: env.corsOrigins as string[], credentials: true, maxAge: 600 };
