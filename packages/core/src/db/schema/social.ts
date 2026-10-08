import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Social sign-in providers configured from the admin console (one row per Better Auth provider
 * id, e.g. `google`). Every app reads them at runtime, so a change needs no redeploy.
 * `config` holds the non-secret fields (client ID, tenant...); `secrets` the secret ones
 * (client secret, private key) as a JSON object encrypted with a key derived from
 * BETTER_AUTH_SECRET, see lib/secret-box.ts.
 */
export const socialProvider = pgTable("social_provider", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  /** Display order on the sign-in page, ascending. */
  position: integer("position").default(0).notNull(),
  config: jsonb("config").$type<Record<string, string>>().default({}).notNull(),
  secrets: text("secrets"),
  /** When false, the provider only signs in existing accounts (Better Auth `disableImplicitSignUp`). */
  allowSignUp: boolean("allow_sign_up").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
