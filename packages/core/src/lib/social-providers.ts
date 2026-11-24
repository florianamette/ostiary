import { asc, eq } from "drizzle-orm";
import { socialProviders as builtInProviders } from "better-auth/social-providers";

import { db } from "@ostiary/core/db/index";
import { socialProvider } from "@ostiary/core/db/schema";
import { env } from "@ostiary/core/lib/env";
import { refreshingCache } from "@ostiary/core/lib/refreshing-cache";
import { openSecret, sealSecret } from "@ostiary/core/lib/secret-box";
import { getBaseURL } from "@ostiary/core/lib/url";
import {
  buildCustomProvider,
  checkDiscovery,
  CUSTOM_PROVIDER_PREFIX,
  CUSTOM_PROVIDER_SLUG,
  DEFAULT_CUSTOM_SCOPES,
  isCustomProviderId,
  type CustomProviderConfig,
} from "@ostiary/core/lib/custom-oauth-providers";
import {
  buildProviderOptions,
  providerFieldIssue,
  type ProviderFieldIssueCode,
  missingProviderFields,
  providerFieldKeys,
  type ProviderValues,
} from "@ostiary/core/lib/social-provider-config";
import {
  type GoogleOneTapConfig,
  isSocialProvider,
  SOCIAL_PROVIDER_META,
  SOCIAL_PROVIDERS,
  type SocialProvider,
  type SocialProviderOption,
} from "@ostiary/core/lib/social-provider-meta";

/*
 * Server only. Social sign-in providers come from two places:
 * - the environment (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET), read-only in the admin console;
 * - the `social_provider` table, managed from the admin console (secrets encrypted at rest).
 * A provider set in the environment ignores its row.
 *
 * Better Auth builds its providers once, at startup, into `context.socialProviders`, which
 * every social endpoint (/sign-in/social, /callback/:id, /link-social, token refresh) looks
 * up per request. Like the API scopes (oauth-scopes.ts), each instance reloads the table at
 * most every 30 seconds and swaps the providers in that list before each request (see
 * syncSocialProviders, called from the auth instance's before hook). A change made in the
 * admin console applies at once on the instance that made it and within 30 seconds elsewhere.
 *
 * Google One Tap (Better Auth's oneTap plugin) has no provider instance: its endpoint reads
 * the Google client ID, `hd` and `disableSignUp` from the auth options (`socialProviders.google`)
 * on each request. syncSocialProviders keeps those options in step with the same providers, so
 * One Tap always checks ID tokens against the client ID the admin console set.
 */

const SECRETS_PURPOSE = "social-provider";
const REFRESH_MS = 30_000;

/** Providers set in the environment, with their fields. */
function envSocialProviders(): Partial<Record<SocialProvider, ProviderValues>> {
  return {
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {}),
  };
}

/** Better Auth `socialProviders` at startup: the environment's. The database ones follow on the first request. */
export function socialProvidersConfig(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(envSocialProviders()).map(([id, values]) => [id, buildProviderOptions(id as SocialProvider, values)]),
  );
}

type ProviderInstance = { id: string; disableImplicitSignUp?: boolean };

type Loaded = {
  /** Enabled providers in display order, as offered on the sign-in page. */
  enabled: SocialProviderOption[];
  /** Better Auth provider instances for the enabled providers. */
  instances: ProviderInstance[];
  /** Better Auth options of the enabled providers (`socialProviders[id]`). */
  options: Partial<Record<SocialProvider, Record<string, unknown>>>;
  /** Google One Tap, when Google is on and its One Tap setting too. */
  oneTap: GoogleOneTapConfig | null;
};

type Row = typeof socialProvider.$inferSelect;

