"use server";

import { getFormatter, getTranslations } from "next-intl/server";

import { adminActor } from "@/lib/admin-audit";
import { isSocialProvider, SOCIAL_PROVIDER_META, type SocialProvider } from "@ostiary/core/lib/social-provider-meta";
import {
  deleteSocialProvider,
  reorderSocialProviders,
  saveSocialProvider,
  type SaveResult,
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

/** A refused save, in the admin's language when the core gave a code (Better Auth's errors stay as they are). */
async function saveError(id: SocialProvider, result: Extract<SaveResult, { ok: false }>): Promise<string> {
  if (!result.code) return result.error;
  const t = await getTranslations("admin.pages.signInProviders");
  const format = await getFormatter();
  const label = (key: string) => {
    const translated = `providers.${id}.fields.${key}.label`;
    return t.has(translated) ? t(translated) : (SOCIAL_PROVIDER_META[id].fields.find((f) => f.key === key)?.label ?? key);
  };
  switch (result.code) {
    case "invalidOption":
      return t("errors.invalidOption", {
        field: label(result.field ?? ""),
        options: format.list(result.options ?? [], { type: "disjunction" }),
      });
    case "missingFields":
      return t("errors.missingFields", { fields: format.list((result.fields ?? []).map(label), { type: "unit" }) });
    default:
      return t(`errors.${result.code}`);
  }
}

export async function saveProvider(id: string, input: SocialProviderInput): Promise<Result> {
  const { session, audit } = await adminActor();
  if (!isSocialProvider(id)) return { ok: false, error: (await getTranslations("admin.pages.signInProviders"))("errors.unknownProvider") };
  const secrets = Object.fromEntries(
    Object.entries(input.secrets ?? {}).filter(
      (entry): entry is [string, string | null] => typeof entry[1] === "string" || entry[1] === null,
    ),
  );
  const result = await saveSocialProvider(
    id,
    {
      enabled: Boolean(input.enabled),
      allowSignUp: input.allowSignUp !== false,
      oneTap: input.oneTap === true,
      config: strings(input.config),
      secrets,
    },
    session.user.id,
  );
  if (!result.ok) return { ok: false, error: await saveError(id, result) };
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
  if (!isSocialProvider(id)) return { ok: false, error: (await getTranslations("admin.pages.signInProviders"))("errors.unknownProvider") };
  if (await deleteSocialProvider(id)) await audit({ action: "social_provider.delete", target: target(id) });
  return { ok: true };
}
