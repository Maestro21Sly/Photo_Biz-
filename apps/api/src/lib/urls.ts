import { z } from "zod";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Profile links (instagram, portfolioUrl) are rendered by the app as tappable
 * `Linking.openURL(...)` targets. Without a scheme allowlist a photographer can
 * store `javascript:` / `data:` / `intent:` / arbitrary custom schemes and turn
 * their own profile page into a launcher for whatever the OS will resolve.
 */
export const externalUrlSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      return ALLOWED_PROTOCOLS.has(parsed.protocol) && Boolean(parsed.hostname);
    },
    { message: "Enter a full http(s) link" }
  );

/** Same rule, but an empty string is normalized to null (the app sends "" to clear). */
export const optionalExternalUrlSchema = z
  .union([externalUrlSchema, z.literal(""), z.null()])
  .transform((value) => (value ? value : null))
  .optional();
