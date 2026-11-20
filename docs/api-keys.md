# API keys

Let people and organizations create long-lived API keys for their scripts, scoped to one of your APIs, and check those keys from your API.

An API key is an alternative to OAuth for scripts and tools: no browser, no token refresh. Each key works with one API registered in Ostiary (**APIs**), with some of its scopes, until it expires or is revoked. Your API receives the key and asks Ostiary whether it is valid.

## Turn on API keys

API keys are off by default.

1. In the admin console, open **API keys**.
2. Click **Edit**.
3. Tick **Allow API keys**.
4. Set **Maximum lifetime (days)**: from 1 to 365, 90 by default. Every key expires. Lowering the maximum applies to new keys only.
5. Click **Save**.

Settings reach the auth server within a minute. The page also lists the **APIs accepting keys** and the verification endpoint.

Turning API keys off again refuses every key at verification without deleting them: they work again when you turn it back on.

## Which APIs accept keys

An API accepts keys when it is enabled, declares scopes, and is open to every application (**APIs** > **Applications** shows **Every application**).

An API limited to linked applications (**Only linked applications**) does **not** accept keys: there an admin chose which apps may call it, and a key is not tied to an app, so keys would be a way around that choice. If an API is later disabled, deleted or limited to linked applications, its keys stop working. Scopes removed from an API are removed from its keys' answers.

## Create a key

People create their own keys from their account dashboard:

1. Open **API keys** in the dashboard.
2. Click **Create API key**.
3. Enter a **Name** (64 characters at most), pick the **API** and the **Scopes** the key needs, and choose **Expires after** (7, 30, 90, 180 or 365 days, up to the maximum).
4. Click **Create key**, then copy the key: this is the only time it is shown.

The key is `ost_` followed by 64 random letters (set another prefix with `API_KEY_PREFIX`, see [Configuration](configuration.md)). Ostiary stores only its SHA-256 digest and its first characters, which the lists show to tell keys apart.

- Creating a key needs a sign-in from the last 10 minutes, like adding a passkey. Otherwise the dashboard asks the person to **Sign in again**.
- An admin impersonating the user cannot create one.
- Up to 25 keys per account.
- People list and revoke their own keys on the same page, with when each was created, last used and expires.

## Create a key for an organization

An organization can own keys too, for its shared scripts and services. The organization owns the key, so it keeps working when the member who created it leaves the organization or deletes their account (the key records who created it).

1. Open **Organizations** in the dashboard.
2. On the organization's row, click **API keys**.
3. Create the key as above.

