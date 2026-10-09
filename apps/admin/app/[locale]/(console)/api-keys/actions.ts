"use server";

import { MAX_LIFETIME_DAYS_LIMIT } from "@ostiary/core/lib/api-key-policy";
import { apiKeyAuditMetadata, apiKeyAuditTarget, deleteApiKey, saveApiKeySettings } from "@ostiary/core/lib/api-keys";
import { adminActor } from "@/lib/admin-audit";

type Result = { ok: true } | { ok: false; error: string };

/** Turns API keys on or off for everyone and sets the longest lifetime of a new key. */
export async function updateApiKeySettings(input: { enabled: boolean; maxLifetimeDays: number }): Promise<Result> {
  const { session, audit } = await adminActor();
  const days = input.maxLifetimeDays;
  if (typeof input.enabled !== "boolean") return { ok: false, error: "Choose whether API keys are on." };
  if (!Number.isInteger(days) || days < 1 || days > MAX_LIFETIME_DAYS_LIMIT) {
    return { ok: false, error: `The maximum lifetime must be a whole number of days from 1 to ${MAX_LIFETIME_DAYS_LIMIT}.` };
  }
  const settings = { enabled: input.enabled, maxLifetimeDays: days };
  try {
    await saveApiKeySettings(settings, session.user.id);
  } catch (error) {
    console.error("Could not save the API key settings", error);
    return { ok: false, error: "Could not save the settings." };
  }
  await audit({ action: "api_key.settings", metadata: settings });
  return { ok: true };
}

/** Revokes (deletes) any key, a user's or an organization's. */
export async function adminRevokeApiKey(id: string): Promise<Result> {
  const { audit } = await adminActor();
  if (typeof id !== "string" || !id) return { ok: false, error: "No key given." };
  const deleted = await deleteApiKey(id);
  if (!deleted) return { ok: false, error: "This key no longer exists." };
  await audit({
    action: "api_key.revoke",
    target: apiKeyAuditTarget(deleted.owner),
    metadata: apiKeyAuditMetadata(deleted),
  });
  return { ok: true };
}
