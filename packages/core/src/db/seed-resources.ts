/**
 * Registers the OAuth protected resources (`oauth_resource` rows) before the app starts.
 * The auth app's build runs it right after the migrations.
 *
 * Better Auth seeds these rows itself on first use, but on a fresh database the build's
 * parallel workers (and concurrent cold starts) race on the insert. The library means to
 * ignore the losing duplicate-key error, yet Drizzle wraps it ("Failed query: …") so it
 * surfaces as a failed request instead. With the rows already present, the library finds
 * them and never inserts.
 *
 * Existing rows are left untouched, like the library's default `insertOnly` seed mode, so
 * edits made from the admin console survive redeploys.
 */
import { randomBytes } from "node:crypto";
import net from "node:net";
import { config } from "dotenv";
import pg from "pg";

// Same lookup as drizzle.config.ts: a local env file if present, otherwise the auth app's.
// Vercel builds get the variables from the environment directly.
for (const path of [".env.local", ".env", "../../apps/auth/.env.local"]) {
  config({ path, quiet: true });
}

/** Better Auth's default id format: 32 alphanumeric characters. */
function generateId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(32), (byte) => alphabet[byte % alphabet.length]).join("");
}

// Node gives each resolved address 250 ms by default, too short while a serverless database
// (Neon) wakes up: every address times out and the build fails.
net.setDefaultAutoSelectFamilyAttemptTimeout(2_000);

/** Connects with a few retries, for the same cold-start reason. */
async function connect(connectionString: string): Promise<pg.Client> {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15_000 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => {});
      if (attempt >= 5) throw error;
      console.warn(`Database connection failed (attempt ${attempt} of 5), retrying.`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
}

async function main() {
  // Imported after dotenv so the env schema sees the loaded variables.
  const { env } = await import("@ostiary/core/lib/env");
  const { getBaseURL } = await import("@ostiary/core/lib/url");
  const { oauthResourceIdentifiers } = await import("@ostiary/core/lib/oauth-resources");

  // The canonical auth URL, as in apps/auth/lib/auth.ts.
  const identifiers = oauthResourceIdentifiers(env.AUTH_APP_URL ?? getBaseURL());

  const client = await connect(env.DATABASE_URL);
  try {
    const { rows } = await client.query(`select to_regclass('public.oauth_resource') as table`);
    if (!rows[0]?.table) {
      // Migrations not applied yet (e.g. a preview database): Better Auth seeds on first use.
      console.warn("oauth_resource table not found: run the migrations first. Skipping the seed.");
      return;
    }
    for (const identifier of identifiers) {
      const { rowCount } = await client.query(
        `insert into oauth_resource (id, identifier, name, dpop_bound_access_tokens_required, disabled, policy_version, created_at, updated_at)
         values ($1, $2, $2, false, false, 1, now(), now())
         on conflict (identifier) do nothing`,
        [generateId(), identifier],
      );
      console.log(`oauth_resource ${identifier}: ${rowCount ? "registered" : "already registered"}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
