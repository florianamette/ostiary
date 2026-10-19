# Configuration

| Variable | App | Required | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | both | yes | Postgres connection string (the same for both apps) |
| `BETTER_AUTH_SECRET` | both | yes | 32+ characters, the same for both apps |
| `RESEND_API_KEY`, `RESEND_FROM` | both | in production | Sending verification, reset and invitation emails |
| `ADMIN_EMAILS` | auth | first run | Emails that become admins when they sign up, once the address is verified (the verification link or a sign-in code, or a social provider that reports it verified; never through SSO or SCIM) |
| `REQUIRE_ADMIN_2FA` | both | optional | `true` (default): admins must turn on two-factor authentication before using the admin console. `false` turns this off |
| `AUTH_APP_URL`, `ADMIN_APP_URL` | both | admin console | The two apps' public URLs |
| `NEXT_PUBLIC_ADMIN_APP_URL` | auth | admin console | Shows the "Admin" link in the account menu |
| `COOKIE_DOMAIN` | both | admin console | Parent domain shared by both apps, e.g. `.example.com`. The session cookie then reaches every subdomain, see [COOKIE_DOMAIN](security.md#cookie_domain) |
| `OAUTH_API_AUDIENCES` | both | optional | Comma-separated URLs of your APIs, registered at build time (or use the admin console) |
| `OAUTH_API_SCOPES` | both | optional | Comma-separated scopes available to every API (or declare them per API in the admin console) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | both | optional | "Sign in with GitHub" from the environment (read-only in the admin console). Other providers are set up in the admin console, see [Social sign-in](social-sign-in.md#social-sign-in) |
| `SCIM_TOKEN_SECRET` | both | optional | 32+ characters to hash SCIM tokens with; derived from `BETTER_AUTH_SECRET` when unset. Changing either invalidates SCIM tokens |
| `RATE_LIMIT_ENABLED` | both | optional | Rate limiting of the auth endpoints, see [Rate limiting](security.md#rate-limiting). Default: on in production, off in development. `false` turns it off |
| `IP_ADDRESS_HEADERS` | both | off Vercel | Comma-separated headers holding the client IP, tried in order. On Vercel the default is `x-forwarded-for`; elsewhere no header is trusted unless this or `TRUSTED_PROXIES` is set. See [Client IP](security.md#client-ip) |
| `API_KEY_PREFIX` | both | optional | Prefix of new API keys (default `ost_`; letters, digits, `_`, `-`, 16 at most). Existing keys keep theirs |
| `TRUSTED_PROXIES` | both | off Vercel | Comma-separated IPs or CIDR ranges of your own reverse proxies, to read the client IP from a multi-hop `x-forwarded-for`. See [Client IP](security.md#client-ip) |
| `CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY` | auth | optional | Captcha on sign-up, password sign-in, password reset and sign-in codes. Provider: `cloudflare-turnstile`, `hcaptcha` or `google-recaptcha` (v2 checkbox). Set all three or none, before building (the CSP is built with them). Turnstile and reCAPTCHA tokens are only accepted when solved on the host of `AUTH_APP_URL` |
| `CRON_SECRET` | auth | for webhooks | 16+ characters. Protects `/api/cron/webhooks`, which retries failed webhook deliveries (Vercel Cron sends it) |
| `WEBHOOKS_ALLOW_LOCALHOST` | both | optional | `true` accepts `http://localhost` webhook endpoints. Development only, ignored in production |
| `VERCEL_ANALYTICS` | both | optional | `true` adds [Vercel Web Analytics](https://vercel.com/docs/analytics) to the app (turn it on in the Vercel project too). Page views are sent without query strings or fragments, which can carry reset and deletion tokens |

**Rebrand** by editing `packages/core/src/lib/brand.ts` (name, tagline, colors, logo geometry) and the matching tokens in `packages/core/src/styles/globals.css`, then run `pnpm --filter @ostiary/auth brand:assets` to regenerate `logo.png` and `logo.svg`.
