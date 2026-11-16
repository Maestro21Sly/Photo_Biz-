import "dotenv/config";

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// Problems are collected rather than thrown one at a time so a misconfigured
// deploy reports *every* issue in a single boot instead of one per restart.
const problems: string[] = [];

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    problems.push(`Missing required env var: ${name}`);
    return "";
  }
  return value;
}

// Rejecting the .env.example placeholders outright is what stops a copy-pasted
// dev config from quietly becoming the production signing key — a known or weak
// JWT secret lets anyone forge an access token for any user, including ADMIN.
const MIN_SECRET_LENGTH = 32;

function secret(name: string): string {
  const value = required(name);
  if (!value) return "";
  if (/change-?me|placeholder|^dev-/i.test(value)) {
    problems.push(`${name} looks like a placeholder — generate a real secret`);
  } else if (value.length < MIN_SECRET_LENGTH) {
    problems.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters (got ${value.length})`);
  }
  return value;
}

/**
 * Express' `trust proxy` setting. Getting this wrong is a security bug in both
 * directions: too permissive and a client spoofs X-Forwarded-For to dodge rate
 * limits, too strict and every request behind a load balancer shares one bucket.
 * Default to off and make operators opt in for their topology.
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (!raw || raw === "false") return false;
  if (raw === "true") return true;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : raw;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    problems.push(`${name} must be a positive integer (got "${raw}")`);
    return fallback;
  }
  return n;
}

// Wildcard CORS is only ever acceptable for local development, and never with
// credentials enabled — reflecting arbitrary origins back with credentials is
// equivalent to having no same-origin policy at all.
const corsOriginRaw = (process.env.CORS_ORIGIN ?? (isProd ? "" : "*")).trim();
if (isProd && (corsOriginRaw === "*" || corsOriginRaw === "")) {
  problems.push('CORS_ORIGIN must be an explicit comma-separated origin list in production (never "*")');
}
const corsOrigins: "*" | string[] =
  corsOriginRaw === "*" ? "*" : corsOriginRaw.split(",").map((s) => s.trim()).filter(Boolean);

const storageDriver = (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3";
if (!["local", "s3"].includes(storageDriver)) problems.push('STORAGE_DRIVER must be "local" or "s3"');

const emailDriver = (process.env.EMAIL_DRIVER ?? "console") as "console" | "resend";
if (!["console", "resend"].includes(emailDriver)) problems.push('EMAIL_DRIVER must be "console" or "resend"');

const s3 = {
  bucket: process.env.S3_BUCKET ?? "",
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT || undefined, // set for R2/MinIO; omit for AWS
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  publicUrl: process.env.S3_PUBLIC_URL ?? "", // public base URL / CDN for the bucket
};

if (storageDriver === "s3") {
  for (const [key, value] of Object.entries({
    S3_BUCKET: s3.bucket,
    S3_ACCESS_KEY_ID: s3.accessKeyId,
    S3_SECRET_ACCESS_KEY: s3.secretAccessKey,
    S3_PUBLIC_URL: s3.publicUrl,
  })) {
    if (!value) problems.push(`${key} is required when STORAGE_DRIVER=s3`);
  }
}

const resendApiKey = process.env.RESEND_API_KEY ?? "";
if (emailDriver === "resend" && !resendApiKey) {
  problems.push("RESEND_API_KEY is required when EMAIL_DRIVER=resend");
}
// The console driver prints reset/verify links verbatim; in production that hands
// every account to anyone with log access.
if (isProd && emailDriver === "console") {
  problems.push('EMAIL_DRIVER must not be "console" in production — reset links would be written to logs');
}
if (isProd && storageDriver === "local") {
  problems.push('STORAGE_DRIVER must be "s3" in production — local disk is not durable across deploys');
}

// bcrypt cost dominates test runtime, so tests may lower it; nothing else may.
const bcryptRounds = positiveInt("BCRYPT_ROUNDS", isTest ? 4 : 12);
if (!isTest && bcryptRounds < 10) problems.push("BCRYPT_ROUNDS must be at least 10 outside tests");

export const env = {
  isProd,
  isTest,
  databaseUrl: required("DATABASE_URL"),
  jwtAccessSecret: secret("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: secret("JWT_REFRESH_SECRET"),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtlDays: positiveInt("REFRESH_TOKEN_TTL_DAYS", 30),
  port: positiveInt("PORT", 4000),
  bcryptRounds,

  corsOrigins,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "http://localhost:4000").replace(/\/$/, ""),

  // Where the app/web lives — used to build links in emails (reset, verify).
  appUrl: (process.env.APP_URL ?? "http://localhost:8080").replace(/\/$/, ""),

  // Largest JSON body we accept. Uploads go through multer rather than this
  // parser, so it can stay small — it caps the cost of parsing hostile payloads.
  jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? "128kb",
  maxUploadBytes: positiveInt("MAX_UPLOAD_BYTES", 15 * 1024 * 1024),

  // Rate limits, exposed as env so CI can widen them and so a single test file
  // can pin them tight on purpose without recompiling.
  rateLimit: {
    enabled: process.env.RATE_LIMIT_DISABLED !== "true",
    authPerEmail: positiveInt("RATE_LIMIT_AUTH_PER_EMAIL", 10),
    authPerIp: positiveInt("RATE_LIMIT_AUTH_PER_IP", 40),
    tokenPerIp: positiveInt("RATE_LIMIT_TOKEN_PER_IP", 60),
    writePerUser: positiveInt("RATE_LIMIT_WRITE_PER_USER", 30),
    global: positiveInt("RATE_LIMIT_GLOBAL", 300),
  },

  // Object storage: "local" (dev, served from /uploads) or "s3" (S3 / R2 / etc).
  storageDriver,
  s3,

  // Email: "console" (dev, logs) or "resend".
  emailDriver,
  emailFrom: process.env.EMAIL_FROM ?? "SnapCampus <noreply@snapcampus.app>",
  resendApiKey,
};

if (problems.length > 0) {
  throw new Error(
    `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}\n` +
      "Refusing to start. See apps/api/.env.example."
  );
}
