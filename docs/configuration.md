# Configuration

Every environment variable the auth app and the admin console read, grouped by topic, with its default and the app that uses it.

Both apps validate their environment when they start (`packages/core/src/lib/env.ts`). An empty value (`NAME=` in a copied `.env` file) counts as unset. A missing or invalid variable stops the app with `Invalid environment variables` and one message per variable, see [Troubleshooting](troubleshooting.md#the-app-stops-with-invalid-environment-variables).

Where to put them:

| Setup | File |
| --- | --- |
| Local development | `apps/auth/.env.local` and `apps/admin/.env.local`, copied from each app's `.env.example` |
| Docker Compose | `.env` next to `docker-compose.yml`, copied from `.env.docker.example` (see [Self-hosting](self-hosting.md)) |
| Vercel | Each project's environment variables (see [Deploy on Vercel](deploy-vercel.md)) |

The **App** column says which app reads the variable: `auth` (`apps/auth`), `admin` (`apps/admin`) or `both`. Give a variable marked `both` the same value in both apps.

## Required

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | both | none, **required** | Postgres connection string, the same for both apps. `sslmode=require`, `prefer` and `verify-ca` are rewritten to `verify-full`, which is what the `pg` driver applies anyway |
| `BETTER_AUTH_SECRET` | both | none, **required** | At least 32 characters, the same for both apps (`openssl rand -base64 32`). Signs sessions and encrypts stored social provider secrets and webhook signing secrets: changing it means entering those again, and invalidates SCIM tokens unless `SCIM_TOKEN_SECRET` is set |
| `RESEND_API_KEY` | both | none, **required in production** | [Resend](https://resend.com/api-keys) API key, for verification, password reset, sign-in code and invitation emails |
| `RESEND_FROM` | both | none, **required in production** | Sender on a domain verified in Resend, e.g. `Ostiary <auth@example.com>` |

"In production" means `NODE_ENV=production`, which `next build`, `next start` and the Docker images set. In development, without the two `RESEND_*` variables, emails are not sent and the link or code is printed to the console instead (`[email] Resend not configured; ...`).

## URLs and domains

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `AUTH_APP_URL` | both | none; **required by the admin console** | Public URL of the auth app, e.g. `https://auth.example.com`. It is the OAuth issuer (`$AUTH_APP_URL/api/auth`) and the base of links in emails. Takes precedence over `BETTER_AUTH_URL` |
| `ADMIN_APP_URL` | both | none; **required by the admin console** | Public URL of the admin console. Trusted as a sign-in `callbackURL` and as an origin for requests to the auth API |
| `BETTER_AUTH_URL` | both | inferred on Vercel, else `http://localhost:$PORT` | The auth app's public URL, used when `AUTH_APP_URL` is unset. Outside Vercel, production needs this or `AUTH_APP_URL` |
| `NEXT_PUBLIC_APP_URL` | auth | same origin | The auth app's URL as the browser sees it. **Build time** |
| `NEXT_PUBLIC_ADMIN_APP_URL` | auth | `/` | Target of the **Admin** link in an admin's account menu, and an allowed `callbackURL` after a password, passkey or two-factor sign-in. **Build time** |
| `COOKIE_DOMAIN` | both | unset (host-only cookies) | Parent domain shared by both apps, e.g. `.example.com`, so one sign-in covers both. Read [COOKIE_DOMAIN](security.md#cookie_domain) before setting it |
| `PORT` | both | `3000` | Port in the `http://localhost:$PORT` fallback URL. The `dev` and `start` scripts listen on 3000 (auth) and 3001 (admin) whatever it says; the Docker images listen on `PORT` |

Without `AUTH_APP_URL` or `BETTER_AUTH_URL`, the URL is inferred in this order: `https://$VERCEL_PROJECT_PRODUCTION_URL` on a Vercel production deployment, `https://$VERCEL_URL` on a Vercel preview or development deployment, then `http://localhost:$PORT`.

## Admins

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `ADMIN_EMAILS` | auth | empty | Comma-separated addresses that get the platform `admin` role once the address is proven: by the verification link or a sign-in code for a password sign-up, or at sign-up through a social provider that reports the address as verified. Never through SSO or SCIM. It acts only at sign-up and at verification: an account that already exists with a verified address is not promoted (use **Users** > row menu > **Make admin**), and removing an address does not demote anyone |
| `REQUIRE_ADMIN_2FA` | both | `true` | `true`: admins must turn on two-factor authentication before they can use the admin console or the admin endpoints. `false` lets them in without it. Set the same value in both apps |

See [Admin console](admin-console.md#who-can-use-the-console).

## Email

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `EMAIL_DEDUP` | both | `off` | One account per inbox. `gmail`: an address that reaches an existing account's Gmail inbox is refused at sign-up, on email change and in [user imports](import-users.md) (Gmail ignores dots and anything after `+`, and `googlemail.com` is `gmail.com`). `plus`: the same, and the `+tag` is also ignored on every other domain (only if your users' mail servers deliver `user+tag@` to `user@`). The refusal reads like the one for a taken address, so it does not tell who has an account. Accounts created by an admin, SSO or SCIM are not checked, and existing accounts are left as they are |

`RESEND_API_KEY` and `RESEND_FROM` are in [Required](#required).

## APIs, tokens and API keys

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `OAUTH_API_AUDIENCES` | both | empty | Comma-separated identifiers (usually URLs) of APIs to register from the environment. `db:seed` creates their rows; edits made later in the admin console are kept. You can also register APIs in the console only, see [Protect an API](protect-an-api.md) |
| `OAUTH_API_SCOPES` | both | empty | Comma-separated scopes available to every client, whichever API it calls. Prefer declaring scopes per API in the admin console (**APIs**) |
| `API_KEY_PREFIX` | both | `ost_` | Prefix of new API keys: 1 to 16 letters, digits, `_` or `-`. Existing keys keep theirs. API keys themselves are turned on in the admin console, see [API keys](api-keys.md) |

`db:seed` runs in the auth app's Vercel build and in the Compose `migrate` service, after the migrations.

## Sign-in

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | both | unset | "Sign in with GitHub" from the environment, when both are set. It then shows as **Set by environment variables** (read-only) under **Sign-in providers**. Every other provider is set up in the admin console, see [Social sign-in](social-sign-in.md) |
| `CAPTCHA_PROVIDER` | auth | unset | `cloudflare-turnstile`, `hcaptcha` or `google-recaptcha` (v2 checkbox). Adds a captcha to sign-up, password sign-in, password reset and sign-in codes. **Build time**: the Content Security Policy is built with the provider's origins |
| `CAPTCHA_SITE_KEY` | auth | unset | The provider's public site key |
| `CAPTCHA_SECRET_KEY` | auth | unset | The provider's secret key. Turnstile and reCAPTCHA tokens are only accepted when solved on the auth app's host |
| `SCIM_TOKEN_SECRET` | both | derived from `BETTER_AUTH_SECRET` | At least 32 characters. Key for the HMAC digests of SCIM tokens. Set it to rotate `BETTER_AUTH_SECRET` without invalidating SCIM tokens. Changing the key in use invalidates every SCIM token, see [SCIM](scim.md) |

Set all three `CAPTCHA_*` variables or none: with only some of them, the app refuses to start (`CAPTCHA_SITE_KEY is required when any CAPTCHA_* variable is set`). Cloudflare's Turnstile test keys always pass: site key `1x00000000000000000000AA`, secret key `1x0000000000000000000000000000000AA`.

## Rate limits and client IP

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `RATE_LIMIT_ENABLED` | both | on in production, off in development | `true` or `false`. Per-IP limits on the auth endpoints, counted in Postgres, and 120 writes a minute per admin and IP on the admin console's JSON API (`/api/admin/*`). See [Rate limiting](security.md#rate-limiting) |
| `IP_ADDRESS_HEADERS` | both | `x-forwarded-for` on Vercel, none elsewhere | Comma-separated request headers holding the client IP, tried in order. Name only a header your proxy sets and clients cannot, e.g. `cf-connecting-ip` or `x-real-ip` |
| `TRUSTED_PROXIES` | both | unset | Comma-separated IPs or CIDR ranges of your own proxies. The client IP is then the right-most address in `x-forwarded-for` that is not one of them |

> [!WARNING]
> Off Vercel, set `IP_ADDRESS_HEADERS` or `TRUSTED_PROXIES`. With neither, no header is trusted: every client shares one rate-limit counter per endpoint and no IP is recorded. [Client IP](security.md#client-ip) explains each setup.

On Vercel, the platform sets `VERCEL=1` and the default applies; you set nothing.

## Housekeeping

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `CRON_SECRET` | auth | unset (route refuses every call) | At least 16 characters (`openssl rand -base64 24`). Protects `/api/cron/webhooks`, the daily housekeeping route: it retries failed webhook deliveries, deletes deliveries older than 30 days and applies the sign-in event retention. Vercel Cron sends it by itself (`apps/auth/vercel.json`, 04:00 UTC); elsewhere call the route daily with `Authorization: Bearer $CRON_SECRET` |
| `AUTH_EVENT_RETENTION_DAYS` | auth | `90` | Days sign-in events (activity charts, failed sign-ins) are kept, 30 to 3650. Failed sign-ins lose the email or username tried and the IP address after 30 days in any case |

## Development and analytics

| Variable | App | Default | Description |
| --- | --- | --- | --- |
| `WEBHOOKS_ALLOW_LOCALHOST` | both | unset | `true` accepts `http://localhost` (and other loopback) webhook endpoints, and a SAML metadata URL on localhost in **SSO**. Ignored when `NODE_ENV` is `production`. Private ranges stay refused |
| `VERCEL_ANALYTICS` | both | unset | `true` adds [Vercel Web Analytics](https://vercel.com/docs/analytics) to the app (turn it on in the Vercel project too). Page views are sent without query strings or fragments, which can carry reset and deletion tokens |
| `TZ` | both | `UTC` | Time zone the apps format dates in |

## Docker Compose only

`docker-compose.yml` reads these from `.env` and derives the others (`BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_ADMIN_APP_URL` come from `AUTH_APP_URL` and `ADMIN_APP_URL`).

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | none, **required** | Password of the bundled Postgres; `DATABASE_URL` is built from it |
| `AUTH_PORT` | `3000` | Host port of the auth app |
| `ADMIN_PORT` | `3001` | Host port of the admin console |

Compose requires `AUTH_APP_URL`, `ADMIN_APP_URL`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM` and `CRON_SECRET`. It passes through the variables listed in its `x-app-env` block; to use another one (`GITHUB_CLIENT_ID`, `SCIM_TOKEN_SECRET`, ...), add it there as `NAME: ${NAME}`.

## Build-time variables

These are read when the apps are built, not when they start. Change them, then rebuild (on Vercel, redeploy; with Compose, `docker compose up -d --build`).

| Variable | Why |
| --- | --- |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_APP_URL` | Inlined into the browser code |
| `CAPTCHA_PROVIDER` | The static Content Security Policy (`next.config.ts`) is built with the captcha's origins. It is also read at run time: set it in both places |
| `NEXT_OUTPUT` | `standalone` builds a self-contained server, as the `Dockerfile` does |

The `Dockerfile` takes the first three as build arguments (`--build-arg`).

## Set by the platform

You do not set these yourself.

| Variable | Set by | Effect |
| --- | --- | --- |
| `NODE_ENV` | Next.js, the Docker images | `production` turns on the production checks (`RESEND_*`, the auth app's URL), rate limiting by default, and ignores `WEBHOOKS_ALLOW_LOCALHOST` |
| `VERCEL` | Vercel (`1`) | Trusts `x-forwarded-for` for the client IP; lifts the requirement for `BETTER_AUTH_URL` or `AUTH_APP_URL` |
| `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | Vercel | Infer the auth app's URL when `AUTH_APP_URL` and `BETTER_AUTH_URL` are unset |

The end-to-end suite has its own variables (`E2E_TEST_MODE`, `E2E_MAIL_FILE`, `E2E_MOCK_PORT`), see [Testing](testing.md#test-seams). Never set them in a deployment.

## Rebrand

Edit `packages/core/src/lib/brand.ts` (name, tagline, colors, logo geometry) and the matching tokens in `packages/core/src/styles/globals.css`, then run `pnpm --filter @ostiary/auth brand:assets` to regenerate `logo.png` and `logo.svg`. To brand the sign-in screens for one application instead, see [Connect an app](connect-an-app.md).

## Related

- [Security](security.md): what `COOKIE_DOMAIN`, the client IP settings and rate limits protect against
- [Self-hosting](self-hosting.md) and [Deploy on Vercel](deploy-vercel.md)
- [Troubleshooting](troubleshooting.md)
