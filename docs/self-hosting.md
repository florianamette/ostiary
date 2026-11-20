# Self-hosting

Run Ostiary on your own server with Docker Compose behind a reverse proxy, and keep it running: client IP, housekeeping, backups and upgrades.

`docker-compose.yml` runs everything on one machine:

| Service | What it does |
| --- | --- |
| `db` | Postgres 17, data in the `db-data` volume |
| `migrate` | Applies new database migrations and registers the APIs from `OAUTH_API_AUDIENCES`, then exits. The apps wait for it. |
| `auth` | The sign-in pages, the OIDC provider and the account dashboard, on port 3000 |
| `admin` | The admin console, on port 3001 |
| `cron` | Calls the daily housekeeping route at 04:00 UTC |

The `Dockerfile` builds one image per app (`--target auth`, `--target admin`) and one for the migrations (`--target migrate`). The app images hold only Next.js's standalone server, run as the unprivileged `node` user, and have a health check.

## Before you start

You need:

- a server with Docker and Docker Compose,
- two hostnames pointing at it, for example `auth.example.com` and `admin.example.com`, subdomains of one domain,
- a reverse proxy that terminates TLS (Caddy and nginx examples below),
- a [Resend](https://resend.com) API key and a sender on a domain verified in Resend. Production refuses to start without them.

## Install with Docker Compose

1. Clone the repository and copy the example environment file:

   ```bash
   git clone https://github.com/florianamette/ostiary.git && cd ostiary
   cp .env.docker.example .env
   ```

2. Fill in `.env`:

   | Variable | Value |
   | --- | --- |
   | `AUTH_APP_URL`, `ADMIN_APP_URL` | The public HTTPS addresses, such as `https://auth.example.com` and `https://admin.example.com`. They are built into the apps. |
   | `COOKIE_DOMAIN` | The parent domain of both, such as `.example.com`. The admin console needs it: see [Share the session with the admin console](#share-the-session-with-the-admin-console). |
   | `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32`. It also encrypts stored secrets and signing keys: back it up with the database. |
   | `CRON_SECRET` | `openssl rand -base64 24` |
   | `RESEND_API_KEY`, `RESEND_FROM` | Your Resend key and sender, such as `"Ostiary <auth@example.com>"` |
   | `ADMIN_EMAILS` | Your email address |
   | `IP_ADDRESS_HEADERS` | `x-real-ip` (the default) with the proxy examples below. See [Tell Ostiary the client IP](#tell-ostiary-the-client-ip). |

   Compose refuses to start while a required value is missing, with a message such as `set BETTER_AUTH_SECRET in .env`.

3. Build and start everything:

   ```bash
   docker compose up -d --build
   ```

4. Check that `migrate` exited and the apps are healthy:

   ```bash
   docker compose ps -a
   docker compose logs migrate
   ```

5. Once the reverse proxy is in place, open `AUTH_APP_URL`, sign up with the address in `ADMIN_EMAILS` and open the verification link sent to it: that account becomes an admin. Then open `ADMIN_APP_URL`. The admin console asks you to turn on two-factor authentication first.

### Add other variables

`docker-compose.yml` passes a fixed list of variables to the containers (the `x-app-env` block). To use another one from [Configuration](configuration.md), such as `GITHUB_CLIENT_ID` or `SCIM_TOKEN_SECRET`, add it to that block as `NAME: ${NAME}` and set it in `.env`.

### Build-time settings

Most variables are read when a container starts. Three are built into the apps' browser code and Content Security Policy, so Compose passes them as build arguments:

| Build argument | Comes from (`.env`) |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `AUTH_APP_URL` |
| `NEXT_PUBLIC_ADMIN_APP_URL` | `ADMIN_APP_URL` |
| `CAPTCHA_PROVIDER` | `CAPTCHA_PROVIDER` |

After changing one of them, rebuild: `docker compose up -d --build`.

## Put a reverse proxy in front

Send each hostname to its app: `auth.example.com` to port 3000 and `admin.example.com` to port 3001. The proxy must overwrite the header that carries the client IP (`X-Real-IP` here).

With Caddy, which gets TLS certificates by itself:

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

With nginx:

```nginx
server {
    listen 443 ssl;
    server_name auth.example.com;
    ssl_certificate     /etc/letsencrypt/live/auth.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auth.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name admin.example.com;
    ssl_certificate     /etc/letsencrypt/live/admin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.com/privkey.pem;

    # User imports upload files of up to 10 MB.
    client_max_body_size 11m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

nginx refuses request bodies over 1 MB by default. The 11 MB limit on the admin console leaves room for [user imports](import-users.md) of up to 10 MB.

> [!WARNING]
> Do not expose ports 3000 and 3001 to the internet: a client reaching an app directly can set any header, including the client IP. When the proxy runs on the same machine, bind them to localhost with `AUTH_PORT=127.0.0.1:3000` and `ADMIN_PORT=127.0.0.1:3001` in `.env`.

## Tell Ostiary the client IP

Rate limits, sessions and the audit log need each visitor's address. Off Vercel, Ostiary trusts no header by default, since a client could fake `x-forwarded-for`. Until you set one of these, every client shares one rate-limit counter per endpoint, no IP is recorded, and the apps log `[ip] Not on Vercel and neither IP_ADDRESS_HEADERS nor TRUSTED_PROXIES is set`.

| Setup | Setting |
| --- | --- |
| nginx or Caddy as above | `IP_ADDRESS_HEADERS=x-real-ip` (the default in `.env.docker.example`) |
| Behind Cloudflare, with the origin reachable only through it | `IP_ADDRESS_HEADERS=cf-connecting-ip` |
| Proxies that append to `x-forwarded-for` | `TRUSTED_PROXIES=` their IPs or CIDR ranges, comma-separated |

Only name a header your proxy overwrites. [Security](security.md#client-ip) explains each case.

## Share the session with the admin console

The admin console has no sign-in page: it sends you to the auth app to sign in, then reads the session cookie. Browsers only send that cookie to the admin console when both apps are subdomains of one domain and `COOKIE_DOMAIN` names it, for example `COOKIE_DOMAIN=.example.com`. Without it, the admin console cannot see your session and keeps sending you back to sign in.

The session cookie then reaches **every** host under that domain. Read [COOKIE_DOMAIN](security.md#cookie_domain) first, and prefer a dedicated domain for identity, such as `auth.example.com` and `admin.auth.example.com` with `COOKIE_DOMAIN=.auth.example.com`.

If you do not run the admin console, leave `COOKIE_DOMAIN` empty.

## Housekeeping

The `cron` service calls `GET /api/cron/webhooks` on the auth app once a day, with `Authorization: Bearer $CRON_SECRET`. The route:

- retries the webhook deliveries that are due,
- deletes webhook deliveries older than 30 days,
- deletes sign-in events older than `AUTH_EVENT_RETENTION_DAYS` (90 days by default, 30 at least).

Without `CRON_SECRET`, the route answers `401` to every call. To use another scheduler (a systemd timer, a Kubernetes CronJob), remove the `cron` service and call the route the same way:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://auth.example.com/api/cron/webhooks
```

Rate-limit counters need no job: Better Auth deletes expired ones as it goes.

## Back up and restore

Back up two things: the database and `.env`. `BETTER_AUTH_SECRET` encrypts the stored signing keys, social provider secrets and webhook secrets: a backup restored with another secret cannot use them.

Back up the database in Postgres's custom format:

```bash
docker compose exec -T db pg_dump -U ostiary -Fc ostiary > ostiary-$(date +%F).dump
```

Restore it into a running `db` service, with the apps stopped:

```bash
docker compose stop auth admin cron
docker compose exec -T db pg_restore -U ostiary -d ostiary --clean --if-exists < ostiary-2026-11-20.dump
docker compose up -d
```

Test a restore before you need one.

## Upgrade

1. Read the [changelog](https://github.com/florianamette/ostiary/blob/main/CHANGELOG.md) for the versions you skip.
2. Back up the database (see above).
3. Pull and rebuild:

   ```bash
   git pull
   docker compose up -d --build
   ```

`migrate` runs again before the apps start and applies only the new migrations. If it fails, the apps do not start: check `docker compose logs migrate`.

## Monitor

Both apps answer `GET /api/health`: `200` with `{"status":"ok"}` when the app and its database respond, `503` otherwise. Docker uses it as the containers' health check, and you can point an uptime monitor at it. It is public and says nothing else.

Logs go to standard output: `docker compose logs -f auth admin`.

## Run without Compose

### With the Docker images

Build the images for your own domains. The browser-side URLs are built in, so pass them as build arguments:

```bash
docker build --target migrate -t ostiary-migrate .
docker build --target auth \
  --build-arg NEXT_PUBLIC_APP_URL=https://auth.example.com \
  --build-arg NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.com \
  -t ostiary-auth .
docker build --target admin \
  --build-arg NEXT_PUBLIC_APP_URL=https://auth.example.com \
  --build-arg NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.com \
  -t ostiary-admin .
```

Add `--build-arg CAPTCHA_PROVIDER=...` if you use a captcha. Then, with any orchestrator:

1. Give all three containers the same environment: at least `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_APP_URL`, `ADMIN_APP_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `COOKIE_DOMAIN`, `CRON_SECRET` and the client IP setting. `docker-compose.yml` is a complete example.
2. Run `ostiary-migrate` to completion before starting or upgrading the apps.
3. Run `ostiary-auth` (port 3000) and `ostiary-admin` (port 3001) behind your proxy, and check `/api/health`.
4. Schedule the [housekeeping](#housekeeping) call.

### Without Docker

On a server with Node.js 20.9 or later and pnpm:

1. Install the dependencies: `pnpm install`.
2. Put the production environment in `apps/auth/.env.local` and `apps/admin/.env.local` (or in the process environment). In production, outside Vercel, the auth app needs `BETTER_AUTH_URL` or `AUTH_APP_URL`, and both apps need `RESEND_API_KEY` and `RESEND_FROM`. Set `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_ADMIN_APP_URL` before building.
3. Apply the migrations: `pnpm db:migrate` (it reads `apps/auth/.env.local`).
4. Build and start each app:

   ```bash
   pnpm build
   pnpm --filter @ostiary/auth start    # next start -p 3000
   pnpm --filter @ostiary/admin start   # next start -p 3001
   ```

For a self-contained server instead, build with `NEXT_OUTPUT=standalone pnpm build`. Each app then has a server in `apps/<app>/.next/standalone`. Copy the static files into it, as the `Dockerfile` does, and start it from there with the environment set in the process:

```bash
cd apps/auth/.next/standalone
cp -r ../static apps/auth/.next/static
cp -r ../../public apps/auth/public
PORT=3000 node apps/auth/server.js
```

## Related

- [Configuration](configuration.md): every environment variable.
- [Security](security.md): rate limiting, client IP and `COOKIE_DOMAIN`.
- [Deploy on Vercel](deploy-vercel.md): the managed alternative.
- [Troubleshooting](troubleshooting.md): common failures and their fixes.