function decryptSecrets(row: Pick<Row, "secrets">): Record<string, string> | null {
  if (!row.secrets) return {};
  const json = openSecret(row.secrets, env.BETTER_AUTH_SECRET, SECRETS_PURPOSE);
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function instantiate(id: SocialProvider, options: Record<string, unknown>): ProviderInstance {
  const create = builtInProviders[id] as unknown as (options: Record<string, unknown>) => ProviderInstance;
  const instance = create(options);
  // As Better Auth does at startup (context/create-context).
  instance.disableImplicitSignUp = options.disableImplicitSignUp === true;
  return instance;
}

/** The sign-in button's label: the admin console's, or the provider's name. */
function buttonName(id: SocialProvider, row: Row | undefined): string {
  return row?.config.buttonName?.trim() || SOCIAL_PROVIDER_META[id].name;
}

async function loadSocialProviders(): Promise<Loaded> {
  const rows = await db.select().from(socialProvider).orderBy(asc(socialProvider.position), asc(socialProvider.id));
  const fromEnv = envSocialProviders();
  const entries: { id: SocialProvider; name: string; position: number; options: Record<string, unknown>; oneTap: boolean }[] = [];

  for (const [id, values] of Object.entries(fromEnv) as [SocialProvider, ProviderValues][]) {
    const row = rows.find((r) => r.id === id);
    entries.push({
      id,
      name: buttonName(id, row),
      position: row?.position ?? -1,
      options: buildProviderOptions(id, values, { allowSignUp: row?.allowSignUp ?? true }),
      oneTap: id === "google" && Boolean(row?.oneTap),
    });
  }
  for (const row of rows) {
    if (!row.enabled || !isSocialProvider(row.id) || row.id in fromEnv) continue;
    const secrets = decryptSecrets(row);
    if (!secrets) {
      console.error(`Social provider ${row.id}: its secrets cannot be decrypted (was BETTER_AUTH_SECRET changed?). Skipped.`);
      continue;
    }
    try {
      entries.push({
        id: row.id,
        name: buttonName(row.id, row),
        position: row.position,
        options: buildProviderOptions(row.id, { ...row.config, ...secrets }, { allowSignUp: row.allowSignUp }),
        oneTap: row.id === "google" && row.oneTap,
      });
    } catch (error) {
      console.error(`Social provider ${row.id} is enabled but cannot be used; skipped.`, error);
    }
  }
  const built: { id: string; name: string; position: number; instance: ProviderInstance }[] = [];
  const options: Loaded["options"] = {};
  let oneTap: GoogleOneTapConfig | null = null;
  for (const entry of entries) {
    try {
      built.push({ id: entry.id, name: entry.name, position: entry.position, instance: instantiate(entry.id, entry.options) });
      options[entry.id] = entry.options;
      if (entry.oneTap) oneTap = googleOneTapConfig(entry.options);
    } catch (error) {
      console.error(`Social provider ${entry.id} could not be set up; skipped.`, error);
    }
  }
  built.push(...(await loadCustomProviders(rows)));
  built.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return {
    enabled: built.map(({ id, name }) => ({ id, name })),
    instances: built.map(({ instance }) => instance),
    options,
    oneTap,
  };
}

/**
 * Custom OpenID Connect providers (custom-oauth-providers.ts). Building one fetches its
 * discovery document, so a built provider is kept until its row changes; one whose discovery
 * failed is tried again at the next reload.
 */
const customBuilt = new Map<string, { version: string; instance: ProviderInstance }>();

async function loadCustomProviders(rows: Row[]) {
  const out: { id: string; name: string; position: number; instance: ProviderInstance }[] = [];
  for (const row of rows) {
    if (!row.enabled || !isCustomProviderId(row.id)) continue;
    const version = `${row.updatedAt.toISOString()}:${row.allowSignUp}`;
    let instance = customBuilt.get(row.id)?.version === version ? customBuilt.get(row.id)!.instance : null;
    if (!instance) {
      const secrets = decryptSecrets(row);
      if (!secrets) {
        console.error("Sign-in provider %s: its secret cannot be decrypted (was BETTER_AUTH_SECRET changed?). Skipped.", row.id.replace(/[\r\n]/g, ""));
        continue;
      }
      try {
        instance = await buildCustomProvider(row.id, customConfig(row), secrets.clientSecret, { allowSignUp: row.allowSignUp }, {
          baseURL: env.AUTH_APP_URL ?? getBaseURL(),
          logger: { error: (message) => console.error(message), warn: (message) => console.warn(message) },
        });
      } catch (error) {
        console.error("Sign-in provider %s cannot be used; skipped.", row.id.replace(/[\r\n]/g, ""), error);
      }
      if (!instance) continue;
      customBuilt.set(row.id, { version, instance });
    }
    out.push({ id: row.id, name: customConfig(row).name, position: row.position, instance });
  }
  return out;
}

function customConfig(row: Pick<Row, "id" | "config">): CustomProviderConfig {
  const { name, discoveryUrl, clientId, scopes } = row.config;
  return {
    name: name?.trim() || row.id.slice(CUSTOM_PROVIDER_PREFIX.length),
    discoveryUrl: discoveryUrl ?? "",
    clientId: clientId ?? "",
    scopes: scopes?.trim() || DEFAULT_CUSTOM_SCOPES,
  };
}

/** One Tap takes Google's client ID (the first one, when several are listed for other platforms). */
function googleOneTapConfig(options: Record<string, unknown>): GoogleOneTapConfig | null {
  const raw = options.clientId;
  const clientId = (Array.isArray(raw) ? raw[0] : raw) as unknown;
  return typeof clientId === "string" && clientId.trim() ? { clientId: clientId.trim() } : null;
}

/** The environment's providers alone, while the database cannot be read. */
function environmentOnly(): Loaded {
  const entries = Object.entries(envSocialProviders()) as [SocialProvider, ProviderValues][];
  return {
    enabled: entries.map(([id]) => ({ id, name: SOCIAL_PROVIDER_META[id].name })),
    instances: entries.map(([id, values]) => instantiate(id, buildProviderOptions(id, values))),
    options: Object.fromEntries(entries.map(([id, values]) => [id, buildProviderOptions(id, values)])),
    // One Tap is a database setting: off until the table can be read.
    oneTap: null,
  };
}

/**
 * The providers, reloaded from the database when the cached copy is older than 30 seconds.
 * While the table cannot be read, the previous providers are kept (the environment's until a
 * first load).
 */
const cache = refreshingCache<Loaded>({
  globalKey: "__ostiarySocialProviders",
  refreshMs: REFRESH_MS,
  initial: { enabled: [], instances: [], options: {}, oneTap: null },
  load: loadSocialProviders,
  fallback: environmentOnly,
  loadError: "Could not load the social sign-in providers",
});

function currentSocialProviders(): Promise<Loaded> {
  return cache.get();
}

/** Makes the next request reload the providers (after an admin change). */
function invalidateSocialProviders() {
  cache.invalidate();
}

/** Google One Tap's settings for the sign-in and sign-up pages, or null when it is off. */
export async function googleOneTap(): Promise<GoogleOneTapConfig | null> {
  return (await currentSocialProviders()).oneTap;
}

/** Providers the sign-in, sign-up and account pages offer, in display order. */
export async function enabledSocialProviders(): Promise<SocialProviderOption[]> {
  return (await currentSocialProviders()).enabled;
}

const BUILT_IN = new Set<string>(SOCIAL_PROVIDERS);

type SyncedContext = {
  socialProviders: unknown[];
  options: { socialProviders?: Record<string, unknown> };
};

/**
 * Replaces the built-in social providers in Better Auth's context with the current ones. The
 * list is changed in place: each request's context is a shallow copy sharing it. Providers
 * added by plugins (ids Better Auth does not ship) are kept.
 *
 * The options' `socialProviders` get the same providers' options, also in place (the options
 * object is shared by every request too). Better Auth only reads them at startup, except the
 * One Tap endpoint, which takes Google's client ID, `hd` and sign-up setting from there.
 */
export async function syncSocialProviders(context: SyncedContext) {
  const { instances, options } = await currentSocialProviders();
  syncProviderOptions(context.options, options);
  const list = context.socialProviders as ProviderInstance[];
  const others = list.filter((p) => !BUILT_IN.has(p.id) && !isCustomProviderId(p.id));
  const next = [...instances, ...others];
  if (next.length === list.length && next.every((p, i) => p === list[i])) return;
  list.splice(0, list.length, ...next);
}

/** Sets `authOptions.socialProviders` to `current`, in place, for the built-in providers. */
export function syncProviderOptions(
  authOptions: SyncedContext["options"],
  current: Partial<Record<string, Record<string, unknown>>>,
) {
  const target = (authOptions.socialProviders ??= {});
  for (const id of Object.keys(target)) {
    if (BUILT_IN.has(id) && !(id in current)) delete target[id];
  }
  for (const [id, value] of Object.entries(current)) {
    if (!value) continue;
    // One Tap reads `disableSignUp` (the buttons, `disableImplicitSignUp`): the provider's
    // "Create accounts for new users" setting applies to both.
    target[id] = value.disableImplicitSignUp ? { ...value, disableSignUp: true } : value;
  }
}

// --- Admin console -------------------------------------------------------------------------

export type SocialProviderAdminView = {
  id: SocialProvider;
  /** "environment": set by environment variables, read-only. */
  source: "environment" | "database" | null;
  enabled: boolean;
  position: number;
  allowSignUp: boolean;
  /** Google only: Google One Tap on the sign-in and sign-up pages. */
  oneTap: boolean;
  /** Non-secret fields (and the button name). */
  config: Record<string, string>;
  /** Secret fields that have a value. The values never leave the server. */
  secretsSet: string[];
  /** The stored secrets cannot be decrypted (BETTER_AUTH_SECRET changed): enter them again. */
  secretsUnreadable: boolean;
  missing: string[];
  updatedAt: Date | null;
};

/** Every provider with its settings, for the admin console. No secret values. */
export async function listSocialProviderSettings(): Promise<SocialProviderAdminView[]> {
  const rows = await db.select().from(socialProvider);
  const fromEnv = envSocialProviders();
  return SOCIAL_PROVIDERS.map((id) => {
    const row = rows.find((r) => r.id === id);
    const envValues = fromEnv[id];
    if (envValues) {
      const { plain, secret } = providerFieldKeys(id);
      return {
        id,
        source: "environment",
        enabled: true,
        position: row?.position ?? -1,
        allowSignUp: row?.allowSignUp ?? true,
        oneTap: Boolean(row?.oneTap),
        config: Object.fromEntries(plain.filter((k) => envValues[k]).map((k) => [k, envValues[k]!])),
        secretsSet: secret.filter((k) => envValues[k]),
        secretsUnreadable: false,
        missing: [],
        updatedAt: null,
      };
    }
    const secrets = row ? decryptSecrets(row) : {};
    const config = row?.config ?? {};
    return {
      id,
      source: row ? "database" : null,
      enabled: Boolean(row?.enabled),
      position: row?.position ?? 0,
      allowSignUp: row?.allowSignUp ?? true,
      oneTap: Boolean(row?.oneTap),
      config,
      secretsSet: Object.keys(secrets ?? {}).filter((k) => secrets?.[k]),
      secretsUnreadable: secrets === null,
      missing: missingProviderFields(id, { ...config, ...(secrets ?? {}) }),
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export type SocialProviderInput = {
  enabled: boolean;
  allowSignUp: boolean;
  /** Google only (ignored for other providers): offer Google One Tap. */
  oneTap?: boolean;
  /** Non-secret fields; missing keys are cleared. */
  config: Record<string, string>;
  /**
   * Secret fields: a value replaces the stored one, `null` clears it, and a missing key keeps it.
   */
  secrets: Record<string, string | null>;
};

/**
 * Why a save was refused. `error` is in English; `code` (with `fields` or `field` and
 * `options`) lets the admin console translate it. No code: `error` comes from Better Auth.
 */
export type SaveErrorCode = ProviderFieldIssueCode | "envManaged" | "missingFields" | "unusable";

export type SaveResult =
  | { ok: true; changed: string[]; created: boolean }
  | { ok: false; error: string; code?: SaveErrorCode; field?: string; fields?: string[]; options?: readonly string[] };

/**
 * Validates and stores a provider's settings, merging secrets with the stored ones. Returns
 * the names of the changed fields (for the audit log; never their secret values).
 */
export async function saveSocialProvider(
  id: SocialProvider,
  input: SocialProviderInput,
  updatedBy: string | null,
): Promise<SaveResult> {
  if (id in envSocialProviders()) {
    return {
      ok: false,
      error: "This provider is set by environment variables. Change them, or remove them to manage it here.",
      code: "envManaged",
    };
  }
  const { plain, secret } = providerFieldKeys(id);
  const [row] = await db.select().from(socialProvider).where(eq(socialProvider.id, id)).limit(1);
  const stored = row ? decryptSecrets(row) : {};

  const config: Record<string, string> = {};
  for (const key of plain) {
    const value = input.config[key]?.trim();
    if (value) config[key] = value;
  }
  const secrets = mergeSecrets(stored, input.secrets, secret);

  const values = { ...config, ...secrets };
  const issue = providerFieldIssue(id, values);
  if (issue) return { ok: false, error: issue.message, code: issue.code, field: issue.field, options: issue.options };
  if (input.enabled) {
    const missing = missingProviderFields(id, values);
    if (missing.length) {
      const labels = SOCIAL_PROVIDER_META[id].fields.filter((f) => missing.includes(f.key)).map((f) => f.label);
      return { ok: false, error: `Fill in ${labels.join(", ")} before turning it on.`, code: "missingFields", fields: missing };
    }
    try {
      instantiate(id, buildProviderOptions(id, values, { allowSignUp: input.allowSignUp }));
    } catch (error) {
      return error instanceof Error
        ? { ok: false, error: error.message }
        : { ok: false, error: "These settings cannot be used.", code: "unusable" };
    }
  }

  const oneTap = id === "google" && input.oneTap === true;
  const changed = [
    ...plain.filter((k) => (row?.config[k] ?? "") !== (config[k] ?? "")),
    ...secret.filter((k) => (stored?.[k] ?? "") !== (secrets[k] ?? "")),
    ...(Boolean(row?.enabled) !== input.enabled ? ["enabled"] : []),
    ...((row?.allowSignUp ?? true) !== input.allowSignUp ? ["allowSignUp"] : []),
    ...(Boolean(row?.oneTap) !== oneTap ? ["oneTap"] : []),
  ];
  const sealed = Object.keys(secrets).length
    ? sealSecret(JSON.stringify(secrets), env.BETTER_AUTH_SECRET, SECRETS_PURPOSE)
    : null;
  const now = new Date();
  const fields = { config, secrets: sealed, enabled: input.enabled, allowSignUp: input.allowSignUp, oneTap, updatedAt: now, updatedBy };
  if (row) {
    await db.update(socialProvider).set(fields).where(eq(socialProvider.id, id));
  } else {
    // New providers go last on the sign-in page.
    const rows = await db.select({ position: socialProvider.position }).from(socialProvider);
    const position = rows.reduce((max, r) => Math.max(max, r.position + 1), 0);
    await db.insert(socialProvider).values({ id, position, ...fields, createdAt: now });
  }
  invalidateSocialProviders();
  return { ok: true, changed, created: !row };
}

/**
 * The stored secrets with the input's changes (see SocialProviderInput), limited to `keys`.
 * Unreadable secrets (another BETTER_AUTH_SECRET) are dropped: they must be entered again.
 */
function mergeSecrets(
  stored: Record<string, string> | null,
  input: SocialProviderInput["secrets"],
  keys: string[],
): Record<string, string> {
  const secrets: Record<string, string> = { ...(stored ?? {}) };
  for (const key of keys) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === null) delete secrets[key];
    else if (value.trim()) secrets[key] = key === "privateKey" ? value.trim() + "\n" : value.trim();
  }
  for (const key of Object.keys(secrets)) if (!keys.includes(key)) delete secrets[key];
  return secrets;
}

/** Display order: `ids` first, in that order (environment providers too), then the rest. */
export async function reorderSocialProviders(ids: SocialProvider[], updatedBy: string | null): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx
        .insert(socialProvider)
        .values({ id, position, updatedAt: now, updatedBy })
        .onConflictDoUpdate({ target: socialProvider.id, set: { position, updatedAt: now, updatedBy } });
    }
  });
  invalidateSocialProviders();
}

