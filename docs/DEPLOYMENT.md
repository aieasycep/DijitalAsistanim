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
eas build --profile demo --platform android         # standalone demo APK (no backend, no credentials)
eas build --profile preview --platform all          # internal testers (Supabase staging)
eas build --profile production --platform all       # store builds
eas submit --platform ios / android
```

- Before `eas submit`, fill `submit.production.ios.ascAppId` / `appleTeamId` in `apps/mobile/eas.json` (EAS cannot read
  them from env) and point `submit.production.android.serviceAccountKeyPath` at the Play service-account JSON.

### Demo APK without EAS (GitHub Actions)

`.github/workflows/android-apk.yml` builds standalone demo APKs on GitHub-hosted runners: `expo prebuild` → Gradle
`assembleRelease` (`APP_ENV=preview`, `EXPO_PUBLIC_DATA_MODE=demo`, arm64-v8a + armeabi-v7a, debug keystore). Start
it from **Actions → Android APK (demo) → Run workflow** (optional `demo_now` pins the demo clock) or push a commit
whose message contains `[apk]`. Two artifacts are attached to the run (kept 14 days); they are internal builds only —
store builds keep using the EAS `production` profile and real signing.

- `dijital-asistan-demo-apk` — built with `ANDROID_NOTIFICATION_LISTENER=0`. Google Play Protect blocks APKs
  installed from a browser, a messaging app or a file manager when they declare a `NotificationListenerService`, and
  the dialog has no "install anyway"; this variant leaves the service out, so it installs from anywhere with "unknown
  sources" allowed. The "Telefon Bildirimleri" feature is hidden in it (as on iOS).
- `dijital-asistan-demo-apk-listener` — with the service, to test that feature. Install it over USB, which Play
  Protect does not block:

```bash
# phone: Settings → Developer options → USB debugging on; computer: Android platform-tools on PATH
adb devices
adb install -r dijital-asistan-demo-<sha>-listener.apk
```

The EAS `preview` and `demo` profiles set the same switch; `development` and `production` keep the service (store
installs are never blocked).

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

| Feature             | Variables                                                 | Without it                             |
| ------------------- | --------------------------------------------------------- | -------------------------------------- |
| Gmail push          | `GOOGLE_PUBSUB_TOPIC`, `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | polling (mail 15 min Free / 5 min Pro) |
| Graph notifications | `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE`                    | polling (same cadence)                 |
| Server TTS          | `TTS_PROVIDER`, keys                                      | device TTS                             |
| Server STT          | `STT_PROVIDER`, keys                                      | type-to-ask fallback                   |
| Embeddings          | `EMBEDDING_PROVIDER`, key                                 | Postgres FTS                           |
| Travel time         | `ROUTES_PROVIDER=google`, `GOOGLE_ROUTES_API_KEY`         | no travel hints                        |
| Sentry / PostHog    | DSN / key                                                 | silent no-op                           |

## 6. Rollout checklist

1. CI green (`pnpm check:all`).
2. Supabase migrations pushed; secrets set; functions deployed; cron settings applied; a test user connected end-to-end.
3. EAS production builds submitted; App Store / Play listings (docs/APP_STORE_CHECKLIST.md).
4. Web deployed with legal pages and well-known files; Google OAuth verification in progress (docs/GOOGLE_OAUTH_VERIFICATION.md).
5. Monitoring: Sentry projects for mobile/web/functions; PostHog dashboard for the funnel events.
