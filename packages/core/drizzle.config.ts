import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Run from packages/core: use a local env file if present, otherwise the auth app's.
config({ path: ".env.local" });
config({ path: ".env" });
config({ path: "../../apps/auth/.env.local" });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
