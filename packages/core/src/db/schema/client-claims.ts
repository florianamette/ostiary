import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { oauthClient, user } from "./auth";

/**
 * Custom claims an admin adds to an application's tokens (see lib/client-claims). Like
 * `oauth_client_branding`, only the admin console writes it: no OAuth endpoint (dynamic
 * registration, client update) can reach this table, unlike `oauth_client.metadata`. Deleted
 * with its client.
 */
export const oauthClientClaims = pgTable("oauth_client_claims", {
  clientId: text("client_id")
    .primaryKey()
    .references(() => oauthClient.clientId, { onDelete: "cascade" }),
  /** A list of `ClientClaim` (lib/client-claims/policy.ts), validated again before use. */
  claims: jsonb("claims").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
