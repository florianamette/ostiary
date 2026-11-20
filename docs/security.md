# Security

How Ostiary protects accounts, admin access, tokens and secrets, and the production settings to get right: rate limits, `COOKIE_DOMAIN` and client IP.

## Accounts and sign-in

- **Email changes** need approval from the current inbox, and the current address must be verified first: a stolen session alone cannot move an account.
- **Recent sign-in.** Adding a passkey or connecting a social account needs a sign-in from the last 10 minutes; so does exporting your data. Deleting an account needs the password (or a recent sign-in) and an emailed confirmation, see [Your data](account-data.md).
- **Two-factor authentication** (authenticator app or backup code) applies to every way of signing in except passkeys, which are already two factors: passwords, emailed sign-in codes, social providers (including Google One Tap), SSO and the email verification link all stop at the code step for an account that has it. A device trusted for 30 days skips it, whatever the method. Backup codes and authenticator secrets are stored encrypted. See [Sign-in methods](sign-in-methods.md).
- **Account linking.** Signing in with a provider whose verified email matches an existing account links the two only when that account's email is verified too, and never for an account with two-factor authentication or a platform admin: their owners connect the provider from the account page instead.
- **Sign-in codes** open existing accounts only (an unknown address gets the same answer and no email), expire after 10 minutes, are stored hashed and are void after 3 wrong tries. On an account whose email was never verified, the first code verifies it and removes the unproven password and sessions.
- **Redirects after sign-in.** `callbackURL` is followed only to a path on the same app or to the auth or admin app's origin; backslashes, control characters and other origins are refused (`packages/core/src/lib/safe-redirect.ts`).

## Admins and roles

- Platform roles are `admin` and `user` only.
- `ADMIN_EMAILS` promotes an address only once its owner has proven the inbox (verification link, sign-in code, or a social provider that reports the address verified), never through SSO or SCIM. See [Configuration](configuration.md#admins).
- **Admins must turn on two-factor authentication** (`REQUIRE_ADMIN_2FA`, on by default). An admin without it is sent to set it up and cannot use the console or the admin endpoints (`/admin/*`, registering an SSO provider, creating an organization) until then; their own account keeps working. An admin who loses their authenticator and backup codes can have another admin reset it from the user's page (audited).
- **Impersonation.** An admin impersonating an account cannot add a passkey to it, connect a provider or delete it. Impersonation is recorded in the audit log, and the session is marked as impersonated on the user's page.
- An admin cannot delete their own account.
- **Admin API.** The admin console's JSON routes (`/api/admin/*`) refuse any request whose `Origin` is not the console's own, and writes that are not JSON, before reading the session. The session cookie may be sent from any subdomain of `COOKIE_DOMAIN`, so this check is what stops another subdomain from acting as an admin.
- **Audit log.** Every change made from the console or the admin API is recorded. The audit log never stores passwords, secrets or session tokens. CSV exports of users and the audit log are audited too, and neutralize cells that a spreadsheet would run as a formula.

See [Admin console](admin-console.md) for who can use it.

## OAuth clients and APIs

- Only platform admins manage OAuth clients, from the admin console; Better Auth's client endpoints are closed to everyone else.
- Console-registered clients belong to the platform (any admin, nobody else), so an admin who loses the role loses control of them.
- A client counts as admin-registered only with the console's explicit mark; any other client gets the self-registration limits, also on later updates. Device sign-in is for admin-registered clients only. See [MCP and agents](mcp-and-agents.md).
- Tokens for an API never carry another API's scopes. See [Protect an API](protect-an-api.md).
- The session JWT endpoint (`/token`) and header are off: nothing uses them, and they would be signed with the access tokens' key.
- **Signing keys** can be rotated on a schedule or on demand (**Signing keys**); retired keys stay published only for the grace period. Rotations and setting changes are in the audit log. See [Tokens and claims](tokens-and-claims.md).

## Organizations, SSO and SCIM

- Only admins can create organizations and register SSO providers.
- An SSO provider's domain must be one plain lowercase hostname (`acme.com`) and be verified with a DNS record; a provider whose stored domain is anything else is refused at sign-in. Providers are changed and deleted only from the admin console (Better Auth's provider management endpoints are closed).
- SAML sign-ins are SP-initiated only, with signed responses, audience, recipient, `InResponseTo` and one-time assertion checks. A SAML response with a DTD, or that is not plain base64, is refused before any XML parser runs. See [Enterprise SSO](enterprise-sso.md).
- Every account is a member of the Public organization; its member list, invitations, teams and member changes are for platform admins only.
- SCIM tokens are stored as HMAC digests, can only be issued by platform admins, and each one only reaches its own organization. See [SCIM](scim.md).

## API keys

API keys are stored as SHA-256 digests, always expire, never act as a session, and are verified only by applications linked to the key's API. Banning or deleting an account revokes its keys; deleting an organization deletes the organization's keys. See [API keys](api-keys.md).

## Revoking access

