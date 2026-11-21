# Troubleshooting

Real errors Ostiary produces, with the message you see, why it happens and how to fix it. Search this page for the exact text or code you got.

## Startup and configuration

### The app stops with "Invalid environment variables"

**Symptom.** The app fails to start (or `next build` fails) with `Invalid environment variables:` followed by the variables at fault, then `Error: Invalid environment variables`.

**Cause.** A variable is missing or invalid (`packages/core/src/lib/env.ts`). The messages Ostiary adds itself:

| Message | Fix |
| --- | --- |
| `BETTER_AUTH_URL (or AUTH_APP_URL) is required in production outside Vercel: the public URL of the auth app` | Set `AUTH_APP_URL` (and `BETTER_AUTH_URL`) to the auth app's public URL |
| `RESEND_API_KEY is required in production for email verification` | Set `RESEND_API_KEY` |
| `RESEND_FROM is required in production for email verification` | Set `RESEND_FROM` to a sender on a domain verified in Resend |
| `CAPTCHA_SITE_KEY is required when any CAPTCHA_* variable is set` (or another `CAPTCHA_*` name) | Set all three `CAPTCHA_*` variables, or none |

The other messages come from the schema itself: `DATABASE_URL` must be a URL, `BETTER_AUTH_SECRET` at least 32 characters, `CRON_SECRET` at least 16, `SCIM_TOKEN_SECRET` at least 32, `AUTH_EVENT_RETENTION_DAYS` between 30 and 3650, and `EMAIL_DEDUP`, `REQUIRE_ADMIN_2FA`, `RATE_LIMIT_ENABLED`, `CAPTCHA_PROVIDER` one of their listed values.

**Fix.** Correct the variable named, see [Configuration](configuration.md). "In production" means `NODE_ENV=production`, which `next build` and `next start` set, so a local production build needs `RESEND_*` too.

### The admin console stops with "AUTH_APP_URL and ADMIN_APP_URL are required by the admin app"

**Cause.** The admin console needs both URLs, even locally.

**Fix.** Set both in `apps/admin/.env.local` (locally `http://localhost:3000` and `http://localhost:3001`), or in the admin project's environment.

### The health check answers 503

**Symptom.** `GET /api/health` answers `503` with `{"status":"unavailable"}`, and the Docker container is marked unhealthy.

**Cause.** The database did not answer within 3 seconds.

**Fix.** Check `DATABASE_URL`, that Postgres is running and reachable from the app, and its logs.

## Database and migrations

### Tables are missing

**Symptom.** Requests fail with a Postgres error such as `relation "user" does not exist`.

**Cause.** The migrations have not run on this database.

**Fix.** Run them:

```bash
pnpm db:migrate   # migrations, then db:seed (APIs from OAUTH_API_AUDIENCES)
```

Locally, `db:migrate` reads `DATABASE_URL` from `packages/core/.env.local`, `packages/core/.env`, then `apps/auth/.env.local`. On Vercel, the auth app's build runs the migrations and the seed before `next build` (`apps/auth/vercel.json`): deploy the auth app before the admin console. With Docker Compose, the `migrate` service runs them at each `docker compose up`.

### The build logs "Database connection failed (attempt 1 of 5), retrying."

**Cause.** `db:seed` could not reach the database. A serverless database (Neon) can take a few seconds to wake up; the seed retries five times.

**Fix.** Nothing if a later attempt succeeds. If all five fail, check `DATABASE_URL` and that the build can reach the database.

## Admin console access

### The admin console keeps sending you back to the sign-in page

**Symptom.** In production, opening the admin console sends you to the auth app's login page, which sends you back to the console, and so on until the browser gives up (too many redirects).

**Cause.** The two apps are on different hosts and `COOKIE_DOMAIN` is unset (or differs between them), so the console never receives the session cookie the auth app set. The console has no sign-in page of its own.

