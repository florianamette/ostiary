// Local stand-ins for the outside world, started by playwright.config.ts on 127.0.0.1:E2E_MOCK_PORT:
//
// - /gitlab/*: a GitLab-compatible OAuth provider (authorize, token, /api/v4/user), so social
//   sign-in runs end to end. Tests choose who signs in with POST /gitlab/next-profile.
// - /webhooks/:name: a webhook receiver that records every delivery (GET lists them).
import { randomBytes } from "node:crypto";
import http from "node:http";

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
