import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

/**
 * Instance settings changed from the admin console, one JSON document per key (for example
 * `client_registration`). Read by every app at runtime, so a change needs no redeploy.
 */
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

/**
 * An organization's own security settings, set by platform admins. Two-factor authentication
 * required for its members (see lib/two-factor-policy.ts); `requireTwoFactorSince` starts
 * their grace period.
 */
export const organizationPolicy = pgTable("organization_policy", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  requireTwoFactor: boolean("require_two_factor").default(false).notNull(),
  requireTwoFactorSince: timestamp("require_two_factor_since", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
