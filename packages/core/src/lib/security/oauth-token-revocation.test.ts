import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@ostiary/core/db/schema";
import type { Database } from "@ostiary/core/lib/account-data/database";
import { revokeUserOAuthTokens } from "@ostiary/core/lib/security/oauth-token-revocation";

/* A ban or a password reset ends what apps hold for the account (as SCIM deactivation does). */

const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as Database;
const now = new Date("2026-10-01T12:00:00Z");
const later = new Date("2027-10-01T12:00:00Z");
const earlier = new Date("2026-09-01T12:00:00Z");

beforeAll(async () => {
  await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, "../../db/migrations") });
  await db.insert(schema.user).values([
    { id: "usr_banned", name: "Banned", email: "banned@example.org", emailVerified: true, createdAt: now, updatedAt: now },
    { id: "usr_other", name: "Other", email: "other@example.org", emailVerified: true, createdAt: now, updatedAt: now },
  ]);
  await db.insert(schema.oauthClient).values({ id: "c1", clientId: "client-1", name: "Notes", redirectUris: ["https://notes.example/cb"], createdAt: now, updatedAt: now });
  const token = (id: string, userId: string, revoked: Date | null = null) => ({
    id, token: `tok_${id}`, clientId: "client-1", userId, expiresAt: later, createdAt: now, scopes: ["openid"], revoked,
  });
  await db.insert(schema.oauthRefreshToken).values([token("rt_live", "usr_banned"), token("rt_old", "usr_banned", earlier), token("rt_other", "usr_other")]);
  await db.insert(schema.oauthAccessToken).values([token("at_live", "usr_banned"), token("at_other", "usr_other")]);
});

afterAll(async () => {
  await client.close();
});

describe("revokeUserOAuthTokens", () => {
  it("revokes the account's live access and refresh tokens, and nobody else's", async () => {
    const revoked = await revokeUserOAuthTokens(db, "usr_banned", now);
    expect(revoked).toEqual({ accessTokens: 1, refreshTokens: 1 });

    const refresh = Object.fromEntries((await db.select().from(schema.oauthRefreshToken)).map((t) => [t.id, t.revoked]));
    expect(refresh).toEqual({ rt_live: now, rt_old: earlier, rt_other: null });
    const access = Object.fromEntries((await db.select().from(schema.oauthAccessToken)).map((t) => [t.id, t.revoked]));
    expect(access).toEqual({ at_live: now, at_other: null });
  });

  it("is a no-op the second time", async () => {
    expect(await revokeUserOAuthTokens(db, "usr_banned")).toEqual({ accessTokens: 0, refreshTokens: 0 });
  });
});