**Fix.** Give both apps subdomains of one domain and set the same `COOKIE_DOMAIN` (e.g. `.example.com`) on both, after reading [COOKIE_DOMAIN](security.md#cookie_domain). Existing sessions are moved to the parent domain the next time the login page is opened; nobody has to sign in again.

### The admin console sends you to your account dashboard

**Cause.** Your account does not have the `admin` role. `ADMIN_EMAILS` only promotes an address once it is proven: by the verification link, a sign-in code, or a social provider that reports it verified. It never promotes through SSO or SCIM, and it does not promote an account that already existed with a verified address.

**Fix.** Check that your address is in `ADMIN_EMAILS` on the auth app, then verify it (or sign in with a code). For an existing account, have another admin use **Users** > row menu > **Make admin**. See [Admin console](admin-console.md#who-can-use-the-console).

### The admin console sends you to "Turn on two-factor authentication"

**Symptom.** You land on `/dashboard#two-factor` on the auth app: "Admins need two-factor authentication to open the admin console." Admin API calls answer `403` with `{"code": "TWO_FACTOR_REQUIRED", "message": "Turn on two-factor authentication to use admin features."}`.

**Cause.** `REQUIRE_ADMIN_2FA` is `true` (the default) and your account has no two-factor authentication.

**Fix.** Click **Set it up** and turn it on, then open the console again. To run without it, set `REQUIRE_ADMIN_2FA=false` in both apps. An admin who lost their authenticator can have another admin **Reset** it from **Users** > the user > **Sign-in methods**.

### After signing in, you land on your account instead of the admin console

**Cause.** After a password, passkey or two-factor sign-in, the browser only follows a `callbackURL` to the auth app or to `NEXT_PUBLIC_ADMIN_APP_URL`, which is read at build time.

**Fix.** Set `NEXT_PUBLIC_ADMIN_APP_URL` to the console's URL in the auth app's build environment and rebuild. Opening the console again also works, since you are now signed in.

### "Invalid origin" or "Cross-origin request refused"

**Symptom.** A request answers `403` with `{"code": "INVALID_ORIGIN", "message": "Invalid origin"}` (auth API), or `{"error": "Cross-origin request refused"}` (admin console's `/api/admin/*` routes).

**Cause.** The page's origin is not one of the trusted origins: `AUTH_APP_URL`, `ADMIN_APP_URL` and the auth app's URL. A common reason is a URL that differs from the one in the address bar (`www.`, `http` instead of `https`, another port).

**Fix.** Set `AUTH_APP_URL` and `ADMIN_APP_URL` to exactly the origins people use, in both apps.

## OAuth and tokens

### Sign-in ends on an error page with `invalid_redirect`

**Symptom.** Instead of the login page, the browser shows the auth server's error page with `error=invalid_redirect&error_description=invalid+redirect+uri` in the URL.

**Cause.** The `redirect_uri` your app sent is not one of the application's **Redirect URIs**. The comparison is exact (scheme, host, path, trailing slash, query); only the port of an `http://localhost` or loopback URI is ignored. A URI with a fragment (`#`) or a user name never matches.

**Fix.** In the admin console, open **Applications** > row menu > **Edit application** and add the exact URI your app sends. Confidential clients need HTTPS (localhost included); `http://localhost`, `127.0.0.1` and `[::1]` are for public clients. See [Connect an app](connect-an-app.md).

### The token endpoint answers `invalid_target`

**Symptom.** `POST /api/auth/oauth2/token` answers `400` with `"error": "invalid_target"` and one of these descriptions:

| `error_description` | Cause | Fix |
| --- | --- | --- |
| `requested resource https://api.example.com is not configured` | No API has this identifier | Register it under **APIs**, with exactly the identifier your app sends as `resource` |
| `requested resource https://api.example.com is disabled` | The API is disabled | Turn it back on under **APIs** |
| `client ... is not linked to resource(s) ...` | The API is limited to linked applications | **APIs** > **Applications** > **Change**: link the application |
| `Requested resource was not authorized by the user` | The token request names a `resource` that was not in the authorization request | Send the same `resource` in both requests |
| `Invalid resource indicator` | The `resource` value is not a valid absolute URI | Send the API's identifier |

See [Protect an API](protect-an-api.md).

### The token request answers `invalid_scope`

**Symptom.** `"error": "invalid_scope"`, e.g. `none of the requested scopes are allowed for resource https://api.example.com`.

**Cause.** The scopes asked for are not among the API's scopes, or the API only issues its own scopes (**Only issue these scopes for this API**).

**Fix.** Add the scope to the API under **APIs**, or ask for one it has. New scopes reach the auth server within a minute.

## Rate limits and client IP

### Everyone gets "Too many attempts" at once

**Symptom.** Sign-in screens show "Too many attempts. Try again in ..." for many people at the same time; the API answers `429` with `{"code": "RATE_LIMITED", ...}`. At startup, the apps log `[ip] Not on Vercel and neither IP_ADDRESS_HEADERS nor TRUSTED_PROXIES is set: ...`.

**Cause.** Off Vercel, no header is trusted for the client IP unless you say which one, so every client shares one counter per endpoint. The audit log and sign-in history record no IP either.

**Fix.** Set `IP_ADDRESS_HEADERS` to the header your reverse proxy sets (e.g. `x-real-ip`, `cf-connecting-ip`), or `TRUSTED_PROXIES` to your proxies' addresses. [Client IP](security.md#client-ip) covers each setup.

### One person or office is rate limited

**Symptom.** `429 Too Many Requests`, a `Retry-After` header and `{"code": "RATE_LIMITED", "message": "Too many requests. Please try again later.", "retryAfter": 42}`.

**Cause.** The address went past a limit, e.g. 10 password sign-ins a minute. Counts are per IP, so people behind one address share them.

**Fix.** Wait for `Retry-After` seconds. For large shared networks, raise the rule in `packages/core/src/lib/rate-limit.ts`, see [Rate limiting](security.md#rate-limiting).

## Email

### Emails do not arrive

Check, in order:

1. **Development without Resend.** With `RESEND_API_KEY` or `RESEND_FROM` unset, nothing is sent: the app logs the link or code instead, as `[email] Resend not configured; <kind> code for <address>: <code>` (or `link for <address>: <url>`).
2. **Resend refused it.** The app logs `[email] Resend <kind> error: <message>`. The usual cause is a `RESEND_FROM` on a domain not verified in Resend.
3. **No account.** Sign-in codes and password reset emails go to existing accounts only; an unknown address gets the same answer on screen and no email, so it does not reveal who has an account.
4. **Spam folder**, and the domain's SPF and DKIM records in Resend.

Emails are sent after the response, so a failure never shows on screen: check the app's logs.

## Sign-in

### "Please verify your email first."

**Symptom.** A password sign-in shows "Please verify your email first. Can't find the link? Ask for a new one below." (the API answers with code `EMAIL_NOT_VERIFIED`).

**Cause.** The account signed up with a password and has not used the verification link yet.

**Fix.** Use the link in the verification email, or ask for a new one on the login page. An emailed sign-in code also verifies the address. If no email arrives, see [Emails do not arrive](#emails-do-not-arrive).

### "That code is not valid. Enter the current code from your app."

**Cause.** The authenticator code is wrong or out of date, often because the phone's clock is off. While setting up two-factor authentication, the same problem shows as "That code is not valid. Check that your device's clock is correct and try again."

**Fix.** Turn on automatic time on the phone and enter a fresh code, or use a backup code.

### A social sign-in comes back with an error

The login page shows the reason:

| Message | Cause | Fix |
| --- | --- | --- |
| "That account isn't connected to a ... account yet. Sign in another way, then connect it from your security settings." | The address matches an account that has two-factor authentication, is an admin, or is not verified: Ostiary never links those implicitly | Sign in another way, then connect the provider from the account page |
| "There's no account for that address yet, and this sign-in method can't create one. Sign in another way." | **Create accounts for new users** is off for this provider | Sign up another way, or turn the option on under **Sign-in providers** |
| "That account didn't share an email address. Try again later or sign in another way." | The provider returned no email address | Allow the email scope or permission in the provider's app settings |

If the provider itself shows a redirect URI error, register the **Callback URL** shown under **Sign-in providers**: `https://<auth app>/api/auth/callback/<provider>`. See [Social sign-in](social-sign-in.md).

### "The stored secrets cannot be decrypted (BETTER_AUTH_SECRET has changed). Enter them again."

**Cause.** Provider secrets are encrypted with a key derived from `BETTER_AUTH_SECRET`, which has changed.

**Fix.** Under **Sign-in providers**, enter each provider's secrets again. Webhook signing secrets are encrypted the same way: regenerate them under **Webhooks**.

### Single sign-on did not complete

**Symptom.** The `/sso` page shows "Single sign-on did not complete. Try again, or ask your administrator to check the identity provider settings." followed by an error code in parentheses.

**Causes and fixes.**

- The provider's domain is not verified: **SSO** > **Verify domain**, publish the TXT record, **Check DNS**.
- `invalid_provider_domain` ("This SSO provider's domain must be set again by an administrator."): the stored domain is not one plain lowercase hostname. Edit the provider and set the domain again (then verify it again).
- SAML: the identity provider's certificate expired (**SSO** shows "The signing certificate has expired"), or its clock is off. Ostiary allows 60 seconds of clock skew on SAML assertions. Fetch the metadata again from **Edit** after a certificate rotation. Sign-in must start from Ostiary (SP-initiated): point the identity provider's app tile to Ostiary's SSO page.

See [Enterprise SSO](enterprise-sso.md).

### The captcha does not show

**Symptom.** "The security check could not load. Check your connection or turn off content blockers, then reload the page.", or "Complete the security check first."

**Cause.** A content blocker, or `CAPTCHA_PROVIDER` was not set when the auth app was built, so the Content Security Policy does not allow the captcha's scripts.

**Fix.** Set the three `CAPTCHA_*` variables in the build environment and rebuild. Turnstile and reCAPTCHA tokens are only accepted when solved on the auth app's host.

### "Sign in again to add a new way to sign in."

**Cause.** Adding a passkey or connecting a provider needs a sign-in from the last 10 minutes (code `RECENT_SIGN_IN_REQUIRED`).

**Fix.** Sign out and in again, then retry.

### "This account cannot be deleted yet. See the account page for what to do first."

**Cause.** Code `ACCOUNT_DELETION_BLOCKED`: the account is an admin, the sole owner of an organization, or provisioned by SCIM.

**Fix.** Follow the steps on the account page, see [Your data](account-data.md).

## Webhooks and housekeeping

### A webhook endpoint is refused

**Symptom.** Adding an endpoint fails with "The URL must use https://.", "The URL points to this machine (localhost).", or "The URL points to a private address."

**Cause.** Endpoints must be HTTPS on a public address.

**Fix.** Use a public HTTPS URL. For local development, set `WEBHOOKS_ALLOW_LOCALHOST=true`, which accepts `http://localhost` when `NODE_ENV` is not `production`. See [Webhooks](webhooks.md).

### The housekeeping route answers 401

**Symptom.** `GET /api/cron/webhooks` answers `401` with `{"error":"unauthorized"}`: failed webhook deliveries are not retried and old sign-in events are not deleted.

**Cause.** `CRON_SECRET` is unset on the auth app (the route then refuses every call), or the caller does not send `Authorization: Bearer $CRON_SECRET`.

**Fix.** Set `CRON_SECRET` (16+ characters) and redeploy. The **Deploy with Vercel** button asks for it, but projects created before it did, or by hand, may lack it. Vercel Cron sends the header by itself; elsewhere, schedule a daily call with it, as the Compose `cron` service does. See [Self-hosting](self-hosting.md).

## Related

- [Configuration](configuration.md)
- [Security](security.md)
- [Admin console](admin-console.md)
