# @da/web — Dijital Asistan website

Marketing site, legal pages, OAuth disclosure and app-link fallbacks. Next.js 16 (App Router), React 19, TypeScript strict. Visual tokens come from `@da/design-tokens`; deep-link helpers from `@da/domain`.

## Run

```bash
pnpm install                      # from the repo root
pnpm --filter @da/web dev         # http://localhost:3000
pnpm --filter @da/web build && pnpm --filter @da/web start
pnpm --filter @da/web typecheck   # tsc --noEmit (run a build once first so next-env.d.ts exists)
pnpm -w exec eslint apps/web --max-warnings=0
```

## Routes

| Route                                                                      | Purpose                                                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/`                                                                        | Landing (hero, integrations, how it works, features, security, pricing, FAQ, download)                         |
| `/pricing`                                                                 | Free vs Pro, billing terms, referral                                                                           |
| `/support`                                                                 | Contact and common topics                                                                                      |
| `/oauth`                                                                   | Google/Microsoft scopes, why/when, Limited Use statement, revocation                                           |
| `/privacy`, `/terms`, `/data-deletion`                                     | Legal pages (engineering drafts — legal review required before publishing)                                     |
| `/app/*`                                                                   | Universal/App Link fallback → `dijitalasistan://<path>`; used by `/app/referral?code=…`, e-mail and push links |
| `/referral/[code]`                                                         | Redirects to `/app/referral?code=…`                                                                            |
| `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`  | Built from env at request time                                                                                 |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/opengraph-image` | Metadata routes                                                                                                |
| `/lang?to=tr                                                               | en&next=/path`                                                                                                 | Persists the language cookie (`da_lang`) and redirects back |

Language: Turkish by default. `?lang=en` on any page renders English directly — `src/proxy.ts` turns the search param into the `x-da-lang` request header, which `getLang()` reads before the `da_lang` cookie — so `/pricing?lang=en` is a stable, cookie-less URL for crawlers and is what hreflang/sitemap alternates and the English canonical point at. The cookie is written only by the explicit toggle (`/lang`). All copy lives in `src/i18n/{tr,en}.ts` (typed, both languages complete); trial and referral numbers are filled from config at startup by `src/i18n/resolve.ts`, never typed into the copy.

## Environment

Copy the root `.env.example` values you need into `apps/web/.env.local`:

| Variable                                                  | Used for                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_WEB_URL`                                     | Canonical URLs, sitemap, Open Graph                                                                                                                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_APP_STORE_URL`, `NEXT_PUBLIC_PLAY_STORE_URL` | Store badges. When both are empty the CTA leads to the beta-access section instead                                                                                                                                                                                                                                                                          |
| `NEXT_PUBLIC_TRIAL_DAYS`                                  | Length of the Pro free trial in days. A trial exists only when the store product has an introductory offer, so set this (e.g. `7`) only once that offer is live. Unset/empty/`0` removes every trial mention: the Pro CTA reads “Pro’ya geç” / “Go Pro”, the FAQ says a trial may be offered when the store lists one, and no trial billing bullet is shown |
| `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`                          | `apple-app-site-association` (`appIDs` stays empty without a team id)                                                                                                                                                                                                                                                                                       |
| `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS`     | `assetlinks.json` (comma-separated fingerprints; empty list when unset)                                                                                                                                                                                                                                                                                     |
| `SUPPORT_EMAIL`, `PRIVACY_EMAIL`                          | Contact addresses on support/legal pages (defaults built in)                                                                                                                                                                                                                                                                                                |

## Deploy (Vercel)

1. Import the repository; set **Root Directory** to `apps/web` and keep the monorepo detection on (pnpm workspace).
2. Build command `pnpm --filter @da/web build`, install command `pnpm install` (run from the repo root).
3. Add the environment variables above. `.well-known` responses are computed per request, so App Link config changes do not need a rebuild.
4. Point `dijitalasistan.app` and `www.dijitalasistan.app` at the project; both hosts are listed in `EXPO_PUBLIC_UNIVERSAL_LINK_HOSTS`.
