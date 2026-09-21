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
- E-mail sign-in is a 6-digit code (`signInWithOtp` + `verifyOtp`, `otp_length = 6`): in **Auth → Email Templates →
  Magic Link** the body must contain `{{ .Token }}` — the default template only carries `{{ .ConfirmationURL }}`, which
  the app cannot use. Supabase's built-in sender is rate-limited to a few e-mails per hour; configure custom SMTP
  (Auth → SMTP) before inviting more testers.
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

### APKs without EAS (GitHub Actions)

`.github/workflows/android-apk.yml` builds standalone APKs on GitHub-hosted runners: `expo prebuild` → Gradle
`assembleRelease` (`APP_ENV=preview`, arm64-v8a + armeabi-v7a, debug keystore). Start it from **Actions → Android APK
(demo) → Run workflow** or push a commit whose message contains `[apk]` (pushes always build demo mode). Two artifacts
are attached to the run (kept 14 days); they are internal builds only — store builds keep using the EAS `production`
profile and real signing.

- `data_mode` = `demo` (default): built-in fixtures, no backend; optional `demo_now` pins the demo clock.
- `data_mode` = `supabase`: the app talks to your Supabase project. Before the first run add, under **Settings →
  Secrets and variables → Actions**, the repository variable `EXPO_PUBLIC_SUPABASE_URL` and the secret
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` (optional variables `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` /
  `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` enable native Google sign-in; e-mail code sign-in needs nothing else).

Artifacts (`<mode>` = `demo` or `supabase`):

- `dijital-asistan-<mode>-apk` — built with `ANDROID_NOTIFICATION_LISTENER=0`. Google Play Protect blocks APKs
  installed from a browser, a messaging app or a file manager when they declare a `NotificationListenerService`, and
  the dialog has no "install anyway"; this variant leaves the service out, so it installs from anywhere with "unknown
  sources" allowed. The "Telefon Bildirimleri" feature is hidden in it (as on iOS).
- `dijital-asistan-<mode>-apk-listener` — with the service, to test that feature. Install it over USB, which Play
  Protect does not block (or with Play Protect app scanning switched off in the Play Store):

```bash
# phone: Settings → Developer options → USB debugging on; computer: Android platform-tools on PATH
adb devices
adb install -r dijital-asistan-demo-<sha>-listener.apk
```

The EAS `preview` and `demo` profiles set the same switch; `development` and `production` keep the service (store
installs are never blocked).

### First real-data test (staging, no EAS)

1. Supabase: create a project, then `supabase link`, `supabase db push`, `supabase secrets set`, `supabase functions
deploy` and the two `alter database` settings from section 1. Minimum secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_FUNCTION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `AI_PROVIDER` + `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`).
2. Supabase Auth: enable Email, put `{{ .Token }}` in the Magic Link template (above). For the "Google ile devam et"
   button also enable the **Google** provider (Authentication → Sign In / Providers) with the web client's ID and
   secret, add the callback shown there (`https://<ref>.supabase.co/auth/v1/callback`) to that web client's authorized
   redirect URIs in Google Cloud, and add `dijitalasistan://auth/callback` under Authentication → URL configuration →
   Redirect URLs. Until the provider is enabled the button ends on a Supabase page saying
   `Unsupported provider: provider is not enabled`.
3. Google Cloud: OAuth consent screen in **Testing** with your Gmail address as a test user (restricted Gmail scopes
   work for test users without verification), enable the Gmail, Calendar and Tasks APIs, create the web client with
   the two redirect URIs from docs/OAUTH_SETUP.md.
4. GitHub: add `EXPO_PUBLIC_SUPABASE_URL` (variable) and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (secret), run the workflow
   with `data_mode = supabase`, install `dijital-asistan-supabase-apk-listener`.
5. In the app: sign in with the e-mail code, connect Gmail from onboarding, let the 72-hour analysis run (it runs on the
   server; the `initial-analysis-status` function reports progress), then check Today, Flow and the briefings.

- Environment variables per profile live in EAS (`eas env`) or `apps/mobile/.env`: all `EXPO_PUBLIC_*` values plus
  `APP_ENV`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`, `APPLE_TEAM_ID`, `IOS_APP_GROUP`.
- Native code (Android NotificationListener module, widgets, share extension) is compiled by EAS during prebuild;
  run `pnpm --filter @da/mobile validate` locally to catch config-plugin errors early.
- Universal links: host `/.well-known/apple-app-site-association` and `assetlinks.json` from the web app
  (`APPLE_TEAM_ID`, `ANDROID_SHA256_CERT_FINGERPRINTS` from `eas credentials`).
- Push: APNs key + FCM credentials configured in EAS; the server uses the Expo Push API (`EXPO_ACCESS_TOKEN` recommended).

## 3. Web

### Own server (OVH) — the default

`apps/web/Dockerfile` builds the site as a Next.js standalone image; `.github/workflows/web-image.yml` publishes it to
`ghcr.io/aieasycep/dijitalasistanim-web` on every push that touches the site (tags `sha-<7>`, `<branch>`, `latest` on
`main`). The host runs `deploy/ovh/docker-compose.yml`: the image plus Caddy, which terminates TLS with Let's Encrypt.
Step-by-step (Docker install, DNS, registry login, first start, updates): `deploy/ovh/README.md`.

- Build-time values (inlined into the pages) are repository variables read by the workflow: `NEXT_PUBLIC_WEB_URL`,
  `NEXT_PUBLIC_APP_STORE_URL`, `NEXT_PUBLIC_PLAY_STORE_URL`, `NEXT_PUBLIC_TRIAL_DAYS` (all optional; defaults in
  `apps/web/src/lib/env.ts`). Changing one means rebuilding the image.
- Run-time values live in `deploy/ovh/.env` and take effect on restart: `SUPPORT_EMAIL`, `PRIVACY_EMAIL` (contact
  addresses on the pages) and the `/.well-known/*` app-link values `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`,
  `ANDROID_SHA256_CERT_FINGERPRINTS`.

### Vercel or any Node host (alternative)

```bash
pnpm --filter @da/web build && pnpm --filter @da/web start
```

Set the same variables in the host's environment and point `dijitalasistan.app` at the deployment.

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
