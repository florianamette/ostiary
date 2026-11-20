# Self-hosting with Docker

Ostiary runs anywhere Docker does. `docker-compose.yml` starts everything on one machine:

| Service | What it does |
| --- | --- |
| `db` | Postgres 17, data in the `db-data` volume |
| `migrate` | Applies the database migrations and registers the OAuth resources (APIs), then exits. The apps wait for it. |
| `auth` | The sign-in app, OIDC provider and account dashboard, on port 3000 |
| `admin` | The admin console, on port 3001 |
| `cron` | Calls the daily housekeeping route (webhook retries, retention) at 04:00 UTC |

The `Dockerfile` builds one image per app (`--target auth`, `--target admin`) and one for the migrations (`--target migrate`). The app images contain only Next.js's standalone server, run as the unprivileged `node` user, and have a health check.

## Quick start

You need two hostnames that point at your server, for example `auth.example.com` and `admin.example.com`, a reverse proxy that terminates TLS, and a [Resend](https://resend.com) API key for emails.

```bash
git clone https://github.com/florianamette/ostiary.git && cd ostiary
cp .env.docker.example .env
# Fill in .env: the URLs, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, CRON_SECRET, RESEND_*, ADMIN_EMAILS
docker compose up -d --build
```

Then open `AUTH_APP_URL`, sign up with the address in `ADMIN_EMAILS` and open the verification link: that account becomes an admin. The admin console asks you to turn on two-factor authentication before you use it.

Generate the secrets with `openssl rand -base64 32`. `BETTER_AUTH_SECRET` also encrypts stored provider and webhook secrets: keep it, and back it up with the database.

## Build-time and run-time settings

Most variables are read when a container starts. Three are built into the apps' browser code and CSP, so they are build arguments:

| Build argument | Comes from (compose) |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `AUTH_APP_URL` |
| `NEXT_PUBLIC_ADMIN_APP_URL` | `ADMIN_APP_URL` |
| `CAPTCHA_PROVIDER` | `CAPTCHA_PROVIDER` |

Changing one of them means rebuilding: `docker compose up -d --build`. Every other variable is listed in [Configuration](configuration.md).

## Reverse proxy

Send each hostname to its app: `auth.example.com` to port 3000 and `admin.example.com` to port 3001. With Caddy:

```
auth.example.com {
	reverse_proxy localhost:3000 {
		header_up X-Real-IP {remote_host}
	}
}

admin.example.com {
	reverse_proxy localhost:3001 {
		header_up X-Real-IP {remote_host}
	}
}
```

With nginx, `proxy_set_header X-Real-IP $remote_addr;` in each `location`.

**Tell Ostiary where the client IP comes from.** Rate limits and the audit log need the visitor's address, and off Vercel no header is trusted by default (a client could fake `x-forwarded-for`). The example `.env` sets `IP_ADDRESS_HEADERS=x-real-ip`, which matches the proxy settings above. Behind Cloudflare use `cf-connecting-ip`; behind proxies that append to `x-forwarded-for`, list their addresses in `TRUSTED_PROXIES` instead. Only name a header your proxy overwrites: [Security](security.md#client-ip) explains each case.

Do not publish ports 3000 and 3001 to the internet without the proxy in front: clients reaching the apps directly control every header. Bind them to localhost (`127.0.0.1:3000:3000` in `docker-compose.yml`) when the proxy runs on the same machine.

For one sign-in across both apps, set `COOKIE_DOMAIN=.example.com`, after reading [COOKIE_DOMAIN](security.md#cookie_domain).

## Housekeeping

The `cron` service calls `GET /api/cron/webhooks` on the auth app once a day with `Authorization: Bearer $CRON_SECRET`. It retries webhook deliveries that are due and deletes old deliveries and sign-in events. Without `CRON_SECRET` the route refuses every call. To use another scheduler (a systemd timer, Kubernetes CronJob), remove the service and call the route the same way.

## Upgrading

```bash
git pull
docker compose up -d --build
```

`migrate` runs again before the apps start and applies only new migrations. Back up the database first:

```bash
docker compose exec db pg_dump -U ostiary ostiary > ostiary-$(date +%F).sql
```

## Without Compose

Build the images and run them with any orchestrator:

```bash
docker build --target migrate -t ostiary-migrate .
docker build --target auth  --build-arg NEXT_PUBLIC_APP_URL=https://auth.example.com --build-arg NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.com -t ostiary-auth .
docker build --target admin --build-arg NEXT_PUBLIC_APP_URL=https://auth.example.com --build-arg NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.com -t ostiary-admin .
```

Run `ostiary-migrate` to completion with the same environment as the apps before starting or upgrading them. Both apps answer a health check on `/api/health`: 200 when the app and its database respond, 503 otherwise.

Or skip Docker: `NEXT_OUTPUT=standalone pnpm build` writes a standalone server to `apps/<app>/.next/standalone` (copy `.next/static` and `public` next to it, as the `Dockerfile` does), or run `pnpm build` and `next start` in each app.
