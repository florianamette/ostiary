# Security

- Email changes need approval from the current inbox; a stolen session alone cannot move an account.
- Adding a passkey or connecting an account needs a sign-in from the last 10 minutes; so does exporting your data. Deleting an account needs the password (or a recent sign-in) and an emailed confirmation, see [Your data](account-data.md#your-data-export-and-account-deletion).
- Two-factor authentication (authenticator app or backup code) applies to every way of signing in except passkeys, which are already two factors: passwords, emailed sign-in codes, social providers (including Google One Tap), SSO and the email verification link all stop at the code step for an account that has it (a device trusted for 30 days skips it, whatever the method). Backup codes and authenticator secrets are stored encrypted.
- Signing in with a provider whose verified email matches an existing account links the two only when that account's email is verified too, and never for an account with two-factor authentication or a platform admin: their owners connect the provider from the account page instead.
- Admins must turn on two-factor authentication (`REQUIRE_ADMIN_2FA`). An admin without it is sent to set it up and cannot use the console or the admin endpoints until then; their own account keeps working. An admin who loses their authenticator and backup codes can have another admin reset it from the user's page (audited).
- Sign-in codes open existing accounts only (an unknown address gets the same answer and no email), expire after 10 minutes, are stored hashed and are void after 3 wrong tries. On an account whose email was never verified, the first code verifies it and removes the unproven password and sessions.
- Only platform admins manage OAuth clients, from the admin console; Better Auth's client endpoints are closed to everyone else. Console-registered clients belong to the platform (any admin, nobody else), so an admin who loses the role loses control of them. A client counts as admin-registered only with the console's explicit mark; any other client gets the self-registration limits, also on later updates. Tokens for an API never carry another API's scopes.
- Only admins can create organizations and register SSO providers; an SSO provider's domain must be one plain hostname (`acme.com`) and be verified with a DNS record, and a provider whose stored domain is anything else is refused at sign-in. Providers are changed and deleted only from the admin console (Better Auth's provider management endpoints are closed).
- Every account is a member of the Public organization; its member list, invitations, teams and member changes are for platform admins only. SAML sign-ins are SP-initiated only, with signed responses, audience, recipient, `InResponseTo` and one-time assertion checks (see [Enterprise SSO with SAML 2.0](enterprise-sso.md#enterprise-sso-with-saml-20)).
- SCIM tokens are stored as HMAC digests and can only be issued by platform admins; each one only reaches its own organization.
- API keys are stored as SHA-256 digests, always expire, never act as a session, and are verified only by applications linked to the key's API. Banning or deleting an account revokes its keys; deleting an organization deletes the organization's keys.
- Banning an account or resetting its password also revokes its OAuth access and refresh tokens (as SCIM deactivation does): apps lose access at their next refresh. JWT access tokens already issued stay valid until they expire (an hour by default).
- Platform roles are `admin` and `user` only. An admin impersonating an account cannot add a passkey to it or connect a provider.
- Token signing keys can be rotated on a schedule or on demand (**Signing keys**); retired keys stay published only for the grace period. Rotations and setting changes are in the audit log.
- Social provider secrets (client secrets, Apple's private key) are encrypted at rest with AES-256-GCM, under a key derived from `BETTER_AUTH_SECRET`, and never sent back to the browser.
- The audit log never stores passwords, secrets or session tokens.
- App icons are fetched by Ostiary, never by the user's browser (so the app's site and favicon services don't learn who uses which app), with the webhook SSRF guard: https on port 443 only, public addresses only, pinned connections, two redirects at most, size and time limits, image types checked from the bytes. They are served with a CSP that blocks scripts.
- Sign-in, codes, password reset and the token endpoint are rate limited per client IP, see below.
- Pages are served with a nonce-based Content Security Policy (`'strict-dynamic'`, no `'unsafe-inline'` or `'unsafe-eval'` for scripts in production), set per request by each app's `proxy.ts` from `packages/core/src/lib/csp.ts`; Google One Tap's sources are allowed on the sign-in and sign-up pages only. Pages are therefore rendered per request. Forks adding a third-party script must add its origin there and load it with `next/script` (or from a script that already runs).
- After sign-in, `callbackURL` is followed only to a path on the same app or to the auth or admin app's origin; backslashes, control characters and other origins are refused (`packages/core/src/lib/safe-redirect.ts`).

## Rate limiting

Better Auth counts requests per client IP and endpoint. Ostiary keeps the counts in Postgres (table `rate_limit`, migration `0005_rate_limit`) instead of each server's memory: on Vercel every function instance has its own memory, so in-memory limits barely apply. It is on in production and off in development; set `RATE_LIMIT_ENABLED=true` to try it locally.

A refused request gets `429 Too Many Requests` with a `Retry-After` header (seconds) and `{"code": "RATE_LIMITED", "retryAfter": 42, "message": "..."}`. The sign-in, code, two-factor and device screens show "Try again in 42 seconds" in the user's language. A rule allows `max` requests, then refuses until `window` seconds have passed since the last allowed one.

| Endpoint | Limit per IP | Why |
| --- | --- | --- |
| `/sign-in/email`, `/sign-in/username` | 10 per minute | Password guessing; room for several people behind one address |
| `/sign-in/social` | 60 per minute | Only returns the provider's authorization URL; room for an office signing in at once |
| `/one-tap/callback` | 60 per minute | Google One Tap: checks a Google-signed ID token |
| `/sign-up/email` | 10 per 5 minutes | Each sends a verification email |
| `/request-password-reset`, `/send-verification-email` | 5 per 10 minutes | Each sends an email to any address |
| `/email-otp/send-verification-otp`, `/sign-in/email-otp` | 3 per minute | Sign-in codes (also void after 3 wrong tries) |
| `/two-factor/verify-totp`, `/verify-backup-code`, `/verify-otp` | 5 per minute | Second step; the account also locks after repeated wrong codes |
| `/device` (code lookup) | 5 per 10 minutes | Device user codes |
| `/device/approve`, `/device/deny` | 10 per minute | |
| `/oauth2/token` | 300 per minute | Machine clients, refreshes and device polling share server addresses; every credential it takes is long and random |
| `/api-key/verify` | 600 per minute | API servers verifying their users' keys; each key also has its own limit (300 a minute) |
| `/oauth2/register` | 5 per minute | Plus the hourly cap set in the admin console |
| `/oauth2/authorize`, `/oauth2/userinfo`, `/oauth2/introspect` | 30, 60, 100 per minute | Better Auth's OAuth provider defaults |
| `/get-session`, `/jwks` | none | Hot, read-only, nothing to guess |
| Anything else | 100 per 10 seconds | Better Auth's default |

The rules are in `packages/core/src/lib/rate-limit.ts`. Limits are per address, so an office or a classroom behind one IP shares them: raise a rule there if your users sign in from large shared networks.

**Table size.** One row per client IP and endpoint. When a counter's window ends, Better Auth deletes the rows not used for longer than the longest window (10 minutes), so the table holds roughly the addresses seen in the last 10 minutes; no cron job is needed. Each counted request costs two small queries (read, then a conditional update or insert).

**Redis (optional, not built in).** For heavy traffic, Better Auth can keep the counts in a key-value store instead: pass `secondaryStorage` (with an atomic `increment`, e.g. Upstash Redis) to `betterAuth()` and set `rateLimit.storage: "secondary-storage"` in `packages/core/src/lib/auth-factory.ts`. Note that `secondaryStorage` also moves sessions and verification values out of Postgres.

## COOKIE_DOMAIN

`COOKIE_DOMAIN=.example.com` lets the admin console read the session the auth app created, so one sign-in covers both. The price: browsers send Better Auth's cookies, the session token included (`httpOnly` and `Secure`, but a bearer credential all the same), to **every** host under `example.com`, and any of those hosts can also set cookies for the whole domain.

- Use a domain where every subdomain runs code you trust: no user-generated sites, no third-party SaaS on a CNAME (help desk, status page, marketing tools), no forgotten DNS records pointing at released cloud resources (subdomain takeover). Any of them would receive the session cookies of everyone who visits it while signed in, admins included.
- Prefer a dedicated parent domain for identity (e.g. `auth.example.com` and `admin.auth.example.com` with `COOKIE_DOMAIN=.auth.example.com`) over your main domain.
- Without `COOKIE_DOMAIN`, each app keeps host-only cookies: the admin console then needs its own sign-in.

## Client IP

Rate limits, the IP stored with sessions, the audit log and the sign-in history all need the real client address, and all resolve it the same way (Better Auth's `getIPFromHeader`, with the settings below).

> **Not on Vercel? Set `IP_ADDRESS_HEADERS` or `TRUSTED_PROXIES`.** Off Vercel, Ostiary trusts no header unless one of them is set: a client that reaches the app directly could otherwise put any address in `x-forwarded-for` and get a fresh rate-limit counter (and a made-up IP in the audit log) on every request. With neither set, every client shares one counter per endpoint (a busy site will see 429s for everyone) and no IP is recorded; the apps log a warning at startup.

- **Vercel**: nothing to set (detected from `VERCEL=1`). Vercel overwrites `x-forwarded-for` with the client's address, so clients cannot spoof it; Ostiary reads it when it holds a single address.
- **Behind Cloudflare**: `IP_ADDRESS_HEADERS=cf-connecting-ip` (only if the origin accepts traffic from Cloudflare alone).
- **Behind nginx, a load balancer or several proxies** that append to `x-forwarded-for`: set `TRUSTED_PROXIES` to their addresses (e.g. `10.0.0.0/8`). The client IP is then the right-most address that is not a trusted proxy. Or have the proxy overwrite a header (`proxy_set_header X-Real-IP $remote_addr;`) and set `IP_ADDRESS_HEADERS=x-real-ip`.
- **A proxy that overwrites `x-forwarded-for`** with the client's address (not appends to it): `IP_ADDRESS_HEADERS=x-forwarded-for`.
- **Exposed directly, no proxy**: clients control every header, so leave both unset (one shared counter per endpoint) and put a proxy in front.

Never name a header your proxy passes through from the client: anyone could then pick their own IP. When no trusted address is found, all such requests share a single counter per endpoint, and Better Auth logs a warning. The audit log and sign-in history then record no IP rather than a guessed one. They keep IPv6 addresses whole, written in full (`2001:0db8:0000:…:0001`), where rate limits group them by /64.

Found a vulnerability? Please email the maintainer rather than opening a public issue.
