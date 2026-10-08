"use server";

import { adminActor } from "@/lib/admin-audit";
import { isSocialProvider, SOCIAL_PROVIDER_META, type SocialProvider } from "@ostiary/core/lib/social-provider-meta";
import {
  deleteSocialProvider,
  reorderSocialProviders,
  saveSocialProvider,
  type SocialProviderInput,
} from "@ostiary/core/lib/social-providers";

/*
 * Social sign-in providers (Google, Apple, Microsoft...). Settings live in `social_provider`,
 * secrets encrypted; the auth server picks a change up within 30 seconds, without a restart.
 * Secret values never come back to the browser and never go to the audit log: entries list
 * which fields changed.
 */

type Result = { ok: true } | { ok: false; error: string };

function target(id: SocialProvider) {
  return { type: "social_provider", id, label: SOCIAL_PROVIDER_META[id].name };
}

function strings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export async function saveProvider(id: string, input: SocialProviderInput): Promise<Result> {
  const { session, audit } = await adminActor();
  if (!isSocialProvider(id)) return { ok: false, error: "Unknown provider." };
  const secrets = Object.fromEntries(
    Object.entries(input.secrets ?? {}).filter(
      (entry): entry is [string, string | null] => typeof entry[1] === "string" || entry[1] === null,
    ),
  );
  const result = await saveSocialProvider(
    id,
    { enabled: Boolean(input.enabled), allowSignUp: input.allowSignUp !== false, config: strings(input.config), secrets },
    session.user.id,
  );
  if (!result.ok) return result;
  if (result.changed.length) {
    await audit({
      action: result.created ? "social_provider.create" : "social_provider.update",
      target: target(id),
      metadata: { changed: result.changed, enabled: Boolean(input.enabled) },
    });
  }
  return { ok: true };
}

export async function reorderProviders(ids: string[]): Promise<Result> {
  const { session, audit } = await adminActor();
  const order = ids.filter(isSocialProvider).filter((id, i, all) => all.indexOf(id) === i);
  await reorderSocialProviders(order, session.user.id);
  await audit({ action: "social_provider.reorder", metadata: { order } });
  return { ok: true };
}

export async function removeProvider(id: string): Promise<Result> {
  const { audit } = await adminActor();
  if (!isSocialProvider(id)) return { ok: false, error: "Unknown provider." };
  if (await deleteSocialProvider(id)) await audit({ action: "social_provider.delete", target: target(id) });
  return { ok: true };
}
