# Protect an API

Register your APIs and their scopes in Ostiary, get access tokens for them, and verify those tokens in your API, for users and for machine-to-machine calls.

## How it works

1. You register the API in the admin console: its identifier (usually its base URL, such as `https://api.example.com`) and its scopes (`orders:read`, `orders:write`).
2. An app asks for a token for that API with the `resource` parameter (RFC 8707), on the authorization request or the token request.
3. Ostiary issues a JWT access token whose audience (`aud`) is the API's identifier, signed with its current signing key.
4. The API verifies the token's signature against Ostiary's public keys (JWKS), then checks the issuer, the audience and the scopes. No call to Ostiary is needed per request.

Without a `resource` parameter, the access token is opaque. It is meant for Ostiary's own UserInfo endpoint, not for your APIs: only the app that received it can introspect it.

Throughout this page, the issuer is `https://auth.example.com/api/auth` and the API is `https://api.example.com`.

## Register the API

1. In the admin console, open **APIs**.
2. Under **Register an API**, fill in:

   | Field | What to enter |
   | --- | --- |
   | **Identifier** | An absolute URL without a fragment, usually the API's base URL. It becomes the tokens' `aud` and cannot be changed later. |
   | **Name** | A label for the console, for example `Orders API`. |
   | **Scopes** | The API's scopes, separated by spaces or commas, for example `orders:read orders:write`. The OpenID Connect scopes (`openid`, `profile`, `email`, `offline_access`) are refused: every client has them already. |
   | **Only issue these scopes for this API** | Optional. See [Scopes](#scopes). |

3. Click **Register API**.

New and changed scopes reach the auth server within a minute, without a redeploy. The discovery document then lists them in `scopes_supported`.

The list also shows the **Auth server** itself, which stands for tokens issued without a `resource` parameter. It cannot be disabled or limited to some applications: signing in depends on it.

### Scopes

A token for an API never carries another API's scopes. By default it may carry the OpenID Connect scopes, the API's own scopes, and granted scopes that no API declares (such as those from `OAUTH_API_SCOPES`). With **Only issue these scopes for this API**, it carries only the API's own scopes and the OpenID Connect ones.

If none of the requested scopes is allowed for the API, the token request fails with `invalid_scope`.

### Register APIs from the environment

To provision an instance without the console, declare APIs and scopes in the auth app's environment:

```bash
OAUTH_API_AUDIENCES=https://api.example.com,https://billing.example.com
OAUTH_API_SCOPES=orders:read,orders:write
```

`pnpm db:migrate` (or the build on Vercel, or the `migrate` container) registers the APIs in `OAUTH_API_AUDIENCES`; existing rows, and changes made from the console, are left as they are. The scopes in `OAUTH_API_SCOPES` belong to no API, so every API's tokens may carry them; the console shows them under **Scopes from OAUTH_API_SCOPES**. An API declared in the environment cannot be deleted from the console, since it would come back on the next deploy: disable it instead.

## Get a token for your API

### For a signed-in user

Add `resource` to the authorization request, with the API's scopes:

```
https://auth.example.com/api/auth/oauth2/authorize
  ?response_type=code
  &client_id=CLIENT_ID
  &redirect_uri=https://app.example.com/callback
  &scope=openid profile email offline_access orders:read
  &resource=https://api.example.com
  &code_challenge=...
  &code_challenge_method=S256
  &state=...
```

The user approves the scopes on the consent screen. The code exchange and later refreshes keep the resource, so the token request needs no `resource` parameter; if it sends one, it may only narrow the list. The access token is a JWT for the API.

With Auth.js, add the parameters to the provider (see [Connect an app](connect-an-app.md#sign-in-with-authjs)):

```ts
authorization: {
  params: { scope: "openid profile email orders:read", resource: "https://api.example.com" },
},
```

The access token is then in the `account` object your `jwt` callback receives at sign-in (`account.access_token`).

> [!NOTE]
> When the token also has the `openid` scope, its `aud` is an array: the API, plus `https://auth.example.com/api/auth/oauth2/userinfo` so the same token works on UserInfo. JWT libraries accept a token when any `aud` value matches.

### Errors

| Error | Cause |
| --- | --- |
| `invalid_target` | The `resource` is not a registered API, the API is disabled, or the API is limited to linked applications and this app is not one of them. |
| `invalid_scope` | None of the requested scopes is allowed for this API. |

## Verify access tokens

Your API checks every request's token:

- the signature, against the keys at `https://auth.example.com/api/auth/jwks` (the discovery document's `jwks_uri`), picked by the token's `kid`,
- `iss`: `https://auth.example.com/api/auth`,
- `aud`: your API's identifier,
- `exp`, and the `typ` header: `at+jwt`,
- the scopes your endpoint needs, in `scope` (space-separated).

Tokens are signed with EdDSA (Ed25519). Read the keys from the JWKS by `kid` and fetch it again on an unknown `kid`, as the libraries below do, and [key rotation](tokens-and-claims.md#signing-keys) needs nothing from your API.

### With jose

[jose](https://github.com/panva/jose) works in Node.js, Deno, Bun, Cloudflare Workers and the edge runtime:

```ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const ISSUER = "https://auth.example.com/api/auth";
const AUDIENCE = "https://api.example.com";
// Cached and refetched on an unknown kid.
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/jwks`));

export async function requireScope(request: Request, scope: string): Promise<JWTPayload> {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE, typ: "at+jwt" }));
  } catch {
    throw new Response(null, { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } });
  }

  // A DPoP-bound token needs the proof checks below: refuse it as a plain bearer token.
  if (payload.cnf) {
    throw new Response(null, { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } });
  }

  const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
  if (!scopes.includes(scope)) {
    throw new Response(null, {
      status: 403,
      headers: { "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${scope}"` },
    });
  }
  return payload; // payload.sub is the user (or the client, for a machine token)
}
```

### With Better Auth's resource client

`@better-auth/oauth-provider` ships a resource-server helper. It verifies the token the same way, answers failures with the right `401` or `403` and `WWW-Authenticate` header, and also handles [DPoP-bound tokens](#require-dpop-bound-tokens):

```ts
import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

const ISSUER = "https://auth.example.com/api/auth";
const ostiary = createAuthClient({ baseURL: ISSUER, plugins: [oauthProviderResourceClient()] });

export async function requireOrdersRead(request: Request) {
  // Throws an error carrying the status and WWW-Authenticate header on failure.
  return ostiary.verifyAccessTokenRequest(request, {
    verifyOptions: { issuer: ISSUER, audience: "https://api.example.com" },
    jwksUrl: `${ISSUER}/jwks`,
    requiredScopes: ["orders:read"],
  });
}
```

It can also verify remotely, through introspection, with its `remoteVerify` option (the introspection URL and a client ID and secret). An MCP server can serve its protected resource metadata with the same client: see [MCP and AI agents](mcp-and-agents.md).

### What an access token contains

A decoded access token for a user:

```json
{
  "sub": "VJ0k...",
  "aud": ["https://api.example.com", "https://auth.example.com/api/auth/oauth2/userinfo"],
  "azp": "pXr1...",
  "client_id": "pXr1...",
  "scope": "openid profile email orders:read",
  "sid": "kq9T...",
  "role": "user",
  "iss": "https://auth.example.com/api/auth",
  "iat": 1763650000,
  "exp": 1763653600,
  "jti": "..."
}
```

| Claim | Value |
| --- | --- |
| `sub` | The user's ID, or the client ID for a machine-to-machine token |
| `aud` | The API's identifier, and the UserInfo URL when `openid` was granted |
| `azp`, `client_id` | The app the token was issued to |
| `scope` | The granted scopes, space-separated |
| `sid` | The user's session (user tokens only) |
| `role` | The user's platform role, such as `user` or `admin` (user tokens only) |
| `cnf` | The DPoP key thumbprint (`jkt`), for a DPoP-bound token |
| `iss`, `iat`, `exp`, `jti` | Standard JWT claims |

The API's own custom claims (see [below](#set-token-lifetimes-claims-and-dpop-per-api)) and the [application's custom claims](tokens-and-claims.md#custom-claims) are added to these. [Tokens and claims](tokens-and-claims.md) is the full reference.

A JWT stays valid until it expires, even if the user signs out or the API is deleted: a local check cannot know. Keep access tokens short-lived, or introspect when you need to know at once.

## Introspect a token

Introspection (RFC 7662) asks Ostiary whether a token is active right now. It also checks that the user's session still exists, and it works for opaque tokens. It needs a confidential client:

```bash
curl -s https://auth.example.com/api/auth/oauth2/introspect \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d token="$ACCESS_TOKEN" \
  -d token_type_hint=access_token
```

```json
{
  "active": true,
  "sub": "VJ0k...",
  "aud": "https://api.example.com",
  "client_id": "pXr1...",
  "scope": "orders:read",
  "token_type": "Bearer",
  "iss": "https://auth.example.com/api/auth",
  "exp": 1763653600
}
```

A client may introspect:

- the tokens it received itself, and
- tokens for an API it is linked to: on **APIs**, click **Change** next to **Applications** and tick it under **Linked applications**. This works whether the API is open to every application or not.

For any other token, and for an expired, revoked or unknown one, the answer is `{"active": false}`.

To give your API its own credentials for introspection, register a confidential client for it (it needs no grant beyond the defaults) and link it to the API.

## Call an API from a server (machine to machine)

Services, cron jobs and backends call your APIs with the client credentials grant. There is no user: the token's `sub` is the client ID, and it carries no ID token or refresh token.

### Register a machine client

1. In the admin console, open **Applications** and click **Register application**.
2. Enter an **Application name** and set **Client type** to **Machine-to-machine (client credentials)**. The form then has no redirect URIs, device sign-in or consent: the client signs no user in.
3. Under **APIs and scopes**, tick the scopes the client may request. They are grouped by API; scopes from `OAUTH_API_SCOPES` are under **Other scopes**. The client is linked to each API whose scopes you tick, so it keeps access if that API is later limited to **Only linked applications**.
4. Click **Create application**. Copy the **Client ID** and **Client secret**: the secret is not shown again; **Rotate secret** in the row's menu issues a new one.

The client appears under **Applications** as **Machine-to-machine**. **Edit application** only changes its name and icon. The scopes are set at registration: to change them, register a new client.

A machine client is confidential (it authenticates with its secret, HTTP Basic) and has the `client_credentials` grant only. It needs at least one API scope: a client without scopes could request every scope of the server, so the console refuses it.

From a script, the console's JSON API does the same, from the console's own origin with an admin session (`POST /api/admin/oauth-clients`):

```json
{
  "client_name": "Billing worker",
  "grant_types": ["client_credentials"],
  "scope": "orders:read",
  "resources": ["https://api.example.com"]
}
```

`redirect_uris` is only required with the `authorization_code` grant. `resources` (optional) links the client to those APIs. A client that should also sign users in lists `"authorization_code", "refresh_token", "client_credentials"` in `grant_types`, with `redirect_uris`.

### Get a token

```bash
curl -s https://auth.example.com/api/auth/oauth2/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=client_credentials \
  -d scope=orders:read \
  -d resource=https://api.example.com
```

```json
{
  "access_token": "eyJhbGciOiJFZERTQSIs...",
  "expires_in": 3600,
  "expires_at": 1763653600,
  "token_type": "Bearer",
  "scope": "orders:read"
}
```

Without `scope`, the token gets every scope the client was registered with. A scope it was not registered with is refused (`invalid_scope`). Without `resource`, the token is opaque; with it, it is a JWT your API verifies as above.

With openid-client:

```ts
import * as client from "openid-client";

const config = await client.discovery(
  new URL("https://auth.example.com/api/auth"),
  process.env.CLIENT_ID!,
  undefined,
  client.ClientSecretBasic(process.env.CLIENT_SECRET!),
);

const { access_token } = await client.clientCredentialsGrant(config, {
  scope: "orders:read",
  resource: "https://api.example.com",
});
```

Application custom claims apply to machine tokens too, with their fixed values only, since there is no user. Machine tokens last an hour, or the API's shorter access token lifetime.

## Limit an API to some applications

By default, every application can get tokens for every API, within its scopes. To limit an API:

1. Open **APIs** and click **Change** next to **Applications** on the API.
2. Choose **Only linked applications**.
3. Under **Linked applications**, tick the applications that may call it. **Filter by name or client ID** helps with long lists.
4. Click **Save**.

The other applications get `invalid_target`, including when they refresh a token they already have. With no application linked, none can get tokens for the API.

## Set token lifetimes, claims and DPoP per API

1. Open **APIs** and click **Change** next to **Tokens** on the API.
2. Set any of these:

   | Setting | Details |
   | --- | --- |
   | **Access token lifetime (minutes)** | Empty: 60 minutes. Can only be shorter, at least one minute. |
   | **Refresh token lifetime (days)** | Empty: 30 days. Can only be shorter. |
   | **Custom claims** | A JSON object added to every access token for this API, for example `{"tenant": "acme"}`. 4 KB at most. Reserved, and refused: `iss`, `sub`, `aud`, `exp`, `nbf`, `iat`, `jti`, `client_id`, `azp`, `scope`, `sid`, `auth_time`, `acr`, `amr`, `cnf`, `role`. |
   | **Require DPoP-bound tokens** | See below. |

3. Click **Save**.

Settings apply to the next token issued; tokens already issued keep theirs. When a token is for several APIs, it gets the shortest lifetimes. An API's custom claims win over an [application claim](tokens-and-claims.md#custom-claims) with the same name.

### Require DPoP-bound tokens

DPoP (RFC 9449) binds a token to a key the client holds, so a stolen token is useless without that key. With **Require DPoP-bound tokens**:

- The client must send a `DPoP` proof header with its token request, or it gets `invalid_dpop_proof`. The token then has `"token_type": "DPoP"` and a `cnf` claim with the key's thumbprint.
- The client calls your API with `Authorization: DPoP <token>` and a fresh `DPoP` proof on every request.
- Your API must check the proof: use `verifyAccessTokenRequest` from [Better Auth's resource client](#with-better-auths-resource-client), which checks the method, URL, proof, `ath` and `cnf.jkt` binding. Its default store for replayed proofs lives in memory: give it a shared `replayStore` (in its `dpop` option) when your API runs on several instances or serverless.

Ostiary accepts DPoP proofs signed with EdDSA, ES256 and ES512. With openid-client, the client side looks like this:

```ts
const DPoP = client.getDPoPHandle(config, await client.randomDPoPKeyPair()); // ES256

const tokens = await client.clientCredentialsGrant(
  config,
  { scope: "orders:read", resource: "https://api.example.com" },
  { DPoP },
);

const response = await client.fetchProtectedResource(
  config,
  tokens.access_token,
  new URL("https://api.example.com/orders"),
  "GET",
  undefined,
  undefined,
  { DPoP },
);
```

## Disable or delete an API

Click the API's edit button:

- **Disabled**: no new tokens for the API (`invalid_target`). Tokens already issued work until they expire.
- The delete button removes the API. Clients can no longer get tokens for it, and introspection reports its tokens inactive at once. An API that verifies JWTs locally keeps accepting them until they expire.

Removing a scope from an API does not change clients that already have it, but no new token carries it.

## Related

- [Tokens and claims](tokens-and-claims.md): every endpoint, claim and lifetime.
- [API keys](api-keys.md): long-lived keys for scripts, verified by your API with Ostiary.
- [MCP and AI agents](mcp-and-agents.md): protect an MCP server and let clients register themselves.
- [Connect an app](connect-an-app.md): register the apps that call your API.