Only owners and admins of the organization see and manage its keys; members do not. The rules are the same as for personal keys (one API and its scopes, expiry within the maximum, shown once, recent sign-in, no impersonation), with up to 50 keys per organization. The default Public workspace never owns keys. See [Organizations](organizations.md#give-an-organization-api-keys).

In the Better Auth API key plugin these are the `organization` configuration (`references: "organization"`, `referenceId` = organization ID). Owners and admins hold the `apiKey` permission in the organization's access control.

## Verify a key in your API

Your API receives the key from the script (how is up to you, for example an `x-api-key` header) and asks Ostiary with `POST /api/auth/api-key/verify`.

### Set up your API as a caller

Only an application an admin registered can call the endpoint:

1. Register a **confidential** application for your API in **Applications** (see [Connect an app](connect-an-app.md)). Keep its client ID and secret on your API's server.
2. Link it to the API: **APIs** > the API's **Applications** > **Change**, then tick it under **Linked applications**. Links work whether or not the API is limited to linked applications. The link also lets the application introspect the API's tokens.

The application authenticates as at `/oauth2/introspect`: HTTP Basic (`client_secret_basic`, the default), or `client_secret_post` or `private_key_jwt` if it is registered that way. Public and self-registered applications are refused with `401 invalid_client`. An application not linked to `resource` gets `403 access_denied`.

### Call the endpoint

```bash
curl -X POST https://auth.example.com/api/auth/api-key/verify \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -H 'content-type: application/json' \
  -d '{"key": "ost_...", "resource": "https://api.example.com"}'
```

`resource` is your API's identifier. Form-encoded bodies work too. A valid personal key:

```json
{
  "valid": true,
  "keyId": "f3kq9Wm2...",
  "ownerType": "user",
  "userId": "iMRpZ3x0eV5mTqQh2wJ8",
  "api": "https://api.example.com",
  "scopes": ["orders:read"],
  "expiresAt": "2026-11-07T15:49:36.523Z"
}
```

A valid organization key has `"ownerType": "organization"`, `"userId": null` and `organizationId`. An invalid key:

```json
{ "valid": false, "error": "invalid_key" }
```

Every answer about the key is HTTP 200. `scopes` are the scopes the key grants now: those it was created with that the API still declares.

| `error` | Meaning |
| --- | --- |
| `invalid_key` | Unknown or revoked key, a key for another API, its owner is banned, or its organization was deleted |
| `expired` | The key has expired. Expired keys are then deleted |
| `rate_limited` | Too many verifications of this key. `retryAfter` gives the seconds to wait |
| `api_unavailable` | The API was disabled, deleted, limited to linked applications, or no longer declares any of the key's scopes |
| `api_keys_disabled` | API keys are turned off in the admin console |

A key made for another API gets `invalid_key`, the same answer as an unknown key, and does not use up that key's rate limit.

### Verify keys in TypeScript

This middleware-style function reads the key from `x-api-key`, verifies it, checks a scope, and caches valid answers for a minute:

```ts
import { createHash } from "node:crypto";

const VERIFY_URL = "https://auth.example.com/api/auth/api-key/verify";
const API = "https://api.example.com";
const BASIC_AUTH =
  "Basic " + Buffer.from(`${process.env.OSTIARY_CLIENT_ID}:${process.env.OSTIARY_CLIENT_SECRET}`).toString("base64");
const CACHE_MS = 60_000;

type KeyOwner =
  | { ownerType: "user"; userId: string }
  | { ownerType: "organization"; userId: null; organizationId: string };

type ValidKey = KeyOwner & { valid: true; keyId: string; api: string; scopes: string[]; expiresAt: string | null };
type InvalidKey = { valid: false; error: string; retryAfter?: number };

const cache = new Map<string, { answer: ValidKey; until: number }>();

async function verifyApiKey(key: string): Promise<ValidKey | InvalidKey> {
  const cacheKey = createHash("sha256").update(key).digest("hex");
  const cached = cache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.answer;

  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { authorization: BASIC_AUTH, "content-type": "application/json" },
    body: JSON.stringify({ key, resource: API }),
  });
  // 401/403 here means the API's own credentials or link are wrong, not the key.
  if (!response.ok) throw new Error(`API key verification failed: HTTP ${response.status}`);

  const answer = (await response.json()) as ValidKey | InvalidKey;
  if (answer.valid) cache.set(cacheKey, { answer, until: Date.now() + CACHE_MS });
  return answer;
}

/** Returns the key's owner and scopes, or a Response to send back. */
export async function requireApiKey(request: Request, scope: string): Promise<ValidKey | Response> {
  const key = request.headers.get("x-api-key");
  if (!key) return Response.json({ error: "missing_api_key" }, { status: 401 });

  const answer = await verifyApiKey(key);
  if (!answer.valid) {
    const headers = answer.retryAfter ? { "retry-after": String(answer.retryAfter) } : undefined;
    return Response.json({ error: answer.error }, { status: answer.error === "rate_limited" ? 429 : 401, headers });
  }
  if (!answer.scopes.includes(scope)) return Response.json({ error: "insufficient_scope" }, { status: 403 });
  return answer;
}
```

Use it in a route handler:

```ts
export async function GET(request: Request) {
  const auth = await requireApiKey(request, "orders:read");
  if (auth instanceof Response) return auth;
  // auth.ownerType, auth.userId or auth.organizationId tell you whose data to return.
  return Response.json({ orders: [] });
}
```

### Rate limits

- 300 verifications per key per minute.
- 600 verifications per minute per calling IP address on the endpoint (production).

Cache a valid answer for a short while (a minute or so) rather than verifying on every request, as above. A revoked key then stops working within that time.

## Manage and revoke keys

Admins see every key in the admin console: **API keys** > **All keys** (owner, API, scopes, last used, expires), and **Revoke** any of them. A user's keys are also on their page under **Users**, and an organization's keys on its page under **Organizations**.

Keys are also removed when:

| Event | What happens |
| --- | --- |
| A user is banned (admin console, or SCIM deactivation) | Their personal keys are deleted. A ban written any other way is still checked at verification |
| A user deletes their account | Their personal keys are deleted. Their organizations' keys keep working |
| An organization is deleted | Its keys are deleted |
| A key expires | It is refused, then deleted |
| API keys are turned off | Every key is refused, none is deleted |

A password reset revokes the user's OAuth tokens but keeps their API keys. Creations and revocations are in the audit log (**Created API key**, **Revoked API key**, **Revoked all API keys**), with the organization as target for its keys, and settings changes as **Changed API key settings**.

## A key is never a session

The Better Auth plugin can turn API keys into sessions (`enableSessionForAPIKeys`); Ostiary keeps that off. A key sent to Ostiary itself (`x-api-key`, `Authorization: Bearer`, anything) signs nobody in, on the auth app or the admin console.

The plugin's own HTTP endpoints (`/api-key/create`, `/api-key/list`, `/api-key/get`, `/api-key/update`, `/api-key/delete`) are closed: keys are managed only from the dashboard and the admin console, which apply the rules above.

## Related

- [Protect an API](protect-an-api.md): register APIs, scopes and linked applications
- [Organizations](organizations.md)
- [Tokens and claims](tokens-and-claims.md)
