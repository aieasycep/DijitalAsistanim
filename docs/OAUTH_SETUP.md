# OAuth setup (Google & Microsoft)

Two separate things use OAuth:

1. **Sign-in** (Apple / Google / Microsoft / email) — handled by **Supabase Auth**. Configure providers in the
   Supabase dashboard (or `supabase/config.toml` locally). This only identifies the user.
2. **Data-source connections** (Gmail, Google Calendar, Google Tasks, Outlook, Microsoft Calendar, To Do) — handled by
   our Edge Functions (`oauth-start`, `oauth-google-callback`, `oauth-microsoft-callback`) with tokens encrypted at rest.
   A user can sign in with Apple and later connect Gmail.

## Google Cloud Console

1. Create a project → **APIs & Services → Library**: enable *Gmail API*, *Google Calendar API*, *Google Tasks API*,
   (optional) *Pub/Sub API*, (optional) *Routes API*.
2. **OAuth consent screen**: External, app name "Dijital Asistan", support email, privacy policy
   `https://dijitalasistan.app/privacy`, terms `https://dijitalasistan.app/terms`, homepage `https://dijitalasistan.app`,
   authorized domain `dijitalasistan.app`.
3. **Scopes** (declare exactly these):
   - Sign-in: `openid`, `email`, `profile`
   - Read (initial connect): `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/calendar.readonly`,
     `https://www.googleapis.com/auth/tasks.readonly`
   - Progressive write (requested on first use): `https://www.googleapis.com/auth/gmail.send`,
     `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/tasks`
4. **Credentials**:
   - *Web application* client → `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`; authorized redirect URI
     `https://<project-ref>.supabase.co/functions/v1/oauth-google-callback` (= `GOOGLE_OAUTH_REDIRECT_URI`). The same
     web client is used by Supabase Auth Google sign-in (add `https://<project-ref>.supabase.co/auth/v1/callback`).
   - *iOS* client (bundle `com.dijitalasistan.app`) → `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
   - *Android* client (package + SHA-1 of the EAS signing key) → `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` = the web client id (for id-token sign-in).
5. Gmail push (optional): create a Pub/Sub topic, grant `gmail-api-push@system.gserviceaccount.com` the Publisher role,
   add a push subscription pointing at `https://<project-ref>.supabase.co/functions/v1/webhook-gmail?token=<GOOGLE_PUBSUB_VERIFICATION_TOKEN>`,
   set `GOOGLE_PUBSUB_TOPIC=projects/<project>/topics/<topic>`. Without it, polling is used automatically.
6. Verification: see `docs/GOOGLE_OAUTH_VERIFICATION.md` (restricted Gmail scopes require a CASA assessment).

## Microsoft Entra (Azure AD)

1. **App registrations → New**: name "Dijital Asistan", supported account types *Accounts in any organizational
   directory and personal Microsoft accounts* (`MICROSOFT_OAUTH_TENANT=common`).
2. **Authentication → Web** redirect URIs: `https://<project-ref>.supabase.co/functions/v1/oauth-microsoft-callback`
   and (for Supabase Auth Azure sign-in) `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Certificates & secrets**: client secret → `MICROSOFT_OAUTH_CLIENT_SECRET`; Application (client) ID → `MICROSOFT_OAUTH_CLIENT_ID`.
4. **API permissions (Microsoft Graph, delegated)**: `offline_access`, `User.Read`, `Mail.Read`, `Calendars.Read`,
   `Tasks.Read` (initial); `Mail.Send`, `Calendars.ReadWrite`, `Tasks.ReadWrite` (progressive). No admin consent required for
   personal accounts; work accounts may require tenant admin consent.
5. Change notifications (optional): set `MICROSOFT_GRAPH_WEBHOOK_URL` (defaults to the `webhook-microsoft` function) and a
   random `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE`. Subscriptions are created after connect and renewed by cron.

## Apple

- **Sign in with Apple**: enable the capability on the App ID (`com.dijitalasistan.app`), create a Services ID for Supabase
  (`APPLE_SERVICES_ID`), a Sign in with Apple key (`APPLE_KEY_ID`, `.p8` → `APPLE_PRIVATE_KEY_P8_BASE64`), and configure the
  Apple provider in Supabase Auth with the generated client secret.
- Apple Calendar / Reminders use **EventKit on device** (no OAuth). Events read on device are uploaded through
  `device-calendar-upsert`; writes happen only after approvals.

## Supabase Auth redirect URLs

Add to *Authentication → URL configuration*:
`dijitalasistan://auth/callback`, `https://dijitalasistan.app/app/auth/callback`, `exp://127.0.0.1:8081/--/auth/callback` (dev).

## Flow (data-source connect)

```
App ─POST oauth-start {provider, kinds, scopeGroup}─▶ Edge Function
      ◀── { authorizationUrl, state }                    (state HMAC-signed, PKCE verifier encrypted in oauth_states)
App opens the URL in an auth session (expo-web-browser)
Provider ─GET oauth-<provider>-callback?code&state─▶ Edge Function: verify state, exchange code, encrypt tokens,
      upsert connected_accounts + oauth_credentials, create sync_states, enqueue initial sync, audit
      ◀── 302 dijitalasistan://oauth/<provider>?state=…&status=ok&accountId=…
App: completeOAuth → refetch accounts → "Bağlandı"
```

Expired/revoked tokens surface as `oauth_expired` → the app shows **Bağlantıyı Yenile** (Integrations) which restarts the
flow for the same account; missing write scope surfaces as `scope_required` with the scope to request.

## Environment summary

| Variable | Where |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` | Supabase Edge Function secrets |
| `MICROSOFT_OAUTH_CLIENT_ID/SECRET/TENANT/REDIRECT_URI` | Supabase Edge Function secrets |
| `TOKEN_ENCRYPTION_KEY` | Supabase Edge Function secrets (`openssl rand -base64 32`) |
| `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` | EAS environment / `.env` (public) |
| `APPLE_*` | Supabase Auth provider config |
