/**
 * Per-API policy, stored on the API's `oauth_resource` row: which applications may get tokens
 * for it, and the token settings Better Auth applies when it issues one (lifetimes, custom
 * claims, DPoP). Pure parsing and validation, shared by the admin console and the tests.
 */

/**
 * Access token lifetime (`oauthProvider({ accessTokenExpiresIn })`), in seconds. Machine
 * tokens (client_credentials) use Better Auth's `m2mAccessTokenExpiresIn`, also one hour.
 */
export const ACCESS_TOKEN_EXPIRES_IN = 60 * 60;

/** Refresh token lifetime: Better Auth's default `refreshTokenExpiresIn`, in seconds (30 days). */
export const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60;

/** Serialized size limit for an API's custom claims: they ride in every token for it. */
export const CUSTOM_CLAIMS_MAX_BYTES = 4096;

/**
 * Claims an API's custom claims may not set. Better Auth owns the registered JWT and OAuth
 * claims on access tokens (and drops these silently); `role` is Ostiary's own claim, which
 * resource servers authorize on, and must keep coming from the user.
 */
export const RESERVED_CLAIMS = [
  "iss",
  "sub",
  "aud",
  "exp",
  "nbf",
  "iat",
  "jti",
  "client_id",
  "azp",
  "scope",
  "sid",
  "auth_time",
  "acr",
  "amr",
  "cnf",
  "role",
] as const;

/**
 * Who may get tokens for an API: every application (the default, and the behavior before
 * per-API access existed), or only the applications linked to it (`oauth_client_resource`).
 */
export type ApiAccess = "all" | "linked";

/** Shape of `oauth_resource.metadata` for APIs managed from the admin console. */
export type OAuthResourceMetadata = { scopes?: string[]; access?: ApiAccess };

/** An API's access mode, read from its metadata. Anything but "linked" is open to all. */
export function resourceAccess(metadata: unknown): ApiAccess {
  return (metadata as OAuthResourceMetadata | null)?.access === "linked" ? "linked" : "all";
}

export type TokenSettings = {
  accessTokenTtl: number | null;
  refreshTokenTtl: number | null;
  customClaims: Record<string, unknown> | null;
  dpopBoundAccessTokensRequired: boolean;
};

export type TokenSettingsInput = {
  /** Minutes; empty for the default. */
  accessTokenMinutes: string;
  /** Days; empty for the default. */
  refreshTokenDays: string;
  /** A JSON object; empty for none. */
  customClaims: string;
  dpopRequired: boolean;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A lifetime typed in `unit`s, as whole seconds. Empty means "use the default". Better Auth
 * only ever shortens a lifetime with these (it takes the minimum with the server default),
 * so a longer value would be ignored: it is refused instead.
 */
export function parseLifetime(
  raw: string,
  { unit, unitSeconds, max, label }: { unit: string; unitSeconds: number; max: number; label: string },
): Parsed<number | null> {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  const amount = Number(text);
  const maxInUnits = max / unitSeconds;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: `${label} must be a positive number of ${unit}.` };
  }
  const seconds = Math.round(amount * unitSeconds);
  if (seconds < 60) return { ok: false, error: `${label} must be at least one minute.` };
  if (seconds > max) {
    return { ok: false, error: `${label} can be at most ${maxInUnits} ${unit}, the server default.` };
  }
  return { ok: true, value: seconds };
}

/** Custom claims typed as JSON: an object, without reserved claims, within the size limit. */
export function parseCustomClaims(raw: string): Parsed<Record<string, unknown> | null> {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Custom claims must be valid JSON, e.g. {"tenant": "acme"}.' };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: 'Custom claims must be a JSON object, e.g. {"tenant": "acme"}.' };
  }
  const claims = value as Record<string, unknown>;
  const names = Object.keys(claims);
  if (names.some((name) => !name.trim())) return { ok: false, error: "A custom claim name cannot be empty." };
  const reserved = names.filter((name) => (RESERVED_CLAIMS as readonly string[]).includes(name));
  if (reserved.length > 0) {
    const list = reserved.map((name) => `"${name}"`).join(", ");
    return {
      ok: false,
      error: `${list} ${reserved.length === 1 ? "is a reserved claim" : "are reserved claims"}: the server sets ${reserved.length === 1 ? "it" : "them"}. Reserved: ${RESERVED_CLAIMS.join(", ")}.`,
    };
  }
  if (new TextEncoder().encode(JSON.stringify(claims)).length > CUSTOM_CLAIMS_MAX_BYTES) {
    return { ok: false, error: `Custom claims are too large (${CUSTOM_CLAIMS_MAX_BYTES / 1024} KB at most): they are added to every token.` };
  }
  return { ok: true, value: names.length > 0 ? claims : null };
}

/** The token settings form, as `oauth_resource` fields for Better Auth's update endpoint. */
export function parseTokenSettings(input: TokenSettingsInput): Parsed<TokenSettings> {
  const access = parseLifetime(input.accessTokenMinutes, {
    unit: "minutes",
    unitSeconds: 60,
    max: ACCESS_TOKEN_EXPIRES_IN,
    label: "The access token lifetime",
  });
  if (!access.ok) return access;
  const refresh = parseLifetime(input.refreshTokenDays, {
    unit: "days",
    unitSeconds: 24 * 60 * 60,
    max: REFRESH_TOKEN_EXPIRES_IN,
    label: "The refresh token lifetime",
  });
  if (!refresh.ok) return refresh;
  const claims = parseCustomClaims(input.customClaims);
  if (!claims.ok) return claims;
  return {
    ok: true,
    value: {
      accessTokenTtl: access.value,
      refreshTokenTtl: refresh.value,
      customClaims: claims.value,
      dpopBoundAccessTokensRequired: input.dpopRequired,
    },
  };
}
