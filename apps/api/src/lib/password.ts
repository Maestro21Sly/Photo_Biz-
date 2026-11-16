import { z } from "zod";

const MIN_LENGTH = 10;
// bcrypt only hashes the first 72 *bytes* and silently discards the rest, so a
// 200-char passphrase would be interchangeable with its 72-byte prefix. Reject
// over-long input rather than let users believe they have more entropy than they do.
const MAX_BYTES = 72;

// Deliberately short: this is a speed bump for the worst offenders, not a
// substitute for rate limiting or breach-corpus checks (which need a service).
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "qwerty123",
  "iloveyou",
  "letmein123",
  "welcome123",
  "admin123",
  "snapcampus",
  "photography",
]);

/**
 * Password rules shared by signup, password change, and reset so all three
 * enforce the same policy — a weaker reset path would make the others pointless.
 */
export const passwordSchema = z
  .string()
  .min(MIN_LENGTH, `Password must be at least ${MIN_LENGTH} characters`)
  .refine((v) => Buffer.byteLength(v, "utf8") <= MAX_BYTES, {
    message: `Password must be at most ${MAX_BYTES} bytes`,
  })
  .refine((v) => v.trim().length >= MIN_LENGTH, { message: "Password can't be mostly whitespace" })
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), {
    message: "That password is too common — pick something less guessable",
  })
  .refine((v) => !/^(.)\1+$/.test(v), { message: "Password can't be a single repeated character" });

/** Rejects passwords that are trivially derived from the account's own email. */
export function passwordUsesEmail(password: string, email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length < 4) return false;
  return password.toLowerCase().includes(local);
}
