import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

import { normalizeSslMode } from "./src/db/connection";

// Run from packages/core: use a local env file if present, otherwise the auth app's.
config({ path: ".env.local" });
config({ path: ".env" });
config({ path: "../../apps/auth/.env.local" });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // sslmode=require written as the verify-full pg applies anyway (src/db/connection.ts).
    // Unset for `generate` and `check`, which do not connect (CI runs them without a database).
    url: process.env.DATABASE_URL ? normalizeSslMode(process.env.DATABASE_URL) : process.env.DATABASE_URL!,
  },
});
