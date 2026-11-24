"use server";

import { getFormatter, getTranslations } from "next-intl/server";

import { z } from "zod";

import { adminAction, input, type AdminActor } from "@/lib/admin-action";
import { isSocialProvider, SOCIAL_PROVIDER_META, type SocialProvider } from "@ostiary/core/lib/social-provider-meta";
import {
  deleteCustomProvider,
  deleteSocialProvider,
  reorderSocialProviders,
  saveCustomProvider,
  saveSocialProvider,
  type CustomProviderInput,
  type SaveResult,
  type SocialProviderInput,
} from "@ostiary/core/lib/social-providers";
import { isCustomProviderId } from "@ostiary/core/lib/custom-oauth-providers";
import type { ActionResult } from "@/lib/action-result";

/*
 * Social sign-in providers (Google, Apple, Microsoft...). Settings live in `social_provider`,
 * secrets encrypted; the auth server picks a change up within 30 seconds, without a restart.
 * Secret values never come back to the browser and never go to the audit log: entries list
 * which fields changed.
 */

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

const saveInput = z.tuple([
      input.id,
      z.object({
        enabled: z.boolean(),
        allowSignUp: z.boolean(),
        oneTap: z.boolean().optional(),
        config: z.record(z.string().max(100), z.string().max(10_000)),
        secrets: z.record(z.string().max(100), z.string().max(10_000).nullable()),
      }),
    ]);

export async function saveProvider(id: string, input: SocialProviderInput): Promise<ActionResult> {
  return adminAction(saveInput, [id, input], ([id, input], actor) => saveProviderRun(id, input, actor));
}

async function saveProviderRun(id: string, input: SocialProviderInput, actor: AdminActor): Promise<ActionResult> {
  const { session, audit } = actor;
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

const reorderInput = z.tuple([z.array(z.string().max(100)).max(200)]);

export async function reorderProviders(ids: string[]): Promise<ActionResult> {
  return adminAction(reorderInput, [ids], ([ids], actor) => reorderProvidersRun(ids, actor));
}

async function reorderProvidersRun(ids: string[], actor: AdminActor): Promise<ActionResult> {
  const { session, audit } = actor;
  const order = ids.filter(isSocialProvider).filter((id, i, all) => all.indexOf(id) === i);
  await reorderSocialProviders(order, session.user.id);
  await audit({ action: "social_provider.reorder", metadata: { order } });
  return { ok: true };
}

const providerInput = z.tuple([input.id]);

export async function removeProvider(id: string): Promise<ActionResult> {
  return adminAction(providerInput, [id], ([id], actor) => removeProviderRun(id, actor));
}

async function removeProviderRun(id: string, actor: AdminActor): Promise<ActionResult> {
  const { audit } = actor;
  if (!isSocialProvider(id)) return { ok: false, error: (await getTranslations("admin.pages.signInProviders"))("errors.unknownProvider") };
  if (await deleteSocialProvider(id)) await audit({ action: "social_provider.delete", target: target(id) });
  return { ok: true };
}

// --- Custom OpenID Connect providers ---------------------------------------------------------

const customInput = z.tuple([
  input.id.nullable(),
  z.object({
    slug: z.string().max(64).optional(),
    name: z.string().max(200),
    discoveryUrl: z.string().max(2_000),
    clientId: z.string().max(1_000),
    clientSecret: z.string().max(10_000).nullable().optional(),
    scopes: z.string().max(1_000).optional(),
    enabled: z.boolean(),
    allowSignUp: z.boolean(),
  }).strict(),
]);

/** Adds (`id` null) or updates a custom OpenID Connect provider. */
export async function saveCustomProviderAction(id: string | null, provider: CustomProviderInput): Promise<ActionResult<{ id: string }>> {
  return adminAction(customInput, [id, provider], async ([id, provider], { session, audit }): Promise<ActionResult<{ id: string }>> => {
    const result = await saveCustomProvider(id, provider, session.user.id);
    if (!result.ok) return { ok: false, error: result.error };
    if (result.changed.length) {
      await audit({
        action: result.created ? "social_provider.create" : "social_provider.update",
        target: { type: "social_provider", id: result.id, label: provider.name.trim() },
        metadata: { changed: result.changed, enabled: provider.enabled, custom: true },
      });
    }
    return { ok: true, id: result.id };
  });
}

export async function removeCustomProviderAction(id: string): Promise<ActionResult> {
  return adminAction(providerInput, [id], async ([id], { audit }): Promise<ActionResult> => {
    if (!isCustomProviderId(id)) return { ok: false, error: (await getTranslations("admin.pages.signInProviders"))("errors.unknownProvider") };
    if (await deleteCustomProvider(id)) await audit({ action: "social_provider.delete", target: { type: "social_provider", id, label: id } });
    return { ok: true };
  });
}
