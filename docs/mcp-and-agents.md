# Use Ostiary with MCP and AI agents

Let MCP clients and AI agents (Claude, VS Code, Cursor, agent frameworks) register themselves with Ostiary and get tokens for your MCP server.

MCP clients register with the authorization server instead of waiting for an admin to create a client. Ostiary supports both ways they do it, applies strict limits to the clients that register this way, and lets you protect an MCP server (or any API) with the tokens they get.

## How MCP clients register

- **Dynamic Client Registration** (RFC 7591): the client posts its metadata to `/api/auth/oauth2/register` and gets a `client_id` back.
- **Client ID Metadata Documents**: the `client_id` is an HTTPS URL to the client's JSON metadata, for example `https://vscode.dev/oauth/client-metadata.json`. Ostiary fetches it the first time the client signs someone in.

Both are **off by default**. The clients either method creates are called self-registered clients: nobody reviewed them, so Ostiary treats them differently from the applications an admin registers (see [What self-registered clients can do](#what-self-registered-clients-can-do)).

## Turn on self-registration

1. In the admin console, open **Applications**.
2. On the **Self-registration** card, click **Edit**.
3. Under **Dynamic Client Registration (RFC 7591)**, choose:
   - **Off**: `POST /oauth2/register` is refused.
   - **Signed-in users only**: only requests carrying a user's session may register. Most MCP clients cannot.
   - **Anyone (open registration)**: what MCP clients expect. Any app may register, then each user approves it on the consent screen.
4. To accept metadata documents, tick **Client ID Metadata Documents**. Under **Allowed hosts**, list the hosts you accept, one per line (for example `claude.ai`, `vscode.dev`). Empty means any public HTTPS host.
5. Under **Scopes self-registered clients may request**, tick the scopes. The OpenID Connect scopes are ticked by default; add your API scopes (for example the scopes of your MCP server) as needed.
6. Set **New clients per hour** (30 by default, across every instance and both methods).
7. Leave **Reuse identical public clients** on unless you want a new client for every registration (see [Reuse of identical clients](#reuse-of-identical-clients)).
8. Click **Save**.

The settings live in the database and reach the auth server within a minute, with no redeploy. When registration is on, the discovery documents advertise it, see [Discovery for MCP clients](#discovery-for-mcp-clients).

## What self-registered clients can do

Self-registered clients are never reviewed, so Ostiary limits them:

- **Scopes.** They may only request the scopes ticked in the settings. Removing a scope also removes it from clients registered before; tokens already issued keep it until they expire.
- **Grants.** Authorization code with PKCE, and refresh tokens. No client credentials (`grant_type ... is not available to self-registered clients`), no device sign-in (`unauthorized_client`, however the client authenticates), no skipping the consent screen. Updates cannot widen them past these limits either.
- **No custom claims or sign-in branding.** Only applications an admin registered can have [custom claims](tokens-and-claims.md#custom-claims) or per-app branding.
- **Consent screen.** It always shows, marked **Unverified app**, says where the user will be sent ("If you allow, you will be sent to **host**"), and shows a monogram instead of the client's logo.
- **Volume.** At most the hourly cap of new clients across all instances (a request over it gets `429` with `temporarily_unavailable`), plus 5 registrations a minute per IP address in production.
- **Metadata documents** are fetched only from public addresses: no private or reserved IPs, no redirects, 5 KB at most, 5 s timeout. The document must have `client_name` and `redirect_uris`.

### Anonymous registration creates public clients only

With **Anyone (open registration)**, a request without a signed-in session always registers a public client (`token_endpoint_auth_method: "none"`, which always uses PKCE). A request that omits `token_endpoint_auth_method`, or asks for a confidential method, is registered as a public client rather than refused: MCP clients such as Claude often omit the field, and Better Auth would otherwise default it to a confidential client and hand back a secret.

A confidential, secret-bearing client can only be registered with a session: an admin, or a signed-in user. This is the safety model behind MCP support: public PKCE clients self-register freely, and secrets never leave with an anonymous caller.

## Reuse of identical clients

MCP clients such as Claude register again every time someone connects them. An anonymous registration of a public client identical to an existing, enabled public client gets that client back (same `client_id`, `201` with its stored metadata) instead of a new one.

Identical means the same name, redirect URIs, grant types, response types, scopes, application type, software ID and version, website, terms, privacy policy, post-logout redirect URIs and contacts. Every link the consent screen shows is part of the match, so whoever registers a name first cannot put their own website, terms or privacy links in front of later users. The logo is not part of it, since the consent screen hides it.

- There is no secret to hand out again, so this gives nothing away, and it does not count against the hourly cap.
- Confidential clients, clients registered with a session or an `Authorization` header, disabled clients and registrations that differ are never reused.
- Requests that set `jwks`, `jwks_uri`, `software_statement`, `resources`, a back-channel logout URI, `require_pkce: false` or `dpop_bound_access_tokens: true` always create a new client.

Turn it off with **Reuse identical public clients** in the settings.

## Manage self-registered clients

The **Applications** page marks self-registered clients with a **Self-registered** badge. Filter them with **Registered by** (**Dynamic registration**, **Metadata document**). Identical ones are collapsed into one row, for example *Claude ×12*; **Show all** expands them.

Each self-registered row's menu has:

- **Disable** / **Enable**: a disabled client can no longer sign anyone in or refresh its tokens. Access tokens already issued work until they expire (an hour at most).
- **Set icon**: an icon for the console and users' account pages. The consent screen keeps the monogram and the unverified notice.
- **Delete**: deletes the client with its tokens and consents. The app can register again while registration is on, and a metadata-document client is created again the next time it signs someone in. To block one, disable it instead.

To clean up duplicates:

1. On **Applications**, click **Remove unused duplicates**.
2. Optionally tick **Also delete self-registered apps never used** and set **Days**: clients with no token and no consent, registered more than that many days ago, are deleted too.
3. Click **Remove**.

For each group of identical clients, the most recently used one is kept (latest token or consent). The others are deleted with their consents, except those still holding a live access or refresh token: they stay, so nobody is signed out, and the result says how many. Disabled clients are left alone.

Registrations (**Client registered itself**) and admin changes are in the audit log.

## Discovery for MCP clients

The issuer is `https://auth.example.com/api/auth`, so MCP clients find the authorization server metadata at either of:

```
https://auth.example.com/.well-known/oauth-authorization-server/api/auth
https://auth.example.com/api/auth/.well-known/openid-configuration
```

When registration is on, the documents include `registration_endpoint` (Dynamic Client Registration), `client_id_metadata_document_supported: true` (metadata documents) and `none` in `token_endpoint_auth_methods_supported`, including on a freshly started (cold) serverless instance. The discovery documents and the `/oauth2/*` endpoints allow cross-origin requests, so browser-based clients can use them. See [Tokens and claims](tokens-and-claims.md#endpoints) for every endpoint.

## Register a client with Dynamic Client Registration

This is what an MCP client does for you:

```bash
curl -X POST https://auth.example.com/api/auth/oauth2/register \
  -H 'content-type: application/json' \
  -d '{
    "client_name": "My Agent",
    "redirect_uris": ["http://127.0.0.1:33418/callback"],
    "token_endpoint_auth_method": "none",
    "application_type": "native",
    "grant_types": ["authorization_code", "refresh_token"],
    "scope": "openid profile email offline_access"
  }'
```

An excerpt of the answer:

```json
{
  "client_id": "Jx9qS0bWm2Lr7tYc",
  "client_name": "My Agent",
  "redirect_uris": ["http://127.0.0.1:33418/callback"],
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "scope": "openid profile email offline_access"
}
```

The answer is `201` and has no `client_secret`. The client then runs the authorization code flow with PKCE. A web client (`"application_type": "web"`) needs HTTPS redirect URIs. Only a registration made with a session can get a confidential client and a `client_secret`.

## Publish a client metadata document

Instead of registering, a client can publish its metadata as JSON (served as `application/json`) at the URL that is its `client_id`:

```json
{
  "client_id": "https://agent.example.com/oauth/client.json",
  "client_name": "My Agent",
  "redirect_uris": ["https://agent.example.com/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

It then starts the authorization code flow with `client_id=https://agent.example.com/oauth/client.json`. The host must be in **Allowed hosts** when that list is set.

## Protect an MCP server

1. Register the MCP server as an API: **APIs** > **Register an API**, with its URL as **Identifier** (for example `https://mcp.example.com`) and its **Scopes**. See [Protect an API](protect-an-api.md).
2. Tick those scopes under **Scopes self-registered clients may request** (see [Turn on self-registration](#turn-on-self-registration)).
3. In the MCP server, serve OAuth Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource`, and answer requests without a valid token with `401` and a `WWW-Authenticate` header that links to it.

Clients then request their token with `resource=https://mcp.example.com`, so the token is a JWT whose audience is your server. With Better Auth's resource client, in a TypeScript MCP server:

```ts
import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

const ISSUER = "https://auth.example.com/api/auth";
const RESOURCE = "https://mcp.example.com";

const ostiary = createAuthClient({ baseURL: ISSUER, plugins: [oauthProviderResourceClient()] });

// GET /.well-known/oauth-protected-resource
export function protectedResourceMetadata(): Response {
  return Response.json({
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: ["notes:read", "notes:write"],
    bearer_methods_supported: ["header"],
  });
}

// Every MCP request: verifies the JWT (signature, issuer, audience, scopes) and returns its claims.
// On failure it throws an error carrying the status (401, or 403 for a missing scope) and a
// WWW-Authenticate header with resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource".
export async function requireToken(request: Request) {
  return ostiary.verifyAccessTokenRequest(request, {
    verifyOptions: { issuer: ISSUER, audience: RESOURCE },
    jwksUrl: `${ISSUER}/jwks`,
    requiredScopes: ["notes:read"],
  });
}

// Turns that error into the HTTP answer MCP clients expect.
export function authErrorResponse(error: unknown): Response {
  const e = error as { statusCode?: number; headers?: HeadersInit; message?: string };
  if (typeof e?.statusCode !== "number") throw error;
  return Response.json({ error: e.message ?? "unauthorized" }, { status: e.statusCode, headers: e.headers });
}
```

For example, in a route handler:

```ts
export async function POST(request: Request) {
  let claims;
  try {
    claims = await requireToken(request);
  } catch (error) {
    return authErrorResponse(error);
  }
  // claims.sub is the user's ID, claims.scope the granted scopes.
  return handleMcpRequest(request, claims);
}
```

`handleMcpRequest` stands for your MCP server's own handler. The claims an access token carries are listed in [Tokens and claims](tokens-and-claims.md#access-tokens).

## Related

- [Protect an API](protect-an-api.md): register APIs and verify their tokens
- [Tokens and claims](tokens-and-claims.md): endpoints, scopes and claims
- [Connect an app](connect-an-app.md): register an app yourself
- [Security](security.md)
