/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/tests"],
  // Loaded before any module under test so src/env.ts sees the test config.
  setupFiles: ["<rootDir>/tests/setup/env.cjs", "<rootDir>/tests/setup/http.cjs"],
  globalSetup: "<rootDir>/tests/setup/globalSetup.cjs",
  globalTeardown: "<rootDir>/tests/setup/globalTeardown.cjs",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
  // src/ imports with explicit ".js" specifiers (required by the ESM runtime
  // build); under the CommonJS test transform those have to resolve back to .ts.
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  // Every suite shares one Postgres database and truncates between tests, so
  // they must not run concurrently.
  maxWorkers: 1,
  testTimeout: 30000,
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    // Process bootstrap: listens on a port, nothing to assert without a real server.
    "!src/index.ts",
  ],
  coverageReporters: ["text-summary", "lcov"],
};
