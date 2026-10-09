import { createHmac, timingSafeEqual } from "node:crypto";

import { APP_CONTEXT_PARAM } from "@ostiary/core/lib/app-branding/constants";

/*
 * Which application a sign-in screen is for, from parameters this server signed itself.
 *
 * Better Auth's OAuth provider redirects to /login, /consent and /select-account with the
 * authorization request in the query, plus `exp`, `ba_iat`, `ba_param` (the signed parameter
 * names) and `sig`, an HMAC-SHA256 of the canonical query under the server secret. Only a
 * query with a valid signature and a signed `client_id` names an app: a bare `?client_id=` is
 * ignored, so nobody can dress the sign-in page in another app's colors by editing a link.
 *
 * Screens the request does not reach by itself (sign-up, password reset, the email link
 * back) carry an app context token instead (`app=`), minted here from a verified request:
 * the client and the authorization request to resume, HMAC-signed with a key derived from
 * the same secret, valid for APP_CONTEXT_TTL_SECONDS. It never goes in an OAuth request
 * body, so an expired token can only cost the colors, never break a sign-in or sign-up.
 */

export { APP_CONTEXT_PARAM };
/** How long a token is honoured: covers a password reset or verification email (1 hour). */
export const APP_CONTEXT_TTL_SECONDS = 2 * 60 * 60;
/**
 * A signed request past its `exp` still names the app it was signed for, so the screen keeps
 * the app's look for a while (Better Auth refuses the request itself once expired).
 */
export const SIGNED_QUERY_BRANDING_GRACE_SECONDS = 60 * 60;

const SIGNED_PARAM_NAMES = "ba_param";
/** Parameters Better Auth adds when it signs a request; not part of the request to resume. */
const SIGNING_PARAMS = new Set(["sig", "exp", "ba_iat", "ba_pl", SIGNED_PARAM_NAMES]);

export type AppContextSource = "signed_query" | "token";

export type VerifiedAppContext = {
  clientId: string;
  /** The authorization request (no signing parameters), to resume the flow after sign-up. */
  authorizeQuery: string;
  source: AppContextSource;
};

type QueryInput = URLSearchParams | string | Record<string, string | string[] | undefined>;

export function toSearchParams(input: QueryInput): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  return params;
}

/** Same order as Better Auth's canonicalizeOAuthQueryParams: by key, then by value. */
function canonicalize(params: URLSearchParams): string {
  const sorted = [...params.entries()].sort(([ka, va], [kb, vb]) =>
    ka < kb ? -1 : ka > kb ? 1 : va < vb ? -1 : va > vb ? 1 : 0,
  );
  const out = new URLSearchParams();
  for (const [key, value] of sorted) out.append(key, value);
  return out.toString();
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Better Auth's makeSignature: base64 HMAC-SHA256 under the raw secret. */
function betterAuthSignature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64");
}

/**
 * The signed subset of a page's query (Better Auth's buildSignedOAuthQuery): the parameters
 * listed in `ba_param`, plus `sig` and `ba_param`. Extra parameters (callbackURL, addAccount)
 * are dropped. Null when the query is not a signed OAuth request.
 */
export function signedOAuthQuery(input: QueryInput): URLSearchParams | null {
  const params = toSearchParams(input);
  if (!params.has("sig")) return null;
  const names = new Set(params.getAll(SIGNED_PARAM_NAMES));
  if (names.size === 0) return null;
  const signed = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === "sig" || key === SIGNED_PARAM_NAMES || names.has(key)) signed.append(key, value);
  }
  return signed;
}

/**
 * The client of a signed OAuth request, when the signature is valid and `client_id` is one
 * of the signed parameters. `exp` may be up to SIGNED_QUERY_BRANDING_GRACE_SECONDS past.
 */
