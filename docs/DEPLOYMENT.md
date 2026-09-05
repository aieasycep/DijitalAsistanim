# Deployment

## 0. Prerequisites

- Node 22, pnpm 10, Deno 2 (or `pnpm add -Dw deno`), Supabase CLI, EAS CLI (`npm i -g eas-cli`), Xcode / Android Studio
  for local native builds (EAS Build otherwise).
- Accounts: Supabase, Apple Developer, Google Play Console, Google Cloud, Microsoft Entra, RevenueCat, Expo (EAS),
  optional Anthropic/OpenAI, Sentry, PostHog, ElevenLabs/Deepgram, Vercel (web).

## 1. Supabase

```bash
supabase login && supabase link --project-ref <ref>
supabase db push                       # applies supabase/migrations in order
supabase secrets set --env-file supabase/.env.local   # see .env.example (server-side section)
supabase functions deploy              # deploys every folder in supabase/functions
```

- Set database settings used by pg_cron → Edge Function calls:
  ```sql
  alter database postgres set app.settings.functions_url = 'https://<ref>.supabase.co/functions/v1';
  alter database postgres set app.settings.internal_secret = '<INTERNAL_FUNCTION_SECRET>';
  ```
  (or store `functions_url` / `internal_secret` in Vault — `internal.setting()` reads Vault first).
- Enable Auth providers (Apple, Google, Azure, Email OTP) and add redirect URLs (docs/OAUTH_SETUP.md).
- Storage buckets are created by migration `…0008_storage.sql`.
- Verify: `node scripts/validate-migrations.mjs` and `node scripts/db-test.mjs` against a fresh Postgres (CI does this).

## 2. Mobile (EAS)

```bash
cd apps/mobile
eas init                               # sets EXPO_PUBLIC_EAS_PROJECT_ID
eas credentials                        # Apple signing, push key (APNs), Android keystore, FCM
eas build --profile development --platform all      # dev client (demo mode)
eas build --profile preview --platform all          # internal testers (Supabase staging)
eas build --profile production --platform all       # store builds
eas submit --platform ios / android
```

- Environment variables per profile live in EAS (`eas env`) or `apps/mobile/.env`: all `EXPO_PUBLIC_*` values plus
  `APP_ENV`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`, `APPLE_TEAM_ID`, `IOS_APP_GROUP`.
- Native code (Android NotificationListener module, widgets, share extension) is compiled by EAS during prebuild;
  run `pnpm --filter @da/mobile validate` locally to catch config-plugin errors early.
- Universal links: host `/.well-known/apple-app-site-association` and `assetlinks.json` from the web app
  (`APPLE_TEAM_ID`, `ANDROID_SHA256_CERT_FINGERPRINTS` from `eas credentials`).
- Push: APNs key + FCM credentials configured in EAS; the server uses the Expo Push API (`EXPO_ACCESS_TOKEN` recommended).

## 3. Web (Vercel or any Node host)

```bash
pnpm --filter @da/web build && pnpm --filter @da/web start
```

Set `NEXT_PUBLIC_*`, `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS`,
`NEXT_PUBLIC_APP_STORE_URL`, `NEXT_PUBLIC_PLAY_STORE_URL`. Point `dijitalasistan.app` at the deployment.

## 4. RevenueCat

- Create the app (iOS + Android), products `da_pro_monthly` / `da_pro_annual`, entitlement `pro`, offering `default`.
- Public SDK keys → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `…_ANDROID_KEY`.
- Webhook → `https://<ref>.supabase.co/functions/v1/webhook-revenuecat` with Authorization header value
  `REVENUECAT_WEBHOOK_SECRET`.

## 5. Optional integrations

| Feature             | Variables                                                 | Without it           |
| ------------------- | --------------------------------------------------------- | -------------------- |
| Gmail push          | `GOOGLE_PUBSUB_TOPIC`, `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | polling every 10 min |
| Graph notifications | `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE`                    | polling              |
| Server TTS          | `TTS_PROVIDER`, keys                                      | device TTS           |
| Server STT          | `STT_PROVIDER`, keys                                      | type-to-ask fallback |
| Embeddings          | `EMBEDDING_PROVIDER`, key                                 | Postgres FTS         |
| Travel time         | `ROUTES_PROVIDER=google`, `GOOGLE_ROUTES_API_KEY`         | no travel hints      |
| Sentry / PostHog    | DSN / key                                                 | silent no-op         |

## 6. Rollout checklist

1. CI green (`pnpm check:all`).
2. Supabase migrations pushed; secrets set; functions deployed; cron settings applied; a test user connected end-to-end.
3. EAS production builds submitted; App Store / Play listings (docs/APP_STORE_CHECKLIST.md).
4. Web deployed with legal pages and well-known files; Google OAuth verification in progress (docs/GOOGLE_OAUTH_VERIFICATION.md).
5. Monitoring: Sentry projects for mobile/web/functions; PostHog dashboard for the funnel events.
