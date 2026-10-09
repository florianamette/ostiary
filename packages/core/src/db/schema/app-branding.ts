import { customType, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { oauthClient, user } from "./auth";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * How an application's sign-in screens look (see lib/app-branding). Only admins write it,
 * from the admin console, for clients they registered: unlike `oauth_client.metadata`, no
 * OAuth endpoint (dynamic registration, client update) can reach this table. Deleted with
 * its client.
 */
export const oauthClientBranding = pgTable("oauth_client_branding", {
  clientId: text("client_id")
    .primaryKey()
    .references(() => oauthClient.clientId, { onDelete: "cascade" }),
  /** Shown instead of the client name on the sign-in screens. */
  displayName: text("display_name"),
  /** One short line under "Continue to …". */
  tagline: text("tagline"),
  /** `#rrggbb`; null keeps the theme's colors. */
  accentColor: text("accent_color"),
  /** `app_icon` (the app's usual icon), `url` (fetched by the server and cached) or `upload`. */
  logoSource: text("logo_source").notNull().default("app_icon"),
  /** https URL of the logo when logoSource is `url`; fetched into `app_icon` like other icons. */
  logoUrl: text("logo_url"),
  logoContentType: text("logo_content_type"),
  logoData: bytea("logo_data"),
  /** Headline of the side panel (wide screens) instead of the product tagline. */
  panelText: text("panel_text"),
  panelImageContentType: text("panel_image_content_type"),
  panelImageData: bytea("panel_image_data"),
  /** Social sign-in providers shown for this app (ids); null shows every enabled one. */
  socialProviders: jsonb("social_providers").$type<string[] | null>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
