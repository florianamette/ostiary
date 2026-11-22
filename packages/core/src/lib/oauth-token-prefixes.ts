/**
 * Prefixes of OAuth client secrets and refresh tokens, so secret scanners (GitHub, GitGuardian,
 * TruffleHog) can recognise a leaked one. Better Auth adds them when it hands a value out and
 * refuses a value without them, so `withTokenPrefixFallback` adds them to the values issued
 * before Ostiary had prefixes. Fixed: changing one would break every value issued with it.
 *
 * Opaque access tokens get none: they live an hour, and without a `token_type_hint` an
 * unprefixed one could not be told apart from an old refresh token.
 */
export const OAUTH_TOKEN_PREFIXES = {
    clientSecret: "ost_cs_",
    refreshToken: "ost_rt_",
} as const;

type Endpoint = "token" | "introspect" | "revoke";

/** The OAuth endpoints that receive a client secret or a refresh token. */
export function prefixedEndpoint(pathname: string): Endpoint | null {
    const match = /\/oauth2\/(token|introspect|revoke)$/.exec(pathname);
    return match ? (match[1] as Endpoint) : null;
}

function prefixed(value: string, prefix: string): string {
    return value.startsWith(prefix) ? value : prefix + value;
}

/** HTTP Basic credentials with the secret prefixed. Anything else is returned unchanged. */
export function withSecretPrefix(authorization: string | null): string | null {
    const match = authorization ? /^Basic\s+(\S+)\s*$/i.exec(authorization) : null;
    if (!match) return authorization;
    let decoded: string;
    try {
        decoded = atob(match[1]);
    } catch {
        return authorization;
    }
    const colon = decoded.indexOf(":");
    if (colon < 0) return authorization;
    const secret = decoded.slice(colon + 1);
    if (!secret || secret.startsWith(OAUTH_TOKEN_PREFIXES.clientSecret)) return authorization;
    // The prefix is plain ASCII, so it reads the same before and after form-decoding.
    return `Basic ${btoa(decoded.slice(0, colon + 1) + OAUTH_TOKEN_PREFIXES.clientSecret + secret)}`;
}

/** A request's parameters, from a form or a JSON body. */
export type TokenParams = Map<string, string>;

function isJwt(token: string): boolean {
    return token.split(".").length === 3;
}

/**
 * Adds the missing prefixes to the parameters. Returns true when the request names a token
 * that may be an old refresh token or an access token (introspect or revoke without a
 * `token_type_hint`): try it as sent first, then `asRefreshToken`.
 */
export function addPrefixes(endpoint: Endpoint, params: TokenParams): boolean {
    const secret = params.get("client_secret");
    if (secret) params.set("client_secret", prefixed(secret, OAUTH_TOKEN_PREFIXES.clientSecret));
    if (endpoint === "token") {
        const refresh = params.get("refresh_token");
        if (params.get("grant_type") === "refresh_token" && refresh) {
            params.set("refresh_token", prefixed(refresh, OAUTH_TOKEN_PREFIXES.refreshToken));
        }
        return false;
    }
    const token = params.get("token");
    if (!token || isJwt(token) || token.startsWith(OAUTH_TOKEN_PREFIXES.refreshToken)) return false;
    const hint = params.get("token_type_hint");
    if (hint === "refresh_token") {
        params.set("token", prefixed(token, OAUTH_TOKEN_PREFIXES.refreshToken));
        return false;
    }
    return hint !== "access_token";
}

/** The token as an old refresh token: prefixed, with its hint. */
export function asRefreshToken(params: TokenParams) {
    const token = params.get("token");
    if (token) params.set("token", prefixed(token, OAUTH_TOKEN_PREFIXES.refreshToken));
    params.set("token_type_hint", "refresh_token");
}

type Body = { params: TokenParams; serialize: () => string };

function parseBody(contentType: string | null, text: string): Body | null {
    const type = contentType?.split(";")[0].trim().toLowerCase();
    if (type === "application/x-www-form-urlencoded") {
        const form = new URLSearchParams(text);
        const params: TokenParams = new Map([...form.entries()]);
        return { params, serialize: () => new URLSearchParams([...params.entries()]).toString() };
    }
    if (type === "application/json") {
        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch {
            return null;
        }
        if (!json || typeof json !== "object" || Array.isArray(json)) return null;
        const object = json as Record<string, unknown>;
        const params: TokenParams = new Map(
            Object.entries(object).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        );
        return { params, serialize: () => JSON.stringify({ ...object, ...Object.fromEntries(params) }) };
    }
    return null;
}

type Handler = (request: Request) => Promise<Response>;

/**
 * Lets client secrets and refresh tokens issued before the prefixes keep working: adds the
 * missing prefix to the request before Better Auth reads it. Better Auth reads the client's
 * credentials from the request itself, which a hook cannot change, hence a wrapper around
 * the route handler.
 */
export function withTokenPrefixFallback(handler: Handler): Handler {
    return async (request) => {
        const endpoint = request.method === "POST" ? prefixedEndpoint(new URL(request.url).pathname) : null;
        if (!endpoint) return handler(request);

        const headers = new Headers(request.headers);
        const authorization = withSecretPrefix(headers.get("authorization"));
        if (authorization) headers.set("authorization", authorization);
        headers.delete("content-length");
        const text = await request.text();
        const body = parseBody(headers.get("content-type"), text);
        const send = (content: string) => handler(new Request(request.url, { method: "POST", headers, body: content }));
        if (!body) return send(text);

        const tryAsRefreshToken = addPrefixes(endpoint, body.params);
        const response = await send(body.serialize());
        if (!tryAsRefreshToken) return response;
        asRefreshToken(body.params);
        if (endpoint === "introspect") {
            // Not found as sent (inactive, or 400 "token not found"): ask again as a refresh token.
            if (response.ok) {
                const result = (await response.clone().json().catch(() => null)) as { active?: unknown } | null;
                if (result?.active !== false) return response;
            } else if (response.status !== 400) {
                return response;
            }
            return send(body.serialize());
        }
        // Revocation answers 200 for an unknown token, or 400 "token not found" when the value
        // cannot be a token as sent: revoke it as a refresh token in both cases. Answer 200 if
        // either revocation did.
        const asRefresh = await send(body.serialize());
        return response.ok ? response : asRefresh;
    };
}
