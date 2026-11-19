# syntax=docker/dockerfile:1
#
# Ostiary images: one target per app, plus the migration job. docker-compose.yml builds all
# three; docs/self-hosting.md explains the variables.
#
#   docker build --target auth    -t ostiary-auth .
#   docker build --target admin   -t ostiary-admin .
#   docker build --target migrate -t ostiary-migrate .
#
# The browser-side URLs (NEXT_PUBLIC_*) and CAPTCHA_PROVIDER are read when the apps are built,
# so they are build arguments: build the images for your own domains. Everything else (database,
# secret, email, AUTH_APP_URL, ...) is read when the container starts.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
# pnpm, at the version pinned in package.json ("packageManager").
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo

# Dependencies first: this layer is reused until a package.json or the lockfile changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/auth/package.json apps/auth/
COPY apps/admin/package.json apps/admin/
COPY packages/core/package.json packages/core/
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=ostiary-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store --filter "!@ostiary/e2e"

FROM deps AS source
COPY . .

# The apps' build: a standalone server each (next.config: NEXT_OUTPUT=standalone).
FROM source AS build-base
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_ADMIN_APP_URL=http://localhost:3001
ARG CAPTCHA_PROVIDER=
ENV NEXT_OUTPUT=standalone \
    NODE_ENV=production \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_ADMIN_APP_URL=${NEXT_PUBLIC_ADMIN_APP_URL} \
    CAPTCHA_PROVIDER=${CAPTCHA_PROVIDER}
# Building loads the server code, whose configuration check wants these set. They are
# placeholders for the build step only, not kept in the image: containers get the real values.
RUN printf '%s\n' \
      "DATABASE_URL=postgresql://build:build@localhost:5432/build" \
      "BETTER_AUTH_SECRET=build-time-placeholder-0123456789abcdef" \
      "BETTER_AUTH_URL=${NEXT_PUBLIC_APP_URL}" \
      "AUTH_APP_URL=${NEXT_PUBLIC_APP_URL}" \
      "ADMIN_APP_URL=${NEXT_PUBLIC_ADMIN_APP_URL}" \
      "RESEND_API_KEY=build-placeholder" \
      "RESEND_FROM='Ostiary <build@example.invalid>'" \
      > /tmp/build.env

FROM build-base AS build-auth
RUN set -a && . /tmp/build.env && set +a && pnpm --filter @ostiary/auth build

FROM build-base AS build-admin
RUN set -a && . /tmp/build.env && set +a && pnpm --filter @ostiary/admin build

# Runtime base: only the traced server files, no package manager, not running as root.
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0
WORKDIR /app

FROM runtime AS auth
COPY --from=build-auth --chown=node:node /repo/apps/auth/.next/standalone ./
COPY --from=build-auth --chown=node:node /repo/apps/auth/.next/static ./apps/auth/.next/static
COPY --from=build-auth --chown=node:node /repo/apps/auth/public ./apps/auth/public
USER node
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/auth/ok || exit 1
CMD ["node", "apps/auth/server.js"]

FROM runtime AS admin
COPY --from=build-admin --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build-admin --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build-admin --chown=node:node /repo/apps/admin/public ./apps/admin/public
USER node
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O /dev/null http://127.0.0.1:3001/icon || exit 1
CMD ["node", "apps/admin/server.js"]

# Applies the database migrations and registers the OAuth resources, then exits. Run it before
# starting (or upgrading) the apps: docker-compose.yml does.
FROM source AS migrate
WORKDIR /repo/packages/core
USER node
CMD ["sh", "-c", "node_modules/.bin/drizzle-kit migrate && node_modules/.bin/tsx src/db/seed-resources.ts"]
