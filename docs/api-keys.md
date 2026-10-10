# API keys for your APIs

People can create **API keys** for their scripts and tools, for one of the APIs registered in Ostiary (admin console, **APIs**). Off by default: turn them on in the admin console, **API keys**, and set the maximum lifetime (90 days by default, 365 at most).

**Creating a key** (account page, **API keys**): a name, one API, some of that API's scopes, and an expiry within the maximum. The key (`ost_` and 64 random letters) is shown once; Ostiary stores only its SHA-256 digest and its first characters. Creating a key needs a sign-in from the last 10 minutes, like adding a passkey, and an admin impersonating the user cannot create one. Up to 25 keys per account. Users list and revoke their keys on the same page; admins see every key (owner, API, scopes, created, last used, expires) and revoke any of them, also from the user's page. Creations and revocations are in the audit log.

**Organization keys.** An organization can own keys too, for its shared scripts and services: the organization owns the key, so it keeps working when the member who created it leaves the organization or deletes their account (the key records who created it). Owners and admins of the organization manage them in the account page, **Organizations**, **API keys** under the organization; members do not see them. Same rules as personal keys (one API and its scopes, expiry within the maximum, shown once, recent sign-in, no impersonation), up to 50 keys per organization, never for the default Public workspace. Deleting the organization deletes its keys. Admins see them on the organization's page in the admin console and on **API keys**, and revoke them. Creations and revocations are in the audit log with the organization as target. In the Better Auth plugin these are the `organization` configuration (`references: "organization"`, `referenceId` = organization id); owners and admins hold the `apiKey` permission in the organization's access control.

Which APIs accept keys: every enabled API that declares scopes and is open to every application. **Not** an API limited to linked applications: there an admin chose which apps may call it, and a key is not tied to an app, so keys would be a way around that choice. If an API is later disabled, deleted or limited to linked applications, its keys stop working; scopes removed from an API are removed from its keys' answers.

**Verifying a key (in your API).** Your API receives the key from the script (how is up to you, for example an `x-api-key` header) and asks Ostiary:

```bash
curl -X POST https://auth.example.com/api/auth/api-key/verify \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -H 'content-type: application/json' \
  -d '{"key": "ost_...", "resource": "https://api.example.com"}'

# {"valid": true, "keyId": "...", "ownerType": "user", "userId": "...", "api": "https://api.example.com",
#  "scopes": ["orders:read"], "expiresAt": "2026-11-07T15:49:36.523Z"}
# {"valid": true, "keyId": "...", "ownerType": "organization", "userId": null, "organizationId": "...",
#  "api": "https://api.example.com", "scopes": ["orders:read"], "expiresAt": "..."}
# {"valid": false, "error": "invalid_key"}
```

- **Who may call it.** Your API authenticates as a confidential application registered by an admin (Applications), with HTTP Basic as above (`client_secret_basic`, the default), or `client_secret_post` / `private_key_jwt` if the application is registered that way: the same client authentication as `/oauth2/introspect`. That application must be **linked** to the API (APIs, Access, "Linked applications"; links work whether or not the API is limited to them), which is also what lets it introspect the API's tokens. Public and self-registered applications are refused (`401 invalid_client`); an application not linked to `resource` gets `403 access_denied`.
- **Audience.** `resource` is your API's identifier. A key made for another API gets `invalid_key`, the same answer as an unknown key, and does not use up that key's rate limit.
- **Answers** (HTTP 200): `valid: true` with the owner (`ownerType` `"user"` and `userId`, or `"organization"`, `organizationId` and `userId: null`) and the scopes the key grants; or `valid: false` with `error`: `invalid_key` (unknown, revoked, for another API, its owner is banned, or its organization was deleted), `expired`, `rate_limited` (with `retryAfter` in seconds), `api_unavailable` (the API was disabled, deleted or limited to linked applications), `api_keys_disabled` (turned off in the admin console). Form-encoded bodies work too.
- **Rate limits.** 300 verifications per key per minute, and 600 per minute per calling address on the endpoint. Cache a successful answer for a short while (a minute or so) rather than verifying on every request; revocation then takes effect within that time.

**A key is never a session.** The Better Auth plugin can turn API keys into sessions (`enableSessionForAPIKeys`); Ostiary keeps that off. A key sent to Ostiary itself (`x-api-key`, `Authorization: Bearer`, anything) signs nobody in, on the auth app or the admin console. The plugin's own HTTP endpoints (`/api-key/create`, `/list`, `/get`, `/update`, `/delete`) are closed: keys are managed only from the account page and the admin console, which apply the rules above.

**Revocation.** Banning a user (admin console, or SCIM deactivation) deletes their personal keys; deleting the account deletes them too. Neither touches the keys of their organizations; deleting an organization deletes its keys. A ban written any other way is still checked at verification. Turning API keys off in the admin console refuses every key without deleting them. Expired keys are refused, then deleted.

Keys belong to users. The plugin also supports keys owned by an organization; Ostiary does not offer them yet (they need per-organization roles for managing keys).