export function verifySignedOAuthQuery(
  input: QueryInput,
  secret: string,
  now: number = Date.now(),
): VerifiedAppContext | null {
  const signed = signedOAuthQuery(input);
  if (!signed) return null;
  const sigs = signed.getAll("sig");
  if (sigs.length !== 1) return null;
  const names = new Set(signed.getAll(SIGNED_PARAM_NAMES));
  // ba_param lists itself; client_id must be covered, and appear exactly once.
  if (!names.has(SIGNED_PARAM_NAMES) || !names.has("client_id") || !names.has("exp")) return null;
  const clientIds = signed.getAll("client_id");
  if (clientIds.length !== 1 || !clientIds[0]) return null;
  const exp = Number(signed.get("exp"));
  if (!Number.isFinite(exp) || exp * 1000 + SIGNED_QUERY_BRANDING_GRACE_SECONDS * 1000 < now) return null;

  const unsigned = new URLSearchParams(signed);
  unsigned.delete("sig");
  if (!safeEqual(sigs[0]!, betterAuthSignature(canonicalize(unsigned), secret))) return null;

  return { clientId: clientIds[0], authorizeQuery: authorizeQueryOf(unsigned), source: "signed_query" };
}

/**
 * The authorization request to send again after an interruption (sign-up and email
 * verification, password reset): the signed parameters without Better Auth's signing ones,
 * and without `prompt=login` / `prompt=create`, which the user has just satisfied.
 */
export function authorizeQueryOf(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (SIGNING_PARAMS.has(key)) continue;
    if (key === "prompt") {
      const kept = value.split(/\s+/).filter((p) => p && p !== "login" && p !== "create");
      if (kept.length) out.append(key, kept.join(" "));
      continue;
    }
    out.append(key, value);
  }
  return out.toString();
}

/** Same-origin path that restarts the authorization request (Better Auth signs it again). */
export function resumeAuthorizePath(authorizeQuery: string): string {
  return `/api/auth/oauth2/authorize?${authorizeQuery}`;
}

function tokenKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("ostiary:app-context:v1").digest();
}

function tokenMac(payload: string, secret: string): string {
  return createHmac("sha256", tokenKey(secret)).update(payload).digest("base64url");
}

type TokenPayload = { c: string; q: string; e: number };

/** A token for screens the signed request does not reach (see the top of this file). */
export function createAppContextToken(
  context: Pick<VerifiedAppContext, "clientId" | "authorizeQuery">,
  secret: string,
  now: number = Date.now(),
): string {
  const payload: TokenPayload = {
    c: context.clientId,
    q: context.authorizeQuery,
    e: Math.floor(now / 1000) + APP_CONTEXT_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${tokenMac(encoded, secret)}`;
}

export function verifyAppContextToken(
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): VerifiedAppContext | null {
  if (!token || token.length > 8192) return null;
  const [encoded, mac, extra] = token.split(".");
  if (!encoded || !mac || extra !== undefined) return null;
  if (!safeEqual(mac, tokenMac(encoded, secret))) return null;
  let payload: Partial<TokenPayload>;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<TokenPayload>;
  } catch {
    return null;
  }
  if (typeof payload.c !== "string" || !payload.c || typeof payload.q !== "string") return null;
  if (typeof payload.e !== "number" || payload.e * 1000 < now) return null;
  // The token was minted from a verified request: its client_id must still match.
  if (new URLSearchParams(payload.q).get("client_id") !== payload.c) return null;
  return { clientId: payload.c, authorizeQuery: payload.q, source: "token" };
}

/**
 * The app a screen is for: a signed OAuth request in the query first, else an app context
 * token. Anything else (an unsigned `client_id`, a forged or expired token) gives null.
 */
export function verifyAppContext(input: QueryInput, secret: string, now: number = Date.now()): VerifiedAppContext | null {
  const params = toSearchParams(input);
  return (
    verifySignedOAuthQuery(params, secret, now) ??
    verifyAppContextToken(params.get(APP_CONTEXT_PARAM), secret, now)
  );
}
