import { customType, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Icons of the OAuth applications, fetched by the server from each app's site (see
 * lib/app-icons) and shown on the account dashboard, the consent screen and the admin
 * console. One row per source: the client's `logo_uri`, or the origin of its site. `data` is
 * null when nothing usable was found, so a failure is not retried on every page view.
 */
export const appIcon = pgTable("app_icon", {
  /** The client's logo URL, or the site origin the icon was looked up on. */
  source: text("source").primaryKey(),
  contentType: text("content_type"),
  data: bytea("data"),
  /** Why no icon was stored, for debugging (never shown to users). */
  error: text("error"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});
