import { boolean, pgTable, text, index } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Identity providers for enterprise SSO (@better-auth/sso). Registered from the admin app,
 * used to sign in from the auth app. Matches the plugin's `ssoProvider` model.
 */
export const ssoProvider = pgTable(
  "sso_provider",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    oidcConfig: text("oidc_config"),
    samlConfig: text("saml_config"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull().unique(),
    organizationId: text("organization_id"),
    domain: text("domain").notNull(),
    /** Set once the domain owner publishes the DNS TXT record; sign-in requires it. */
    domainVerified: boolean("domain_verified").default(false),
  },
  (table) => [index("sso_provider_domain_idx").on(table.domain)],
);