Banning an account or resetting its password also revokes its OAuth access and refresh tokens (as SCIM deactivation does): apps lose access at their next refresh. JWT access tokens already issued stay valid until they expire (an hour by default).

## Secrets at rest

| What | How it is stored |
| --- | --- |
| Social provider secrets (client secrets, Apple's private key), webhook signing secrets | Encrypted with AES-256-GCM, under a key derived from `BETTER_AUTH_SECRET`; provider secrets are never sent back to the browser |
| Authenticator secrets, backup codes | Encrypted (Better Auth's two-factor plugin) |
| Sign-in codes | Hashed |
| SCIM tokens | HMAC-SHA-256 digests, keyed by `SCIM_TOKEN_SECRET` or a key derived from `BETTER_AUTH_SECRET` |
| API keys | SHA-256 digests |

Changing `BETTER_AUTH_SECRET` therefore means entering the provider and webhook secrets again, see [Configuration](configuration.md#required).

## Browser protections

- **Content Security Policy.** Pages are served with a nonce-based policy (`'strict-dynamic'`, no `'unsafe-inline'` or `'unsafe-eval'` for scripts in production), set per request by each app's `proxy.ts` from `packages/core/src/lib/csp.ts`. Google One Tap's sources are allowed on the sign-in and sign-up pages only. Pages are therefore rendered per request. Forks adding a third-party script must add its origin there and load it with `next/script` (or from a script that already runs).
- **App icons** are fetched by Ostiary, never by the user's browser, so the app's site and favicon services don't learn who uses which app. The fetch uses the webhook SSRF guard: https on port 443 only, public addresses only, pinned connections, two redirects at most, size and time limits, image types checked from the bytes. Icons and branding images are served with a CSP that blocks scripts.
- **Health checks** (`/api/health`) answer only `{"status":"ok"}` or `{"status":"unavailable"}`: no version, no error details.

## Rate limiting

Better Auth counts requests per client IP and endpoint. Ostiary keeps the counts in Postgres (table `rate_limit`, migration `0005_rate_limit`) instead of each server's memory: on Vercel every function instance has its own memory, so in-memory limits barely apply. Rate limiting is on in production and off in development; set `RATE_LIMIT_ENABLED=true` to try it locally, or `false` to turn it off.

A refused request gets `429 Too Many Requests` with a `Retry-After` header (seconds) and this body:

```json
{ "code": "RATE_LIMITED", "message": "Too many requests. Please try again later.", "retryAfter": 42 }
```

The sign-in, code, two-factor and device screens show "Too many attempts. Try again in 42 seconds." in the user's language. A rule allows `max` requests, then refuses until `window` seconds have passed since the last allowed one.

| Endpoint | Limit per IP | Why |
| --- | --- | --- |
| `/sign-in/email`, `/sign-in/username` | 10 per minute | Password guessing; room for several people behind one address |
| `/sign-in/social` | 60 per minute | Only returns the provider's authorization URL; room for an office signing in at once |
| `/one-tap/callback` | 60 per minute | Google One Tap: checks a Google-signed ID token |
| `/sign-up/email` | 10 per 5 minutes | Each sends a verification email |
| `/request-password-reset`, `/send-verification-email` | 5 per 10 minutes | Each sends an email to any address |
| `/delete-user` | 5 per 10 minutes | Checks a password, then emails a confirmation link |
| `/email-otp/send-verification-otp`, `/sign-in/email-otp` | 3 per minute | Sign-in codes (also void after 3 wrong tries) |
| `/two-factor/verify-totp`, `/two-factor/verify-backup-code`, `/two-factor/verify-otp` | 5 per minute | Second step; the account also locks after repeated wrong codes |
| `/two-factor/send-otp` | 3 per minute | |
| Other `/two-factor/*` | 3 per 10 seconds | Better Auth's default |
| `/device` (code lookup) | 5 per 10 minutes | Device user codes |
| `/device/approve`, `/device/deny` | 10 per minute | |
| `/oauth2/token` | 300 per minute | Machine clients, refreshes and device polling share server addresses; every credential it takes is long and random |
| `/api-key/verify` | 600 per minute | API servers verifying their users' keys; each key also has its own limit (300 a minute) |
| `/oauth2/register` | 5 per minute | Plus the hourly cap set in the admin console |
| `/oauth2/authorize`, `/oauth2/userinfo`, `/oauth2/introspect`, `/oauth2/revoke` | 30, 60, 100, 30 per minute | Better Auth's OAuth provider defaults |
| Other `/sign-in/*`, `/sign-up/*`, `/change-password`, `/change-email` | 3 per 10 seconds | Better Auth's default |
| `/get-session`, `/jwks` | none | Hot, read-only, nothing to guess |
| Anything else | 100 per 10 seconds | Better Auth's default |

The admin console's JSON API (`/api/admin/*`) has its own limit: 120 writes a minute per admin and IP, on whenever rate limiting is.

The rules are in `packages/core/src/lib/rate-limit.ts`. Limits are per address, so an office or a classroom behind one IP shares them: raise a rule there if your users sign in from large shared networks. If everyone gets 429s at once, the apps probably cannot see the client IP, see [Client IP](#client-ip).

**Table size.** One row per client IP and endpoint. When a counter's window ends, Better Auth deletes the rows not used for longer than the longest window (10 minutes), so the table holds roughly the addresses seen in the last 10 minutes; no cron job is needed. Each counted request costs two small queries (read, then a conditional update or insert).

**Redis (optional, not built in).** For heavy traffic, Better Auth can keep the counts in a key-value store instead: pass `secondaryStorage` (with an atomic `increment`, e.g. Upstash Redis) to `betterAuth()` and set `rateLimit.storage: "secondary-storage"` in `packages/core/src/lib/auth-factory.ts`. Note that `secondaryStorage` also moves sessions and verification values out of Postgres.

## COOKIE_DOMAIN

`COOKIE_DOMAIN=.example.com` lets the admin console read the session the auth app created, so one sign-in covers both. The price: browsers send Better Auth's cookies, the session token included (`httpOnly` and `Secure`, but a bearer credential all the same), to **every** host under `example.com`, and any of those hosts can also set cookies for the whole domain.

- Use a domain where every subdomain runs code you trust: no user-generated sites, no third-party SaaS on a CNAME (help desk, status page, marketing tools), no forgotten DNS records pointing at released cloud resources (subdomain takeover). Any of them would receive the session cookies of everyone who visits it while signed in, admins included.
- Prefer a dedicated parent domain for identity (e.g. `auth.example.com` and `admin.auth.example.com` with `COOKIE_DOMAIN=.auth.example.com`) over your main domain.
- Set it on both apps, with the same value.

The admin console has no sign-in page of its own: it sends signed-out visitors to the auth app's login page. When the two apps are on different hosts without `COOKIE_DOMAIN`, the console never receives the session cookie, and the browser goes back and forth between the two apps, see [Troubleshooting](troubleshooting.md#the-admin-console-keeps-sending-you-back-to-the-sign-in-page). Locally both apps run on `localhost`, where cookies are shared across ports, so you leave it unset.

Sessions created before you set `COOKIE_DOMAIN` have host-only cookies. The auth app re-issues them on the parent domain the next time a signed-in visitor opens its login page, so nobody has to sign in again.

## Client IP

Rate limits, the IP stored with sessions, the audit log and the sign-in history all need the real client address, and all resolve it the same way (Better Auth's `getIPFromHeader`, with the settings below).

> [!WARNING]
> **Not on Vercel? Set `IP_ADDRESS_HEADERS` or `TRUSTED_PROXIES`.** Off Vercel, Ostiary trusts no header unless one of them is set: a client that reaches the app directly could otherwise put any address in `x-forwarded-for` and get a fresh rate-limit counter (and a made-up IP in the audit log) on every request. With neither set, every client shares one counter per endpoint (a busy site will see 429s for everyone) and no IP is recorded; in production the apps log a warning at startup that starts with `[ip] Not on Vercel and neither IP_ADDRESS_HEADERS nor TRUSTED_PROXIES is set`.

Pick the line that matches your setup:

| Setup | Setting |
| --- | --- |
| Vercel | Nothing (detected from `VERCEL=1`). Vercel overwrites `x-forwarded-for` with the client's address, so clients cannot spoof it; Ostiary reads it when it holds a single address |
| Behind Cloudflare | `IP_ADDRESS_HEADERS=cf-connecting-ip` (only if the origin accepts traffic from Cloudflare alone) |
| Behind nginx, a load balancer or several proxies that append to `x-forwarded-for` | `TRUSTED_PROXIES` set to their addresses (e.g. `10.0.0.0/8`). The client IP is then the right-most address that is not a trusted proxy. Or have the proxy overwrite a header (`proxy_set_header X-Real-IP $remote_addr;`) and set `IP_ADDRESS_HEADERS=x-real-ip` |
| A proxy that overwrites `x-forwarded-for` with the client's address (not appends to it) | `IP_ADDRESS_HEADERS=x-forwarded-for` |
| Exposed directly, no proxy | Clients control every header, so leave both unset (one shared counter per endpoint) and put a proxy in front |

Never name a header your proxy passes through from the client: anyone could then pick their own IP. A header with several addresses is ignored unless `TRUSTED_PROXIES` says which of them are your proxies. When no trusted address is found, all such requests share a single counter per endpoint, and the audit log and sign-in history record no IP rather than a guessed one. They keep IPv6 addresses whole, written in full (`2001:0db8:0000:…:0001`), where rate limits group them by /64.

## Report a vulnerability

Found a vulnerability? Please email the maintainer rather than opening a public issue.

## Related

- [Configuration](configuration.md): every variable mentioned here
- [Self-hosting](self-hosting.md): reverse proxy settings
- [Troubleshooting](troubleshooting.md)
