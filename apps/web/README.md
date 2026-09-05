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

Language: Turkish by default; `?lang=en` on any page persists English via the `/lang` handler. All copy lives in `src/i18n/{tr,en}.ts` (typed, both languages complete).

## Environment

Copy the root `.env.example` values you need into `apps/web/.env.local`:

| Variable                                                  | Used for                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_WEB_URL`                                     | Canonical URLs, sitemap, Open Graph                                                |
| `NEXT_PUBLIC_APP_STORE_URL`, `NEXT_PUBLIC_PLAY_STORE_URL` | Store badges. When both are empty the CTA leads to the beta-access section instead |
| `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`                          | `apple-app-site-association` (`appIDs` stays empty without a team id)              |
| `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS`     | `assetlinks.json` (comma-separated fingerprints; empty list when unset)            |
| `SUPPORT_EMAIL`, `PRIVACY_EMAIL`                          | Contact addresses on support/legal pages (defaults built in)                       |

## Deploy (Vercel)

1. Import the repository; set **Root Directory** to `apps/web` and keep the monorepo detection on (pnpm workspace).
2. Build command `pnpm --filter @da/web build`, install command `pnpm install` (run from the repo root).
3. Add the environment variables above. `.well-known` responses are computed per request, so App Link config changes do not need a rebuild.
4. Point `dijitalasistan.app` and `www.dijitalasistan.app` at the project; both hosts are listed in `EXPO_PUBLIC_UNIVERSAL_LINK_HOSTS`.
