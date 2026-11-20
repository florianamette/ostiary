"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@ostiary/core/db/index";
import { oauthClient } from "@ostiary/core/db/schema";
import { clientClaimsSchema, validateClientClaims, type ClientClaim } from "@ostiary/core/lib/client-claims/policy";
import { getClientClaims, saveClientClaims } from "@ostiary/core/lib/client-claims/store";

import { adminAction, input, type AdminActor } from "@/lib/admin-action";

/*
 * Custom claims in an application's tokens (lib/client-claims). Admin-registered clients only,
 * like branding: a self-registered client was never reviewed by an admin.
 */

export type ClaimsDialogData = { clientName: string; claims: ClientClaim[]; updatedAt: string | null };

type Failure = { ok: false; error: string };

async function adminClient(clientId: string) {
  const t = await getTranslations("admin.pages.applications.actions.claims");
  const [row] = await db
    .select({ name: oauthClient.name, adminRegistered: oauthClient.adminRegistered })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  if (!row) return { ok: false as const, error: t("clientGone") };
  if (!row.adminRegistered) return { ok: false as const, error: t("selfRegistered") };
  return { ok: true as const, name: row.name ?? clientId };
}

export async function loadClientClaims(clientId: string): Promise<{ ok: true; data: ClaimsDialogData } | Failure> {
  return adminAction(z.tuple([input.id]), [clientId], ([clientId]) => loadClientClaimsRun(clientId));
}

async function loadClientClaimsRun(clientId: string): Promise<{ ok: true; data: ClaimsDialogData } | Failure> {
  const client = await adminClient(clientId);
  if (!client.ok) return client;
  const stored = await getClientClaims(clientId);
  return { ok: true, data: { clientName: client.name, ...stored } };
}

export async function saveClientClaimsAction(clientId: string, claims: ClientClaim[]): Promise<{ ok: true; claims: ClientClaim[] } | Failure> {
  return adminAction(z.tuple([input.id, clientClaimsSchema]), [clientId, claims], ([clientId, claims], actor) =>
    saveClientClaimsRun(clientId, claims, actor),
  );
}

async function saveClientClaimsRun(clientId: string, claims: unknown, actor: AdminActor): Promise<{ ok: true; claims: ClientClaim[] } | Failure> {
  const { session, audit } = actor;
  const client = await adminClient(clientId);
  if (!client.ok) return client;
  const parsed = validateClientClaims(claims);
  if (!parsed.ok) {
    const t = await getTranslations("admin.pages.applications.claimsErrors");
    return { ok: false, error: t(parsed.issue.code, parsed.issue.values) };
  }
  const before = await getClientClaims(clientId);
  try {
    await saveClientClaims(clientId, parsed.value, session.user.id);
  } catch (error) {
    console.error("Could not save the client claims", error);
    const t = await getTranslations("admin.pages.applications.actions.claims");
    return { ok: false, error: t("saveFailed") };
  }
  // Names, tokens and sources only: a static value may be something the admin would rather
  // not copy into the audit log.
  const summary = (list: ClientClaim[]) =>
    list.map((claim) => ({
      name: claim.name,
      tokens: claim.tokens,
      source: claim.source === "attribute" ? claim.attribute : "static",
    }));
  await audit({
    action: "oauth_client.claims_update",
    target: { type: "oauth_client", id: clientId, label: client.name },
    metadata: { before: summary(before.claims), after: summary(parsed.value) },
  });
  return { ok: true, claims: parsed.value };
}
