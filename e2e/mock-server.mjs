// Local stand-ins for the outside world, started by playwright.config.ts on 127.0.0.1:E2E_MOCK_PORT:
//
// - /gitlab/*: a GitLab-compatible OAuth provider (authorize, token, /api/v4/user), so social
//   sign-in runs end to end. Tests choose who signs in with POST /gitlab/next-profile.
// - /oidc/*: an OpenID Connect provider (discovery, authorize, token with a signed ID token,
//   UserInfo, JWKS), for custom sign-in providers. Tests choose who signs in with
//   POST /oidc/next-profile.
// - /webhooks/:name: a webhook receiver that records every delivery (GET lists them).
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

const port = Number(process.env.E2E_MOCK_PORT ?? 3229);

/** @type {Record<string, unknown> | null} */
let nextProfile = null;
/** @type {Map<string, { profile: Record<string, unknown>, redirectUri: string, clientId: string }>} */
const codes = new Map();
/** @type {Map<string, Record<string, unknown>>} */
const accessTokens = new Map();
/** @type {Map<string, { headers: Record<string, unknown>, body: string, at: string }[]>} */
const deliveries = new Map();

const token = () => randomBytes(16).toString("hex");

// --- OpenID Connect provider state ---
const oidcKeys = await generateKeyPair("ES256");
const oidcJwk = { ...(await exportJWK(oidcKeys.publicKey)), kid: "mock-oidc", alg: "ES256", use: "sig" };
/** @type {Record<string, unknown> | null} */
let oidcNextProfile = null;
/** @type {Map<string, { profile: Record<string, unknown>, redirectUri: string, clientId: string, nonce: string | null, challenge: string | null }>} */
const oidcCodes = new Map();
/** @type {Map<string, Record<string, unknown>>} */
const oidcTokens = new Map();
/** Replaces fields of the discovery document (a provider that changes it after being added). */
let oidcDiscoveryOverride = {};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseForm(body, contentType) {
  if (contentType?.includes("application/json")) return JSON.parse(body || "{}");
  return Object.fromEntries(new URLSearchParams(body));
}

