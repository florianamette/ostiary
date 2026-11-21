# Tokens and claims

Reference for Ostiary's OpenID Connect endpoints, scopes, the claims in ID tokens, access tokens and UserInfo, token lifetimes, and signing keys.

Ostiary is the authorization server built into the auth app (Better Auth's OAuth provider). Every path below is under `/api/auth` on the auth app's domain, and the issuer is that base URL:

```
https://auth.example.com/api/auth
```

Most OIDC libraries only need the issuer, a client ID and (for confidential clients) a secret: they read everything else from the discovery document. See [Connect an app](connect-an-app.md) to register an app and wire a library.

## Endpoints

| Endpoint | Path | Notes |
| --- | --- | --- |
| OpenID configuration | `/api/auth/.well-known/openid-configuration` | Also served at `/.well-known/openid-configuration` |
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server/api/auth` | Also served at `/.well-known/oauth-authorization-server`. Same content as the OpenID configuration |
| Authorization | `/api/auth/oauth2/authorize` | Authorization code flow. PKCE uses `S256` |
| Token | `/api/auth/oauth2/token` | Authorization code, refresh token, client credentials and device code grants |
| UserInfo | `/api/auth/oauth2/userinfo` | `GET` or `POST` with an access token that has the `openid` scope |
| Introspection (RFC 7662) | `/api/auth/oauth2/introspect` | For confidential clients. See [Protect an API](protect-an-api.md) |
| Revocation (RFC 7009) | `/api/auth/oauth2/revoke` | Revokes an access or refresh token |
| JWKS | `/api/auth/jwks` | Public keys for ID tokens and JWT access tokens. See [Signing keys](#signing-keys) |
| Device authorization (RFC 8628) | `/api/auth/device/code` | The user approves the code on the auth app's `/device` page. See [Connect an app](connect-an-app.md) |
| End session | `/api/auth/oauth2/end-session` | RP-initiated logout, for apps with **Sign-out from the app (RP-initiated logout)** (`enable_end_session`). See [Connect an app](connect-an-app.md#sign-users-out-rp-initiated-logout) |
| Dynamic client registration (RFC 7591) | `/api/auth/oauth2/register` | Only while self-registration is on. See [MCP and AI agents](mcp-and-agents.md) |

The discovery documents and the `/oauth2/*` endpoints answer cross-origin requests (CORS), so single-page apps and browser-based MCP clients can call them. The discovery documents are cached for 15 seconds.

### What the discovery document advertises

An excerpt of `GET https://auth.example.com/api/auth/.well-known/openid-configuration` on an instance with one API scope (`orders:read`) and self-registration off:

```json
{
  "issuer": "https://auth.example.com/api/auth",
  "authorization_endpoint": "https://auth.example.com/api/auth/oauth2/authorize",
  "token_endpoint": "https://auth.example.com/api/auth/oauth2/token",
  "userinfo_endpoint": "https://auth.example.com/api/auth/oauth2/userinfo",
  "jwks_uri": "https://auth.example.com/api/auth/jwks",
  "introspection_endpoint": "https://auth.example.com/api/auth/oauth2/introspect",
  "revocation_endpoint": "https://auth.example.com/api/auth/oauth2/revoke",
  "end_session_endpoint": "https://auth.example.com/api/auth/oauth2/end-session",
  "device_authorization_endpoint": "https://auth.example.com/api/auth/device/code",
  "scopes_supported": ["openid", "profile", "email", "offline_access", "orders:read"],
  "response_types_supported": ["code"],
  "response_modes_supported": ["query"],
  "grant_types_supported": [
    "authorization_code",
    "client_credentials",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code"
  ],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "private_key_jwt"],
  "code_challenge_methods_supported": ["S256"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["EdDSA"],
  "claims_supported": [
    "sub", "iss", "aud", "exp", "iat", "sid", "scope", "azp",
    "name", "picture", "given_name", "family_name", "email", "email_verified"
  ],
  "prompt_values_supported": ["login", "consent", "create", "select_account", "none"],
  "authorization_response_iss_parameter_supported": true
}
```

When self-registration is on, the document also lists `registration_endpoint`, `client_id_metadata_document_supported` (metadata documents) and `none` in `token_endpoint_auth_methods_supported`. Public clients registered from the admin console work either way.

### Rate limits

In production, Ostiary counts requests per client IP address, in the database, so the limits hold across every instance (see [Configuration](configuration.md) for `RATE_LIMIT_ENABLED` and the client IP settings).

| Path | Limit per IP address |
| --- | --- |
| `/oauth2/authorize` | 30 a minute |
| `/oauth2/token` | 300 a minute |
| `/oauth2/userinfo` | 60 a minute |
| `/oauth2/introspect` | 100 a minute |
| `/oauth2/revoke` | 30 a minute |
| `/oauth2/register` | 5 a minute |
| `/jwks` | Not limited |

## Scopes

| Scope | What it gives |
| --- | --- |
| `openid` | An ID token, and access to UserInfo |
| `profile` | `name` and `picture` in the ID token and UserInfo; `given_name` and `family_name` in UserInfo |
| `email` | `email` and `email_verified` in the ID token and UserInfo |
| `offline_access` | A refresh token, see [Refresh tokens](#refresh-tokens) |
| API scopes | Scopes your APIs declare, for example `orders:read`. Requested together with the `resource` parameter |

API scopes come from the APIs registered in the admin console (**APIs**) and from the `OAUTH_API_SCOPES` variable. New scopes reach the auth server within a minute. An API scope only goes into a token for its own API: a token for one API never carries another API's scopes. See [Protect an API](protect-an-api.md) for registering APIs and requesting their tokens.

An application may request the scopes it was registered with; an application registered without a scope list may request any scope. The consent screen lists the requested scopes for the user to approve, unless the application skips consent.

## ID token

Issued with the `openid` scope, signed with the current [signing key](#signing-keys) (`EdDSA`, Ed25519), valid 10 hours.

| Claim | Value |
| --- | --- |
| `iss` | The issuer, `https://auth.example.com/api/auth` |
| `sub` | The user's ID |
| `aud` | The application's client ID |
| `iat`, `exp` | Issued at, and expiry (10 hours later) |
| `auth_time` | When the user signed in |
| `acr` | Always `"0"` |
| `nonce` | The `nonce` of the authorization request, when it had one |
| `at_hash` | Hash of the access token issued with it |
| `sid` | The session ID, only for applications with **Sign-out from the app (RP-initiated logout)** (`enable_end_session`) or a back-channel logout URI |
| `name`, `picture` | With `profile`. `picture` only when the user has one |
| `email`, `email_verified` | With `email` |
| Custom claims | The application's [custom claims](#custom-claims) for the ID token |

The ID token has no `role` and no organization claims. Add them as [custom claims](#custom-claims) if your app needs them there.

```json
{
  "iss": "https://auth.example.com/api/auth",
  "sub": "iMRpZ3x0eV5mTqQh2wJ8",
  "aud": "kXy7N2vR9tP4qL1m",
  "iat": 1763650000,
  "exp": 1763686000,
  "auth_time": 1763649950,
  "acr": "0",
  "nonce": "n-0S6_WzA2Mj",
  "at_hash": "77QmUPtjPfzWtF2AnpK9RQ",
  "name": "Ada Lovelace",
  "picture": "https://example.com/ada.png",
  "email": "ada@example.com",
  "email_verified": true
}
```

## Access tokens

The token endpoint returns one of two kinds of access token:

- **Opaque** (a random string) when the request has no `resource` parameter. Use it at UserInfo, or introspect it.
- **JWT** when the request names an API with `resource=https://api.example.com`. Your API verifies it against the JWKS without calling Ostiary. See [Protect an API](protect-an-api.md).

A JWT access token has the header `typ: "at+jwt"` and these claims:

| Claim | Value |
| --- | --- |
| `iss` | The issuer |
| `sub` | The user's ID. For client credentials (no user), the client ID |
| `aud` | The API's identifier. With the `openid` scope, an array of the API and the UserInfo URL |
| `client_id`, `azp` | The application's client ID |
| `scope` | The granted scopes, space-separated |
| `sid` | The session ID (tokens issued for a user) |
| `iat`, `exp`, `jti` | Issued at, expiry, unique token ID |
| `cnf` | The DPoP key thumbprint, for DPoP-bound tokens |
| `role` | The user's platform role (`user` or `admin`). Absent for client credentials |
| API custom claims | The API's own custom claims (**APIs** > **Tokens** > **Change**) |
| Custom claims | The application's [custom claims](#custom-claims) for the access token |

```json
{
  "iss": "https://auth.example.com/api/auth",
  "sub": "iMRpZ3x0eV5mTqQh2wJ8",
  "aud": ["https://api.example.com", "https://auth.example.com/api/auth/oauth2/userinfo"],
  "client_id": "kXy7N2vR9tP4qL1m",
  "azp": "kXy7N2vR9tP4qL1m",
  "scope": "openid orders:read",
  "sid": "Yk3fQ0aZp8sW1vN6",
  "iat": 1763650000,
  "exp": 1763653600,
  "jti": "x0Pq2vM7bJf4Tn8cR1sZ5kWd9hLa3yGe",
  "role": "user"
}
```

The `role` claim is the platform role from the admin console (**Users**), not a role in an organization. Organization roles go in tokens through [custom claims](#custom-claims), see [Organizations](organizations.md#put-organizations-in-tokens).

Introspecting an opaque token returns the same claims (except `jti`), plus `active` and `token_type`. Introspection has no session, so organization claims that depend on the active organization are left out there.

## UserInfo

Call UserInfo with an access token that has the `openid` scope, in the `Authorization` header:

```bash
curl https://auth.example.com/api/auth/oauth2/userinfo \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "sub": "iMRpZ3x0eV5mTqQh2wJ8",
  "name": "Ada Lovelace",
  "picture": "https://example.com/ada.png",
  "given_name": "Ada",
  "family_name": "Lovelace",
  "email": "ada@example.com",
  "email_verified": true
}
```

- `sub` is always there. The other claims follow the token's scopes, as in the [Scopes](#scopes) table.
- `given_name` and `family_name` are derived from `name`: the last word is the family name. A one-word name gives neither.
- The application's [custom claims](#custom-claims) for UserInfo are added. UserInfo has no `role` claim.
- A token without `openid` gets `400` with `invalid_scope`. A missing, expired or revoked token gets `401`.

## Token lifetimes

| Token | Lifetime | Can change |
| --- | --- | --- |
| Authorization code | 10 minutes, single use | No |
| Access token (user) | 1 hour | Shorter per API |
| Access token (client credentials) | 1 hour | Shorter per API |
| ID token | 10 hours | No |
| Refresh token | 30 days, renewed on each refresh | Shorter per API |
| Device code | 10 minutes (poll every 5 seconds) | No |

To shorten the access or refresh token lifetime of one API: **APIs** > **Tokens** > **Change**, then **Access token lifetime (minutes)** or **Refresh token lifetime (days)**. Values can only be shorter than the defaults. They apply to the next token issued for that API. See [Protect an API](protect-an-api.md).

The response of the token endpoint gives the access token's lifetime in `expires_in` (seconds) and `expires_at` (Unix time).

## Refresh tokens

You get a refresh token when all of these are true:

- The request includes the `offline_access` scope.
- The application has the refresh token grant. Applications registered in the admin console have it by default.
- A user signed in (client credentials never return a refresh token).

A request with `offline_access` must use PKCE, or, for a confidential client, include `openid` and a `nonce`.

Exchange it at the token endpoint:

```bash
curl https://auth.example.com/api/auth/oauth2/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=refresh_token \
  -d refresh_token=$REFRESH_TOKEN
```

How refresh tokens behave:

- **Rotation.** Each refresh returns a new refresh token and revokes the one you sent. Store the new one every time.
- **Reuse detection.** Sending a refresh token that was already used returns `invalid_grant` and revokes every refresh token of that application for that user, with their access tokens. The user has to sign in again. Two refreshes in parallel with the same token trigger it: serialize refreshes in your app.
- **Sliding lifetime.** The new refresh token is valid 30 days (or the API's shorter lifetime) from the refresh.
- **Narrower scopes.** You may send `scope` with a subset of the original scopes. A scope that was not granted returns `invalid_scope`. To add scopes, start a new authorization.
- **Custom claims.** Tokens from a refresh carry the application's custom claims too.

Ostiary revokes a user's access and refresh tokens when the user is banned, deactivated by SCIM, or resets their password. JWT access tokens already issued stay valid until they expire (1 hour at most), since APIs verify them without calling Ostiary. Your app can revoke a token itself at `/api/auth/oauth2/revoke`.

## Custom claims

An app often needs more in its tokens than the standard claims: a tenant, a plan, the user's role in an organization. In Auth0 that takes an Action (a script). In Ostiary it is a list of claims you declare per application. Nothing is evaluated: no scripts, no expressions, no paths into the database.

### Add a claim

1. In the admin console, open **Applications**.
2. In the application's row menu, choose **Token claims**.
3. Click **Add claim**, then fill in:
   - **Claim name**: letters, digits and `_ . : / -`, starting with a letter or `_`, 200 characters at most. Namespaced names such as `https://example.com/tenant` are recommended (OIDC Core §5.1.2) but not required.
   - **Value from**: **Text** (a fixed string), **JSON** (a fixed number, boolean, array or object; no `null`, 4 levels deep at most) or **User attribute** (see the table below).
   - **Tokens**: **ID token**, **Access token**, **UserInfo**, or several.
4. Check the **Preview**: it shows each token's claims for an example user, and for a machine-to-machine (client credentials) token.
5. Click **Save claims**.

Claims apply from the next token issued. An application has at most 20 claims and 4 KB in all. Only applications registered by an admin can have claims: self-registered clients cannot.

### User attributes

| Attribute | Label in the console | Value |
| --- | --- | --- |
| `user.role` | Platform role | The platform role (`user`, `admin`) |
| `user.email_verified` | Email verified | `true` or `false` |
| `user.username` | Username | The username, when the user has one |
| `user.two_factor_enabled` | Two-factor enabled | `true` or `false` |
| `organization.id` | Active organization ID | The session's active organization |
| `organization.slug` | Active organization slug | Its slug |
| `organization.role` | Role in the active organization | The user's role in it |
| `organizations` | Organization memberships | Every organization the user belongs to, oldest membership first: `[{ "id", "slug", "role" }]` (50 at most) |

A claim without a value (no active organization, no username) is left out rather than set to `null`. See [Organizations](organizations.md#put-organizations-in-tokens) for how the active organization is chosen.

### Reserved names

These names are refused, whatever the token:

- The JWT and OIDC claims the server owns: `iss`, `sub`, `aud`, `exp`, `nbf`, `iat`, `jti`, `nonce`, `azp`, `auth_time`, `acr`, `amr`, `at_hash`, `c_hash`, `s_hash`, `sid`, `scope`, `client_id`, `cnf`, `typ`, `events`.
- The introspection fields `active` and `token_type`.
- The OIDC standard claims of §5.1: `name`, `given_name`, `family_name`, `middle_name`, `nickname`, `preferred_username`, `profile`, `picture`, `website`, `email`, `email_verified`, `gender`, `birthdate`, `zoneinfo`, `locale`, `phone_number`, `phone_number_verified`, `address`, `updated_at`.
- Ostiary's `role`.

The console refuses them on save, and the auth server skips them again when it issues a token. To put the platform role in the ID token, use another name, for example `https://example.com/role` with the attribute `user.role`.

### When claims apply

- **Only to that application's tokens**, on every grant: authorization code, refresh, device sign-in, and client credentials. Client credentials have no user, so only the fixed values (**Text** and **JSON**) are added.
- **Access token claims** are in JWT access tokens (requested with `resource`) and in the introspection answer for opaque ones. Introspection has no session, so the `organization.*` claims are left out there.
- **API claims win.** In an API's access tokens, the API's own custom claims (**APIs** > **Tokens**) win over an application claim with the same name.

### Example

With a claim `https://example.com/tenant` (**Text**, `acme`, access token) and a claim `org_role` (attribute `organization.role`, ID token and access token), a JWT access token for that application carries:

```json
{
  "https://example.com/tenant": "acme",
  "org_role": "admin"
}
```

Claims are stored in the `oauth_client_claims` table (deleted with the client) and added through the oauth-provider plugin's claims extension (`packages/core/src/lib/client-claims/extension.ts`). Every change is in the audit log as **Changed token claims**, with the claims' names, tokens and sources, not their values.

## Signing keys

ID tokens and JWT access tokens are signed with an Ed25519 key (`EdDSA`). Apps and APIs verify them against the public keys at `https://auth.example.com/api/auth/jwks`, the `jwks_uri` of the discovery document:

```json
{
  "keys": [
    { "alg": "EdDSA", "crv": "Ed25519", "kty": "OKP", "x": "4Xc0bJ8Q...", "kid": "Wm9Tq2..." }
  ]
}
```

The admin console's **Signing keys** page lists the keys: **Key ID (kid)**, **Algorithm**, **Created**, **Signs until**, **Published until** and **Status**:

| Status | Meaning |
| --- | --- |
| **Current** | Signs every new token |
| **Published for verification** | Retired, still in the JWKS so tokens it signed keep verifying |
| **Expired** | Past its grace period, no longer in the JWKS |

Private keys are stored encrypted with `BETTER_AUTH_SECRET` and never shown. The first key is created when the first token is signed (or the JWKS is first fetched), or when you rotate.

### Rotate the key now

1. Open **Signing keys**.
2. Click **Rotate now**, then confirm with **Rotate now**.

A new key signs every token from then on. The previous key stays in the JWKS for the grace period, so tokens it signed keep verifying until they expire. Rotations are in the audit log as **Rotated signing key**.

> [!WARNING]
> If a key may have leaked, rotate now, then set a short grace period: a retired key verifies tokens for as long as it is published. The grace period applies to keys already retired too.

### Rotate automatically

1. Open **Signing keys**, then **Edit** under **Automatic rotation**.
2. Set **Rotate the key** to every 30, 90, 180 or 365 days, or **Never (rotate by hand only)** (the default).
3. Set the **Grace period**: 1, 7, 30 (the default) or 90 days.
4. Click **Save**.

The new key is created when the first token is signed after the current one reaches that age. Changing the interval also applies to the current key: it retires when it reaches the new age, or at the next token if it is already older. Keep the grace period longer than your longest token lifetime (access tokens: 1 hour, ID tokens: 10 hours). Settings reach the auth server within a minute.

### Verify tokens across rotations

Rotation needs nothing from your apps as long as they read keys from the JWKS by `kid` and fetch it again when they meet an unknown one. `jose`'s `createRemoteJWKSet`, `openid-client`, Auth.js and Better Auth all do. For example, in an API:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://auth.example.com/api/auth";
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/jwks`));

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: "https://api.example.com",
    typ: "at+jwt",
  });
  return payload; // { sub, scope, role, ... }
}
```

Apps that pin a single public key must be updated after each rotation.

## Related

- [Connect an app](connect-an-app.md): register an app and wire an OIDC library
- [Protect an API](protect-an-api.md): APIs, scopes, the `resource` parameter, verification and introspection
- [Organizations](organizations.md): organizations and their claims
- [MCP and AI agents](mcp-and-agents.md): self-registered clients
