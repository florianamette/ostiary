"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { db } from "@ostiary/core/db/index";
import { oauthAccessToken, oauthConsent, oauthRefreshToken, user } from "@ostiary/core/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { adminActor } from "@/lib/admin-audit";

/**
 * Revokes a person's consent to an OAuth client, from the console: the grant goes, and so do
 * the client's tokens for that person, as when they disconnect the app from their account.
 * The app has to ask them again (consent screen) to get new ones.
 */
export async function revokeConsent(consentId: unknown): Promise<ActionResult> {
  const { audit } = await adminActor();
  const t = await getTranslations("admin.pages.consent.rowActions");
  if (typeof consentId !== "string" || !consentId) return { ok: false, error: t("revokeFailed") };

  const [row] = await db
    .select({ clientId: oauthConsent.clientId, userId: oauthConsent.userId, email: user.email })
    .from(oauthConsent)
    .leftJoin(user, eq(user.id, oauthConsent.userId))
    .where(eq(oauthConsent.id, consentId));
  if (!row) return { ok: false, error: t("notFound") };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(oauthConsent).where(eq(oauthConsent.id, consentId));
    if (!row.userId) return;
    await tx
      .update(oauthRefreshToken)
      .set({ revoked: now })
      .where(
        and(
          eq(oauthRefreshToken.userId, row.userId),
          eq(oauthRefreshToken.clientId, row.clientId),
          isNull(oauthRefreshToken.revoked),
        ),
      );
    await tx
      .update(oauthAccessToken)
      .set({ revoked: now })
      .where(
        and(
          eq(oauthAccessToken.userId, row.userId),
          eq(oauthAccessToken.clientId, row.clientId),
          isNull(oauthAccessToken.revoked),
        ),
      );
  });

  await audit({
    action: "oauth_consent.delete",
    target: row.userId
      ? { type: "user", id: row.userId, label: row.email }
      : { type: "oauth_client", id: row.clientId, label: row.clientId },
    metadata: { client: row.clientId, consent: consentId },
  });
  return { ok: true };
}
