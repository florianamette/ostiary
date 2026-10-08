"use server";

import {
  loadSigningKeySettings,
  rotateSigningKey,
  saveSigningKeySettings,
} from "@ostiary/core/lib/signing-keys";
import {
  GRACE_PERIOD_DAYS,
  ROTATION_INTERVAL_DAYS,
  type SigningKeySettings,
} from "@ostiary/core/lib/signing-keys-policy";
import { adminActor } from "@/lib/admin-audit";
import { auth } from "@/lib/auth";

/** Errors are keys of admin.pages.signingKeys.errors, translated by the page. */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: "interval" | "grace" | "save" | "rotate" };

export async function updateSigningKeySettings(input: SigningKeySettings): Promise<Result> {
  const { session, audit } = await adminActor();
  if (!(ROTATION_INTERVAL_DAYS as readonly number[]).includes(input.rotationIntervalDays)) {
    return { ok: false, error: "interval" };
  }
  if (!(GRACE_PERIOD_DAYS as readonly number[]).includes(input.gracePeriodDays)) {
    return { ok: false, error: "grace" };
  }
  const settings: SigningKeySettings = {
    rotationIntervalDays: input.rotationIntervalDays,
    gracePeriodDays: input.gracePeriodDays,
  };
  let previous: SigningKeySettings;
  try {
    previous = await loadSigningKeySettings();
    await saveSigningKeySettings(settings, session.user.id);
  } catch (error) {
    console.error("Could not save the signing key settings", error);
    return { ok: false, error: "save" };
  }
  await audit({
    action: "signing_key.update_settings",
    metadata: { ...settings, previous },
  });
  return { ok: true };
}

export async function rotateSigningKeyNow(): Promise<Result<{ keyId: string }>> {
  const { audit } = await adminActor();
  let rotated: { keyId: string; retired: string[] };
  try {
    rotated = await rotateSigningKey(await auth.$context, await loadSigningKeySettings());
  } catch (error) {
    console.error("Could not rotate the signing key", error);
    return { ok: false, error: "rotate" };
  }
  await audit({
    action: "signing_key.rotate",
    target: { type: "signing_key", id: rotated.keyId, label: rotated.keyId },
    metadata: { retired: rotated.retired },
  });
  return { ok: true, keyId: rotated.keyId };
}
