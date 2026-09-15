# syntax=docker/dockerfile:1.7
# Dijital Asistan web site (apps/web, Next.js standalone) — build from the repository root:
#   docker build -f apps/web/Dockerfile -t dijitalasistanim-web .
# NEXT_PUBLIC_* values are inlined into the bundles at build time and arrive as build args (all optional, the app
# has defaults). The pages are server-rendered per request, so SUPPORT_EMAIL, PRIVACY_EMAIL and the app-link values
# (APPLE_TEAM_ID, IOS_BUNDLE_ID, ANDROID_PACKAGE, ANDROID_SHA256_CERT_FINGERPRINTS) are read at run time from the
# container environment (deploy/ovh/.env).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Every workspace manifest first, so the frozen lockfile validates and the dependency layer is cached until the
# lockfile changes; only the web app and its workspace dependencies are installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/api-client/package.json packages/api-client/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/domain/package.json packages/domain/
COPY packages/i18n/package.json packages/i18n/
COPY packages/server-core/package.json packages/server-core/
COPY packages/ui/package.json packages/ui/
COPY packages/validation/package.json packages/validation/
# --ignore-scripts: the root workspace's tooling (deno, @sentry/cli, esbuild) ships install hooks the site does not
# need — deno's refuses to run on musl. Next.js, sharp and everything the site imports are prebuilt packages.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @da/web... --ignore-scripts
COPY packages/design-tokens packages/design-tokens
COPY packages/domain packages/domain
COPY apps/web apps/web

ARG NEXT_PUBLIC_WEB_URL=https://dijitalasistan.app
ARG NEXT_PUBLIC_APP_STORE_URL=
ARG NEXT_PUBLIC_PLAY_STORE_URL=
ARG NEXT_PUBLIC_TRIAL_DAYS=
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_APP_STORE_URL=$NEXT_PUBLIC_APP_STORE_URL \
    NEXT_PUBLIC_PLAY_STORE_URL=$NEXT_PUBLIC_PLAY_STORE_URL \
    NEXT_PUBLIC_TRIAL_DAYS=$NEXT_PUBLIC_TRIAL_DAYS
RUN pnpm --filter @da/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
RUN addgroup -S web && adduser -S web -G web
# `output: 'standalone'` with outputFileTracingRoot = repo root: server.js lives under apps/web/.
COPY --from=build --chown=web:web /repo/apps/web/.next/standalone ./
COPY --from=build --chown=web:web /repo/apps/web/.next/static ./apps/web/.next/static
USER web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/robots.txt >/dev/null 2>&1 || exit 1
CMD ["node", "apps/web/server.js"]
