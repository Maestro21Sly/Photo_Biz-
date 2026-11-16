const path = require("node:path");
const { execFileSync } = require("node:child_process");

const apiRoot = path.resolve(__dirname, "../..");
require("dotenv").config({ path: path.join(apiRoot, ".env.test") });

/**
 * Apply real migrations to the real test database before the suite runs.
 *
 * `migrate deploy` (not `db push`) on purpose: the tests are meant to exercise
 * the same DDL production gets, so a broken migration fails CI here rather than
 * on a deploy.
 */
module.exports = async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: apiRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });
};
