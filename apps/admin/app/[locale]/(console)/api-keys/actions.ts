"use server";

import { getTranslations } from "next-intl/server";

import { MAX_LIFETIME_DAYS_LIMIT } from "@ostiary/core/lib/api-key-policy";
import { apiKeyAuditMetadata, apiKeyAuditTarget, deleteApiKey, saveApiKeySettings } from "@ostiary/core/lib/api-keys";
import { z } from "zod";

import { adminAction, input, type AdminActor } from "@/lib/admin-action";
import type { ActionResult } from "@/lib/action-result";


/** Turns API keys on or off for everyone and sets the longest lifetime of a new key. */
export async function updateApiKeySettings(input: { enabled: boolean; maxLifetimeDays: number }): Promise<ActionResult> {
  return adminAction(z.tuple([z.object({ enabled: z.boolean(), maxLifetimeDays: z.number() })]), [input], ([input], actor) => updateApiKeySettingsRun(input, actor));
}

async function updateApiKeySettingsRun(input: { enabled: boolean; maxLifetimeDays: number }, actor: AdminActor): Promise<ActionResult> {
  const { session, audit } = actor;
  const t = await getTranslations("admin.pages.apiKeys.errors");
  const days = input.maxLifetimeDays;
  if (typeof input.enabled !== "boolean") return { ok: false, error: t("chooseEnabled") };
  if (!Number.isInteger(days) || days < 1 || days > MAX_LIFETIME_DAYS_LIMIT) {
    return { ok: false, error: t("maxLifetimeRange", { max: String(MAX_LIFETIME_DAYS_LIMIT) }) };
  }
  const settings = { enabled: input.enabled, maxLifetimeDays: days };
  try {
    await saveApiKeySettings(settings, session.user.id);
  } catch (error) {
    console.error("Could not save the API key settings", error);
    return { ok: false, error: t("saveFailed") };
  }
  await audit({ action: "api_key.settings", metadata: settings });
  return { ok: true };
}

/** Revokes (deletes) any key, a user's or an organization's. */
export async function adminRevokeApiKey(id: string): Promise<ActionResult> {
  return adminAction(z.tuple([input.id]), [id], ([id], actor) => adminRevokeApiKeyRun(id, actor));
}

async function adminRevokeApiKeyRun(id: string, actor: AdminActor): Promise<ActionResult> {
  const { audit } = actor;
  const t = await getTranslations("admin.pages.apiKeys.errors");
  if (typeof id !== "string" || !id) return { ok: false, error: t("noKey") };
  const deleted = await deleteApiKey(id);
  if (!deleted) return { ok: false, error: t("keyGone") };
  await audit({
    action: "api_key.revoke",
    target: apiKeyAuditTarget(deleted.owner),
    metadata: apiKeyAuditMetadata(deleted),
  });
  return { ok: true };
}
