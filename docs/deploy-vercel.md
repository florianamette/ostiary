# Deploy on Vercel

Deploy Ostiary on Vercel with a Neon Postgres database, add the admin console as a second project, and put both on your own domain.

On Vercel, Ostiary is two projects from the same repository, sharing one database and one secret:

| Project | Root directory | What it serves |
| --- | --- | --- |
| Auth app (`ostiary`) | `apps/auth` | Sign-in pages, the OIDC provider, the account dashboard. Its build applies the migrations. |
| Admin console (`ostiary-admin`), optional | `apps/admin` | The admin console. It has no sign-in page of its own: it reads the session the auth app created. |

You need a [Vercel](https://vercel.com) account, a [Resend](https://resend.com) account for emails, and, for the admin console, a domain you control.

## Deploy the auth app

1. Click **Deploy with Vercel** in the [README](https://github.com/florianamette/ostiary#vercel). Vercel copies the repository to your Git account, creates the project with `apps/auth` as its root directory, and adds a Neon database, which sets `DATABASE_URL`.
2. Fill in the variables it asks for:

   | Variable | Value |
   | --- | --- |
   | `BETTER_AUTH_SECRET` | 32 or more random characters: `openssl rand -base64 32`. Keep it: it also encrypts stored provider and webhook secrets. |
   | `ADMIN_EMAILS` | Your email address, so your account becomes an admin when you sign up and verify it. |
   | `RESEND_API_KEY`, `RESEND_FROM` | See [Set up email](#set-up-email). |
   | `CRON_SECRET` | 16 or more random characters: `openssl rand -base64 24`. Protects the daily housekeeping job; see [Add the daily housekeeping job](#add-the-daily-housekeeping-job). |

3. Wait for the build. It runs, from `apps/auth/vercel.json`:

   ```bash
   pnpm --filter @ostiary/core db:migrate && pnpm --filter @ostiary/core db:seed && next build
   ```

   `db:migrate` applies new database migrations and `db:seed` registers the APIs from `OAUTH_API_AUDIENCES` (see [Protect an API](protect-an-api.md#register-apis-from-the-environment)). Both are safe to run on every build.
4. Open the deployment, sign up with the address in `ADMIN_EMAILS` and open the verification link you receive. The account becomes an admin once its address is verified. Signing up with a social provider works too, when the provider reports the address as verified; enterprise SSO never grants the admin role.

> [!WARNING]
> Every build migrates the database its `DATABASE_URL` points to, preview deployments included. If previews share the production database, a preview of a newer version migrates production. Give previews their own database (Neon branches) or turn previews off.

## Add the daily housekeeping job

`apps/auth/vercel.json` declares a Vercel Cron job that calls `/api/cron/webhooks` every day at 04:00 UTC. It retries webhook deliveries that are due, deletes deliveries older than 30 days, and deletes sign-in events older than `AUTH_EVENT_RETENTION_DAYS` (90 by default).

The route answers `401` to every call without `CRON_SECRET`, which the Deploy button asks for. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` by itself; there is nothing else to set up.

If the project was created without it (an older version of the button, or a project created by hand):

1. Generate a secret: `openssl rand -base64 24` (16 characters at least).
2. In the auth project, open **Settings** > **Environment Variables** and add `CRON_SECRET` with that value.
3. Redeploy.

## Set up email

Ostiary sends verification links, password reset links, sign-in codes and invitations through Resend. In production both apps refuse to build or start without `RESEND_API_KEY` and `RESEND_FROM`.

1. In Resend, add and verify your domain (for example `example.com`).
2. Create an API key with sending access.
3. Set, in every project:

   ```bash
   RESEND_API_KEY=re_...
   RESEND_FROM="Ostiary <auth@example.com>"   # a sender on the verified domain
   ```

If emails do not arrive, the function logs show `[email] Resend ... error:` with Resend's message. [Troubleshooting](troubleshooting.md) has more.

## Use your own domain

Choose the final address of the auth app early. It is the OIDC issuer your apps are configured with (`https://auth.example.com/api/auth`), and passkeys are bound to its hostname: moving to another domain later means reconfiguring every app, and users' passkeys stop working.

1. In the auth project, open **Settings** > **Domains** and add `auth.example.com`.
2. Set `AUTH_APP_URL=https://auth.example.com`. Without it, Ostiary uses the project's production domain as Vercel reports it (`VERCEL_PROJECT_PRODUCTION_URL`); setting it removes any doubt.
3. Redeploy.

## Add the admin console

The admin console is a second Vercel project on the same repository. It has no sign-in page: it sends you to the auth app to sign in, then reads the session cookie. So both apps must be subdomains of one domain, with `COOKIE_DOMAIN` set to that domain. `*.vercel.app` addresses cannot share cookies, so the admin console needs your own domain.

> [!WARNING]
> With `COOKIE_DOMAIN=.example.com`, browsers send the session cookie to **every** host under `example.com`. Read [COOKIE_DOMAIN](security.md#cookie_domain) first, and prefer a dedicated domain for identity, such as `auth.example.com` and `admin.auth.example.com` with `COOKIE_DOMAIN=.auth.example.com`.

1. Click the second button, **Deploy the admin console**, in the [README](https://github.com/florianamette/ostiary#vercel). It creates a project with `apps/admin` as its root directory.
2. Fill in its variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The auth project's value (**Settings** > **Environment Variables**). |
   | `BETTER_AUTH_SECRET` | The same as the auth project. |
   | `AUTH_APP_URL` | `https://auth.example.com` |
   | `ADMIN_APP_URL` | `https://admin.example.com` |
   | `RESEND_API_KEY`, `RESEND_FROM` | The same as the auth project. |

3. Add `COOKIE_DOMAIN=.example.com`. If you set `REQUIRE_ADMIN_2FA` on the auth project, set the same value here.
4. In the admin project, add the domain `admin.example.com` (**Settings** > **Domains**) and redeploy.
5. In the **auth** project, add these variables, then redeploy it:

   ```bash
   COOKIE_DOMAIN=.example.com
   ADMIN_APP_URL=https://admin.example.com              # lets sign-in send you back to the console
   NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.com  # built into the pages: needs a new build
   ```

6. Open `https://admin.example.com`. Sign in on the auth app if asked. The first time, it asks you to turn on two-factor authentication on your account dashboard; then **Go to the admin console**.

The admin console's build does not migrate the database. When you upgrade, deploy the auth project first.

## Optional settings

| Variable | Project | Effect |
| --- | --- | --- |
| `VERCEL_ANALYTICS=true` | Both | Adds Vercel Web Analytics. Also turn it on in the project's **Analytics** tab. Page views are sent without query strings. |
| `CAPTCHA_PROVIDER`, `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY` | Auth | Captcha on sign-up, password sign-in, password reset and sign-in codes. Set all three, then redeploy: the provider is built into the pages. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Both | GitHub sign-in from the environment. Every other provider is set up in the admin console. |

Leave `IP_ADDRESS_HEADERS` and `TRUSTED_PROXIES` empty: on Vercel, Ostiary reads the client IP from `x-forwarded-for`, which Vercel sets. [Configuration](configuration.md) lists every variable.

> [!NOTE]
> Vercel Functions accept request bodies up to 4.5 MB. A [user import](import-users.md) file larger than that fails on Vercel, even though Ostiary accepts files up to 10 MB: split it into several files.

## Upgrade

The Deploy button made a copy of the repository in your Git account. To upgrade:

1. Read the [changelog](https://github.com/florianamette/ostiary/blob/main/CHANGELOG.md) for the versions you skip.
2. Merge the new version of `florianamette/ostiary` into your copy and push. Vercel builds both projects.
3. Make sure the auth project's build, which migrates the database, finishes before the admin console's deployment goes live.

## Related

- [Quickstart](quickstart.md): run Ostiary locally first.
- [Self-hosting](self-hosting.md): Docker Compose on your own server instead.
- [Connect an app](connect-an-app.md): register your first app.
- [Security](security.md): what to review before going live.
