# Testing

```bash
pnpm lint && pnpm typecheck && pnpm test   # lint, types and unit tests (Vitest)
```

**End-to-end tests** (`e2e/`, Playwright with Chromium) run both apps as in production (`next build`, then `next start` on ports 3220 and 3221) against a real Postgres database, with a local mock server on 3229. They cover what depends on Better Auth internals and would break silently on a version bump:

- APIs created in the admin console: their scopes become requestable without a restart and appear in discovery; client credentials tokens carry the API as audience; an API limited to linked applications refuses the others (`invalid_target`)
- Social providers turned on and off in the console (the authorization URL, then a refusal), and a full social sign-in against a local GitLab-compatible provider
- Signing key rotation: new key id in new tokens, both keys in the JWKS, old tokens still verify
- Sign-up with email verification, password sign-in, sign-in codes, TOTP two-factor, the admin two-factor gate (`REQUIRE_ADMIN_2FA`), rate limiting (429 and `Retry-After`)
- Authorization code with PKCE, consent (allow and deny), refresh, UserInfo, device flow
- Webhook delivery to a local receiver (Standard Webhooks signature checked), API key creation and verification, Dynamic Client Registration, per-app branding of the login page (signed authorization only)
- OAuth client management: closed to non-admins, console clients owned by the platform (a demoted admin loses control), self-registered clients kept within their limits (updates, device sign-in with any client authentication), API scopes bound to their API, no session JWT endpoint

Run them locally with Postgres in Docker:

```bash
docker run -d --name ostiary-e2e-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ostiary_e2e -p 5432:5432 postgres:17
pnpm install
pnpm --filter @ostiary/e2e exec playwright install chromium
pnpm --filter @ostiary/e2e db:setup      # migrations and seed
pnpm --filter @ostiary/e2e build:apps    # next build of both apps, with the test environment
pnpm --filter @ostiary/e2e test:e2e      # starts the apps and the mock server, runs the tests
```

Without Docker, any Postgres 15+ works, for example the PGlite socket server for a quick try (`npx -p @electric-sql/pglite-socket pglite-server --port 5432`; it accepts a single connection at a time, so tests may be slow or time out; a real Postgres is recommended). Point the suite at another database with `DATABASE_URL` in the shell or in `e2e/.env.test.local` (not committed). The environment is `e2e/.env.test`: dummy secrets only. Re-runs on the same database work; recreate it for a clean slate. `pnpm --filter @ostiary/e2e exec playwright show-report` opens the last report. CI runs the suite in the `e2e` job and uploads the report and traces when it fails.

Changes made in the admin console reach the auth app through its caches (scopes and API key settings within a minute, social providers within 30 seconds), so a few tests wait up to that long.

**Test seams.** `E2E_TEST_MODE=true` (`packages/core/src/lib/e2e-test-mode.ts`) changes three things, for the suite only: outgoing emails are appended to `E2E_MAIL_FILE` (JSON lines, read by the tests for verification links and sign-in codes) instead of being sent; webhook endpoints may be `http://localhost` (as `WEBHOOKS_ALLOW_LOCALHOST` does in development, which `next start` ignores); the Have I Been Pwned password check, an external call, is skipped. It only takes effect when the auth app's URL (`AUTH_APP_URL`, else `BETTER_AUTH_URL`) is `http://` on a loopback host and never on a Vercel production deployment, so it cannot turn on in a real deployment even if the variable is set there. The apps log a warning when it is on.
