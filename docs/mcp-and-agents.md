# Use Ostiary with MCP / AI agents

MCP clients (Claude, VS Code, Cursor, agent frameworks) register themselves with the authorization server instead of waiting for an admin to create a client. Ostiary supports both ways they do it. Both are **off by default**: turn them on in the admin console, **Applications > Self-registration**.

- **Dynamic Client Registration** (RFC 7591): the client posts its metadata to `/api/auth/oauth2/register` and gets a `client_id`. Choose *Anyone* (what MCP clients expect) or *Signed-in users only*.
- **Client ID Metadata Documents**: the `client_id` is an HTTPS URL to the client's JSON metadata, for example `https://vscode.dev/oauth/client-metadata.json`. Ostiary fetches it the first time the client signs someone in. You can limit it to some hosts (`claude.ai`, `vscode.dev`).

Self-registered clients are never reviewed, so Ostiary limits them:

- They may only request the scopes you tick in the settings (OpenID Connect scopes by default; add your API scopes as needed). Narrowing the list also narrows clients registered before.
- Authorization code with PKCE only: no client credentials, no device sign-in (however the client authenticates), no skipping the consent screen. Updates cannot widen them past these limits either.
- **Anonymous registration creates public clients only.** With *Anyone* selected, a request made without a signed-in session must register a public client (`token_endpoint_auth_method: "none"`, which always uses PKCE). A confidential, secret-bearing client can only be registered with a session — an admin, or a signed-in user. A request that omits `token_endpoint_auth_method` is refused rather than silently turned into a confidential client (Better Auth would otherwise default it to one and hand back a secret). This is the safety model behind "MCP out of the box": public PKCE clients self-register freely, secrets never leave with an anonymous caller.
- The consent screen marks them as **unverified**, says where the user will be sent, and hides their logo.
- An hourly cap on new self-registered clients across all instances (30 by default), plus Better Auth's limit of 5 registrations a minute per IP address in production. Metadata documents are fetched only from public addresses (no private or reserved IPs, no redirects, 5 KB, 5 s timeout).
- The Applications page lists them with a badge and a filter; you can disable or delete them. Registrations and admin changes are in the audit log.

Settings live in the database and reach the auth server within a minute, no redeploy needed.

**Environment guard rails.** Three optional variables (both apps) sit on top of the admin console, for deployments that want a fixed policy or configure everything through the environment. They can only make self-registration more restrictive, so turning it on stays a deliberate choice; all default on.

| Variable | Effect |
| --- | --- |
| `OAUTH_DYNAMIC_CLIENT_REGISTRATION_MODE` | Default registration mode `off` \| `signed_in` \| `open` (default `off`). Lets a deployment enable MCP/dynamic registration by configuration alone — no admin console — and makes discovery advertise `registration_endpoint` even on a cold instance. The admin console still overrides it at runtime. |
| `OAUTH_ALLOW_DYNAMIC_CLIENT_REGISTRATION` | `false` disables `/oauth2/register` entirely, whatever the admin console selects (a kill-switch). |
| `OAUTH_ALLOW_UNAUTHENTICATED_CLIENT_REGISTRATION` | `false` forbids anonymous registration even in *Anyone* mode, clamping it to signed-in users. |
| `OAUTH_CLIENT_REGISTRATION_SCOPES` | Comma-separated scopes a self-registered client may request by default (e.g. `openid,profile,email,offline_access,notes:read`). Defaults to the OpenID Connect scopes only. A listed scope must also exist on the server (`OAUTH_API_SCOPES` or an API in the admin console) to be issued. |

A fork that wants its own API scope available to MCP clients out of the box registers the scope (its API under **APIs**, or `OAUTH_API_SCOPES`) and lists it in `OAUTH_CLIENT_REGISTRATION_SCOPES`; it does not need to edit the code.

**Discovery.** When registration is on, the discovery documents advertise it (`registration_endpoint`, and `client_id_metadata_document_supported` for metadata documents). The issuer is `https://auth.example.com/api/auth`, so MCP clients find the metadata at:

```
https://auth.example.com/.well-known/oauth-authorization-server/api/auth
https://auth.example.com/api/auth/.well-known/openid-configuration
```

**Register a client** (what an MCP client does for you):

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
# 201 {"client_id": "...", "scope": "openid profile email offline_access", ...}
```

A web (`"application_type": "web"`) client needs HTTPS redirect URIs and gets a `client_secret` unless it registers with `"token_endpoint_auth_method": "none"`. The client then runs the usual authorization code flow with PKCE.

**Publish a metadata document** instead (served as `application/json` at the URL that is its `client_id`):

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

**Protect an MCP server (or any API).** Register it under **APIs** with its URL as identifier (for example `https://mcp.example.com`) and its scopes, and allow those scopes for self-registered clients. The MCP server then points clients to Ostiary with OAuth Protected Resource Metadata (RFC 9728): it serves `/.well-known/oauth-protected-resource` and answers unauthenticated requests with `401` and a `WWW-Authenticate` header that links to it. Clients request their token with `resource=https://mcp.example.com`, so its audience is your server. With Better Auth's resource client:

```ts
import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

const ISSUER = "https://auth.example.com/api/auth";
const RESOURCE = "https://mcp.example.com";
const ostiary = createAuthClient({ baseURL: ISSUER, plugins: [oauthProviderResourceClient()] });

// GET /.well-known/oauth-protected-resource
export function protectedResourceMetadata() {
  return Response.json({
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: ["notes:read", "notes:write"],
    bearer_methods_supported: ["header"],
  });
}

// Every MCP request: verifies the JWT (signature, issuer, audience, scopes). On failure it
// throws a 401 whose WWW-Authenticate header carries resource_metadata=".../.well-known/oauth-protected-resource".
export async function requireToken(request: Request) {
  return ostiary.verifyAccessTokenRequest(request, {
    verifyOptions: { issuer: ISSUER, audience: RESOURCE },
    jwksUrl: `${ISSUER}/jwks`,
    requiredScopes: ["notes:read"],
  });
}
```