/** Forgets a provider's settings (and turns it off). Returns whether there was a row. */
export async function deleteSocialProvider(id: SocialProvider): Promise<boolean> {
  const deleted = await db.delete(socialProvider).where(eq(socialProvider.id, id)).returning({ id: socialProvider.id });
  invalidateSocialProviders();
  return deleted.length > 0;
}

// --- Custom OpenID Connect providers (admin console) ----------------------------------------

export type CustomProviderAdminView = {
  id: string;
  enabled: boolean;
  allowSignUp: boolean;
  position: number;
  name: string;
  discoveryUrl: string;
  clientId: string;
  scopes: string;
  /** A client secret is stored. Its value never leaves the server. */
  secretSet: boolean;
  /** The secret cannot be decrypted (BETTER_AUTH_SECRET changed): enter it again. */
  secretUnreadable: boolean;
  /** The redirect URI to register at the provider. */
  callbackUrl: string;
  updatedAt: Date;
};

function callbackUrl(id: string): string {
  return `${env.AUTH_APP_URL ?? getBaseURL()}/api/auth/callback/${id}`;
}

/** The custom providers, in display order. No secret values. */
export async function listCustomProviders(): Promise<CustomProviderAdminView[]> {
  const rows = await db.select().from(socialProvider).orderBy(asc(socialProvider.position), asc(socialProvider.id));
  return rows
    .filter((row) => isCustomProviderId(row.id))
    .map((row) => {
      const secrets = decryptSecrets(row);
      return {
        id: row.id,
        enabled: row.enabled,
        allowSignUp: row.allowSignUp,
        position: row.position,
        ...customConfig(row),
        secretSet: Boolean(secrets?.clientSecret),
        secretUnreadable: secrets === null,
        callbackUrl: callbackUrl(row.id),
        updatedAt: row.updatedAt,
      };
    });
}