/** client_id and client_secret from HTTP Basic or the body. */
function clientCredentials(req, form) {
  const header = req.headers.authorization;
  if (header?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
    return { id: decodeURIComponent(id ?? ""), secret: decodeURIComponent(secret ?? "") };
  }
  return { id: form.client_id, secret: form.client_secret };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const path = url.pathname;
  try {
    if (path === "/health") return json(res, 200, { ok: true });

    // --- GitLab-compatible OAuth provider ----------------------------------------------------
    if (path === "/gitlab/next-profile" && req.method === "POST") {
      nextProfile = JSON.parse(await readBody(req));
      return json(res, 200, { ok: true });
    }
    if (path === "/gitlab/oauth/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      const clientId = url.searchParams.get("client_id");
      if (!redirectUri || !state || !clientId || !nextProfile) {
        return json(res, 400, { error: "invalid_request", nextProfile: Boolean(nextProfile) });
      }
      const code = token();
      codes.set(code, { profile: nextProfile, redirectUri, clientId });
      nextProfile = null;
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      res.writeHead(302, { location: target.toString() });
      return res.end();
    }
    if (path === "/gitlab/oauth/token" && req.method === "POST") {
      const form = parseForm(await readBody(req), req.headers["content-type"]);
      const grant = codes.get(form.code);
      const client = clientCredentials(req, form);
      if (!grant || form.grant_type !== "authorization_code" || client.id !== grant.clientId || !client.secret) {
        return json(res, 400, { error: "invalid_grant" });
      }
      if (form.redirect_uri !== grant.redirectUri) return json(res, 400, { error: "invalid_grant", error_description: "redirect_uri" });
      codes.delete(form.code);
      const accessToken = token();
      accessTokens.set(accessToken, grant.profile);
      return json(res, 200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600, scope: "read_user" });
    }
    if (path === "/gitlab/api/v4/user") {
      const bearer = req.headers.authorization?.replace(/^Bearer /, "");
      const profile = bearer ? accessTokens.get(bearer) : undefined;
      if (!profile) return json(res, 401, { message: "401 Unauthorized" });
      return json(res, 200, { state: "active", locked: false, avatar_url: null, ...profile });
    }

    // --- OpenID Connect provider ---------------------------------------------------------------
    const issuer = `http://127.0.0.1:${port}/oidc`;
    if (path === "/oidc/discovery-override" && req.method === "POST") {
      oidcDiscoveryOverride = JSON.parse(await readBody(req));
      return json(res, 200, { ok: true });
    }
    if (path === "/oidc/.well-known/openid-configuration") {
      return json(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["ES256"],
        code_challenge_methods_supported: ["S256"],
        ...oidcDiscoveryOverride,
      });
    }
    if (path === "/oidc/jwks") return json(res, 200, { keys: [oidcJwk] });
    if (path === "/oidc/next-profile" && req.method === "POST") {
      oidcNextProfile = JSON.parse(await readBody(req));
      return json(res, 200, { ok: true });
    }
    if (path === "/oidc/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      const clientId = url.searchParams.get("client_id");
      if (!redirectUri || !state || !clientId || !oidcNextProfile) {
        return json(res, 400, { error: "invalid_request", nextProfile: Boolean(oidcNextProfile) });
      }
      const code = token();
      oidcCodes.set(code, {
        profile: oidcNextProfile,
        redirectUri,
        clientId,
        nonce: url.searchParams.get("nonce"),
        challenge: url.searchParams.get("code_challenge"),
      });
      oidcNextProfile = null;
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      target.searchParams.set("iss", issuer);
      res.writeHead(302, { location: target.toString() });
      return res.end();
    }
    if (path === "/oidc/token" && req.method === "POST") {
      const form = parseForm(await readBody(req), req.headers["content-type"]);
      const grant = oidcCodes.get(form.code);
      const client = clientCredentials(req, form);
      if (!grant || form.grant_type !== "authorization_code" || client.id !== grant.clientId || !client.secret) {
        return json(res, 400, { error: "invalid_grant" });
      }
      if (form.redirect_uri !== grant.redirectUri) return json(res, 400, { error: "invalid_grant", error_description: "redirect_uri" });
      const verifier = form.code_verifier ?? "";
      if (grant.challenge && createHash("sha256").update(verifier).digest("base64url") !== grant.challenge) {
        return json(res, 400, { error: "invalid_grant", error_description: "code_verifier" });
      }
      oidcCodes.delete(form.code);
      const accessToken = token();
      oidcTokens.set(accessToken, grant.profile);
      const idToken = await new SignJWT({ ...grant.profile, ...(grant.nonce ? { nonce: grant.nonce } : {}) })
        .setProtectedHeader({ alg: "ES256", kid: oidcJwk.kid })
        .setIssuer(issuer)
        .setAudience(grant.clientId)
        .setSubject(String(grant.profile.sub))
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(oidcKeys.privateKey);
      return json(res, 200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600, id_token: idToken, scope: "openid email profile" });
    }
    if (path === "/oidc/userinfo") {
      const bearer = req.headers.authorization?.replace(/^Bearer /, "");
      const profile = bearer ? oidcTokens.get(bearer) : undefined;
      if (!profile) return json(res, 401, { error: "invalid_token" });
      return json(res, 200, profile);
    }

    // --- Webhook receiver --------------------------------------------------------------------
    const hook = path.match(/^\/webhooks\/([\w-]+)$/);
    if (hook) {
      const name = hook[1];
      if (req.method === "POST") {
        const body = await readBody(req);
        const list = deliveries.get(name) ?? [];
        list.push({ headers: req.headers, body, at: new Date().toISOString() });
        deliveries.set(name, list);
        return json(res, 200, { received: true });
      }
      return json(res, 200, deliveries.get(name) ?? []);
    }

    json(res, 404, { error: "not_found", path });
  } catch (error) {
    json(res, 500, { error: String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[mock] listening on http://127.0.0.1:${port}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
