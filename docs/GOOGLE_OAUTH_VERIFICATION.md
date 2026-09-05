# Google OAuth verification checklist

Gmail read/send scopes are **restricted**; Calendar/Tasks scopes are **sensitive**. Publishing to more than
100 users requires Google's verification and — for restricted scopes — an annual third-party security
assessment (CASA Tier 2). This is an external process; the codebase is prepared for it.

## What reviewers look for (and where it lives)

| Requirement | Implementation |
| --- | --- |
| Public homepage on a verified domain describing the app | `apps/web` → `https://dijitalasistan.app` (Hero, features, Security) |
| Privacy policy link on the consent screen, accessible without login, describing Google data use | `https://dijitalasistan.app/privacy` (`apps/web/src/app/privacy`) — includes the **Limited Use** statement |
| Explanation of each requested scope | `https://dijitalasistan.app/oauth` lists every scope, why it is needed, and that write scopes are requested progressively |
| Minimal scopes | Read-only at connect; `gmail.send` / `calendar.events` / `tasks` only on first approved write (`docs/OAUTH_SETUP.md`) |
| In-app justification before the consent screen | Onboarding "Gmail erişimine neden ihtiyacımız var?" explainer (`/(onboarding)/explainer/[provider]`) |
| Demo video showing the OAuth flow and how data is used | Record: connect flow → consent → Today briefing → email detail → draft reply → approval → send. Show the disconnect flow in Settings → Bağlantılar |
| Data deletion path | In-app: Ayarlar → Gizlilik ve Güvenlik → Hesabımı Sil; web: `https://dijitalasistan.app/data-deletion` |
| Secure storage of tokens | AES-256-GCM at rest, server-only (`docs/SECURITY.md`) |
| No human reading of user data except with consent / security | Stated in the privacy policy; support tooling does not expose bodies |
| No use of Google user data for ads, no sale, no transfer beyond providers needed to run the service | Privacy policy (subprocessors listed: Supabase, AI provider, RevenueCat, Sentry, PostHog, Expo) |
| AI/ML: Google user data is not used to train generalized models | Privacy policy + provider terms (Anthropic/OpenAI API data is not used for training under API terms) |

## Limited Use statement (must appear verbatim on the privacy page)

> Dijital Asistan's use and transfer to any other app of information received from Google APIs will adhere to the
> [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements.

## Submission steps

1. Cloud Console → OAuth consent screen → **Publishing status: In production** → *Prepare for verification*.
2. Fill in scope justifications (copy from `/oauth` page), upload the demo video (YouTube unlisted), confirm domain ownership.
3. For restricted scopes, choose a CASA assessor from Google's list; provide the security documentation
   (`docs/SECURITY.md`, `docs/PRIVACY_DATA_FLOW.md`) and remediate findings.
4. Until verification completes, keep the app in *Testing* with up to 100 test users, or ship with the "unverified app"
   warning for internal testers only.
5. Re-verify annually and whenever scopes change.

## Play / App Store parallels

- Play Console *Data safety* form: data collected = email address, emails/messages (app functionality), calendar events,
  crash logs, product interaction; encrypted in transit; deletion available; not shared for ads.
- App Store *Privacy Nutrition Labels*: matches `ios.privacyManifests` in `apps/mobile/app.config.ts`.
