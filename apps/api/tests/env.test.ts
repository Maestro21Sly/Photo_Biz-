/**
 * Boot-time configuration validation.
 *
 * src/env.ts is re-required with a mutated process.env for each case.
 * DOTENV_CONFIG_PATH is pointed at a file that doesn't exist so the repo's real
 * .env can't quietly refill a variable the test is trying to remove.
 */
const BASE: Record<string, string> = {
  DOTENV_CONFIG_PATH: "/nonexistent/.env",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef0123",
  JWT_REFRESH_SECRET: "fedcba9876543210fedcba9876543210fedc",
  CORS_ORIGIN: "https://app.snapcampus.test",
  STORAGE_DRIVER: "local",
  EMAIL_DRIVER: "console",
};

function loadEnv(overrides: Record<string, string | undefined> = {}) {
  const saved = process.env;
  jest.resetModules();
  process.env = { ...BASE, NODE_ENV: "development" } as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return (require("../src/env") as typeof import("../src/env")).env;
  } finally {
    process.env = saved;
  }
}

describe("required configuration", () => {
  it("loads a well-formed environment", () => {
    const env = loadEnv();
    expect(env.jwtAccessSecret).toBe(BASE.JWT_ACCESS_SECRET);
    expect(env.corsOrigins).toEqual(["https://app.snapcampus.test"]);
  });

  it("refuses to boot without a database url or signing secrets", () => {
    expect(() => loadEnv({ DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ JWT_ACCESS_SECRET: undefined })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv({ JWT_REFRESH_SECRET: undefined })).toThrow(/JWT_REFRESH_SECRET/);
  });

  it("reports every problem at once rather than one per restart", () => {
    expect(() => loadEnv({ DATABASE_URL: undefined, JWT_ACCESS_SECRET: undefined })).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/
    );
  });
});

describe("secret strength", () => {
  it.each([
    ["the .env.example placeholder", "dev-access-secret-change-me"],
    ["anything containing change-me", "supersecretvalue-change-me-before-prod"],
    ["a short secret", "tooshort"],
  ])("rejects %s", (_label, secret) => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: secret })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("accepts a 32+ character random secret", () => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: "a".repeat(32) })).not.toThrow();
  });
});

describe("production hardening", () => {
  const prod = (overrides: Record<string, string | undefined> = {}) =>
    loadEnv({
      NODE_ENV: "production",
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "bucket",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_PUBLIC_URL: "https://cdn.snapcampus.test",
      EMAIL_DRIVER: "resend",
      RESEND_API_KEY: "re_test",
      ...overrides,
    });

  it("boots with a complete production configuration", () => {
    expect(() => prod()).not.toThrow();
  });

  it("refuses a wildcard or missing CORS origin", () => {
    expect(() => prod({ CORS_ORIGIN: "*" })).toThrow(/CORS_ORIGIN/);
    expect(() => prod({ CORS_ORIGIN: undefined })).toThrow(/CORS_ORIGIN/);
  });

  it("refuses the console email driver, which would print reset links to logs", () => {
    expect(() => prod({ EMAIL_DRIVER: "console", RESEND_API_KEY: undefined })).toThrow(/EMAIL_DRIVER/);
  });

  it("refuses local disk storage", () => {
    expect(() => prod({ STORAGE_DRIVER: "local" })).toThrow(/STORAGE_DRIVER/);
  });

  it("refuses an incomplete s3 configuration", () => {
    expect(() => prod({ S3_BUCKET: undefined })).toThrow(/S3_BUCKET/);
    expect(() => prod({ S3_SECRET_ACCESS_KEY: undefined })).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it("refuses resend without an api key", () => {
    expect(() => prod({ RESEND_API_KEY: undefined })).toThrow(/RESEND_API_KEY/);
  });

  it("refuses a bcrypt cost below 10", () => {
    expect(() => prod({ BCRYPT_ROUNDS: "4" })).toThrow(/BCRYPT_ROUNDS/);
  });

  it("still allows a wildcard outside production", () => {
    expect(loadEnv({ CORS_ORIGIN: "*" }).corsOrigins).toBe("*");
  });
});

describe("trust proxy parsing", () => {
  it.each([
    [undefined, false],
    ["false", false],
    ["true", true],
    ["1", 1],
    ["2", 2],
  ])("parses TRUST_PROXY=%s as %s", (raw, expected) => {
    expect(loadEnv({ TRUST_PROXY: raw as string | undefined }).trustProxy).toBe(expected);
  });

  it("passes a subnet list through untouched", () => {
    expect(loadEnv({ TRUST_PROXY: "10.0.0.0/8" }).trustProxy).toBe("10.0.0.0/8");
  });

  it("rejects a non-positive numeric limit", () => {
    expect(() => loadEnv({ REFRESH_TOKEN_TTL_DAYS: "0" })).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
    expect(() => loadEnv({ PORT: "not-a-number" })).toThrow(/PORT/);
  });
});