/** The callback URL a new provider with this slug would have, for the add dialog. */
export function customProviderCallbackUrl(slug: string): string {
  return callbackUrl(`${CUSTOM_PROVIDER_PREFIX}${slug}`);
}

export type CustomProviderInput = {
  /** New provider: its slug (the id is `oidc-<slug>`). Ignored when updating. */
  slug?: string;
  name: string;
  discoveryUrl: string;
  clientId: string;
  /** A value replaces the stored secret, `null` clears it, undefined keeps it. */
  clientSecret?: string | null;
  scopes?: string;
  enabled: boolean;
  allowSignUp: boolean;
};

export type CustomProviderSaveResult = { ok: true; id: string; changed: string[]; created: boolean } | { ok: false; error: string };

/**
 * Creates (`id` null) or updates a custom provider. Turning one on checks its discovery
 * document (custom-oauth-providers.ts) and builds it with Better Auth first.
 */
export async function saveCustomProvider(
  id: string | null,
  input: CustomProviderInput,
  updatedBy: string | null,
): Promise<CustomProviderSaveResult> {
  if (id === null) {
    const slug = input.slug?.trim().toLowerCase() ?? "";
    if (!CUSTOM_PROVIDER_SLUG.test(slug)) {
      return { ok: false, error: "The ID must be 1 to 32 lowercase letters, digits or hyphens, starting and ending with a letter or digit." };
    }
    id = `${CUSTOM_PROVIDER_PREFIX}${slug}`;
  } else if (!isCustomProviderId(id)) {
    return { ok: false, error: "Not a custom provider." };
  }
  const [row] = await db.select().from(socialProvider).where(eq(socialProvider.id, id)).limit(1);
  if (!row && input.slug === undefined) return { ok: false, error: "Provider not found." };
  if (row && input.slug !== undefined) return { ok: false, error: "A provider with this ID already exists." };

  const config: CustomProviderConfig = {
    name: input.name.trim(),
    discoveryUrl: input.discoveryUrl.trim(),
    clientId: input.clientId.trim(),
    scopes: input.scopes?.trim().split(/\s+/).filter(Boolean).join(" ") || DEFAULT_CUSTOM_SCOPES,
  };
  if (!config.name || config.name.length > 40) return { ok: false, error: "Enter a button name of at most 40 characters." };
  if (!config.clientId) return { ok: false, error: "Enter the client ID." };
  if (!config.scopes.split(" ").includes("openid")) return { ok: false, error: "The scopes must include openid." };

  const stored = row ? decryptSecrets(row) ?? {} : {};
  const secrets: Record<string, string> = { ...stored };
  if (input.clientSecret === null) delete secrets.clientSecret;
  else if (input.clientSecret?.trim()) secrets.clientSecret = input.clientSecret.trim();

  if (input.enabled) {
    const discovery = await checkDiscovery(config.discoveryUrl);
    if (!discovery.ok) return { ok: false, error: discovery.error };
    const built = await buildCustomProvider(id, config, secrets.clientSecret, { allowSignUp: input.allowSignUp }, {
      baseURL: env.AUTH_APP_URL ?? getBaseURL(),
      logger: { error: (message) => console.error(message), warn: (message) => console.warn(message) },
    }).catch((error: unknown) => {
      // The id is checked (CUSTOM_PROVIDER_SLUG); a constant format string all the same.
      console.error("Sign-in provider %s cannot be used", id.replace(/[\r\n]/g, ""), error);
      return null;
    });
    if (!built) return { ok: false, error: "These settings cannot be used: the provider's discovery document did not give a usable OpenID Connect configuration." };
  }

  const before: Partial<CustomProviderConfig> = row ? customConfig(row) : {};
  const changed = [
    ...(Object.keys(config) as (keyof CustomProviderConfig)[]).filter((key) => before[key] !== config[key]),
    ...((stored.clientSecret ?? "") !== (secrets.clientSecret ?? "") ? ["clientSecret"] : []),
    ...(Boolean(row?.enabled) !== input.enabled ? ["enabled"] : []),
    ...((row?.allowSignUp ?? true) !== input.allowSignUp ? ["allowSignUp"] : []),
  ];
  const sealed = secrets.clientSecret ? sealSecret(JSON.stringify(secrets), env.BETTER_AUTH_SECRET, SECRETS_PURPOSE) : null;
  const now = new Date();
  const fields = { config, secrets: sealed, enabled: input.enabled, allowSignUp: input.allowSignUp, oneTap: false, updatedAt: now, updatedBy };
  if (row) {
    await db.update(socialProvider).set(fields).where(eq(socialProvider.id, id));
  } else {
    const rows = await db.select({ position: socialProvider.position }).from(socialProvider);
    const position = rows.reduce((max, r) => Math.max(max, r.position + 1), 0);
    await db.insert(socialProvider).values({ id, position, ...fields, createdAt: now });
  }
  invalidateSocialProviders();
  return { ok: true, id, changed, created: !row };
}

/** Removes a custom provider. Accounts linked through it stay, but can no longer sign in with it. */
export async function deleteCustomProvider(id: string): Promise<boolean> {
  if (!isCustomProviderId(id)) return false;
  const deleted = await db.delete(socialProvider).where(eq(socialProvider.id, id)).returning({ id: socialProvider.id });
  invalidateSocialProviders();
  return deleted.length > 0;
}
