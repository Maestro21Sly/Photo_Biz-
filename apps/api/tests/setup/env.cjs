// Runs before any module under test is imported, so src/env.ts reads these.
// dotenv never overwrites an already-set variable, which is how CI overrides
// DATABASE_URL for its own Postgres service.
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env.test") });
