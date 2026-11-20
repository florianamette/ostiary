# Testing

How to run Ostiary's checks: lint, types and unit tests, and the end-to-end suite that runs both apps against a real Postgres database.

## Run lint, types and unit tests

From the repository root:

```bash
pnpm lint && pnpm typecheck && pnpm test   # ESLint, tsc and Vitest, in every package
```

The unit tests need no database: `packages/core/vitest.setup.ts` sets placeholder values for the variables the environment check requires.

If you change the database schema (`packages/core/src/db/schema`), generate the migration with `pnpm db:generate` and commit it. CI fails when the schema and the committed migrations differ.

## Run the end-to-end tests

The end-to-end tests (`e2e/`, Playwright with Chromium) run both apps as in production (`next build`, then `next start` on ports 3220 and 3221) against a real Postgres database, with a local mock server on 3229.

1. Start a Postgres database:

   ```bash
   docker run -d --name ostiary-e2e-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ostiary_e2e -p 5432:5432 postgres:17
   ```

2. Install the dependencies and Chromium:

   ```bash
   pnpm install
   pnpm --filter @ostiary/e2e exec playwright install chromium
   ```

3. Apply the migrations and the seed:

   ```bash
   pnpm --filter @ostiary/e2e db:setup
   ```

4. Build both apps with the test environment:

   ```bash
   pnpm --filter @ostiary/e2e build:apps
   ```

5. Run the suite. It starts both apps and the mock server, then runs the tests:

   ```bash
   pnpm --filter @ostiary/e2e test:e2e
   ```

`pnpm --filter @ostiary/e2e exec playwright show-report` opens the last report. Rebuild (step 4) after changing the apps' code: the suite runs the built apps.

Re-runs on the same database work; recreate the database for a clean slate. Locally, Playwright reuses apps already listening on 3220 and 3221 instead of starting new ones.

## Use another database

Any Postgres 15 or later works. Point the suite at it with `DATABASE_URL` in the shell or in `e2e/.env.test.local` (not committed); variables already set in the shell win over the files.

Without Docker, the PGlite socket server works for a quick try (`npx -p @electric-sql/pglite-socket pglite-server --port 5432`). It accepts a single connection at a time, so tests may be slow or time out: a real Postgres is recommended.

## The test environment

The environment is `e2e/.env.test`, with dummy secrets only. It sets the apps' URLs (`http://localhost:3220` and `http://localhost:3221`), a few `ADMIN_EMAILS` addresses, `REQUIRE_ADMIN_2FA=true`, `EMAIL_DEDUP=gmail`, `RATE_LIMIT_ENABLED=true`, a `CRON_SECRET`, and an API from the environment (`OAUTH_API_AUDIENCES=https://api.e2e.test`).

`IP_ADDRESS_HEADERS=x-forwarded-for` lets the suite play the reverse proxy: each test sends its own `x-forwarded-for`, so tests never share a rate-limit counter.

Changes made in the admin console reach the auth app through its caches (scopes and API key settings within a minute, social providers within 30 seconds), so a few tests wait up to that long.

### Test seams

`E2E_TEST_MODE=true` (`packages/core/src/lib/e2e-test-mode.ts`) changes three things, for the suite only:

- Outgoing emails are appended to `E2E_MAIL_FILE` (JSON lines, by default `e2e/.data/mail.jsonl`) instead of being sent. The tests read verification links and sign-in codes there.
- Webhook endpoints may be `http://localhost`, as `WEBHOOKS_ALLOW_LOCALHOST` does in development (which `next start` ignores, since `NODE_ENV` is `production`).
- The Have I Been Pwned password check, an external call, is skipped.

It only takes effect when the auth app's URL (`AUTH_APP_URL`, else `BETTER_AUTH_URL`) is `http://` on a loopback host, and never on a Vercel production deployment, so it cannot turn on in a real deployment even if the variable is set there. The apps log `[e2e] E2E_TEST_MODE is on: emails go to E2E_MAIL_FILE, never use this outside tests.` when it is on.

`E2E_MOCK_PORT` (default `3229`) is the port of the mock server: a GitLab-compatible OAuth provider and a webhook receiver.

## What the end-to-end tests cover

They cover what depends on Better Auth internals and would break silently on a version bump:

| Area | Tests |
| --- | --- |
| Accounts | Sign-up with email verification and password sign-in, sign-in codes, TOTP two-factor, `EMAIL_DEDUP=gmail`, rate limiting (429 and `Retry-After`) |
| Admins | `ADMIN_EMAILS` promotion only once the address is verified (password and social sign-ups), the admin two-factor gate (`REQUIRE_ADMIN_2FA`), roles limited to `admin` and `user`, no passkey or provider added while impersonating |
| Account security | Banning an account or resetting its password revokes the apps' refresh tokens; the Public organization's members are not listed to its members; SSO providers managed from the console only, with a plain email domain |
| OAuth | Authorization code with PKCE, consent (allow and deny), refresh, UserInfo, device flow, Dynamic Client Registration |
| OAuth clients | Closed to non-admins, console clients owned by the platform (a demoted admin loses control), self-registered clients kept within their limits (updates, device sign-in with any client authentication), API scopes bound to their API, no session JWT endpoint, app icon URLs |
| APIs | APIs created in the console become requestable without a restart and appear in discovery; client credentials tokens carry the API as audience; an API limited to linked applications refuses the others (`invalid_target`) |
| Token claims | Per-app custom claims in the ID token, the JWT access token and UserInfo, again after a refresh; fixed values only for client credentials; reserved claims refused |
| Signing keys | Rotation: new key ID in new tokens, both keys in the JWKS, old tokens still verify |
| Social sign-in | Providers turned on and off in the console (the authorization URL, then a refusal), a full sign-in against the local provider, two-factor on social sign-in and no implicit linking |
| API keys and webhooks | API key creation and verification by a linked application; webhook delivery to a local receiver with the Standard Webhooks signature checked |
| Branding | The login page names the app for a signed authorization only |
| User import | An Auth0 export: dry run, import, sign-in with the exported bcrypt hash (then stored as scrypt), an existing address skipped; the import route refuses other origins, oversized bodies and non-admins |
| Account data | The export holds every section and no secret; deletion from the emailed link stops the account's tokens; admins cannot delete their own account |
| CSV exports | Users and audit log exports with the page's filters, refused to non-admins, signed-out visitors and other sites |
| Headers and pages | A fresh CSP nonce per page, no `unsafe-eval`, no `x-powered-by`; the auth pages and the console hydrate under the CSP; `/login` follows only trusted `callbackURL`s; every console page loads; both apps answer their health check |

## Continuous integration

CI (`.github/workflows/ci.yml`) runs two jobs on every push to `main` and every pull request:

- **quality**: checks that the migrations match the schema, then `pnpm lint`, `pnpm typecheck` and `pnpm test`.
- **e2e**: the end-to-end suite against a Postgres 17 service, with the same steps as above. It retries a failed test once and uploads the Playwright report and traces when the job fails.

## Related

- [Configuration](configuration.md): the variables the test environment sets
- [Troubleshooting](troubleshooting.md)
