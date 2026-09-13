# Maestro E2E flows

Critical user journeys (Flow A–L from the product spec) run against a **development build in demo mode**
(`EXPO_PUBLIC_DATA_MODE=demo`) so they are deterministic and need no external credentials.

Build the dev client with the demo clock pinned so time-of-day copy ("Günaydın"), plan suggestions and the
seeded meetings are the same on every run (the clock keeps moving from the anchor; both variables are
ignored outside demo mode):

```bash
export EXPO_PUBLIC_DATA_MODE=demo
export EXPO_PUBLIC_DEMO_NOW=2026-09-05T06:41:00Z        # Saturday 09:41 in Europe/Istanbul
export EXPO_PUBLIC_DEMO_TIMEZONE=Europe/Istanbul

# iOS simulator
pnpm --filter @da/mobile prebuild && pnpm --filter @da/mobile ios
maestro test apps/mobile/maestro/flows --env APP_ID=com.dijitalasistan.app

# Android emulator
pnpm --filter @da/mobile android
maestro test apps/mobile/maestro/flows --env APP_ID=com.dijitalasistan.app
```

- `flows/00-onboarding.yaml` (Flow A) runs first on a fresh install; every other flow starts from the
  signed-in Today screen via `subflows/ensure-signed-in.yaml`, which performs the demo sign-in and onboarding
  when needed.
- Pro-gated journeys (Flow F, Meeting Prep) call `subflows/ensure-pro.yaml`, which buys Pro through the real
  paywall (demo purchase) when the user is still on the free plan.
- Flow L (`11-paywall-entitlement.yaml`) clears the app state first so it always starts from the free plan.
- The device-calendar card uses the platform-independent id `connect-card-device` on iOS and Android.

testIDs are documented in `apps/mobile/ROUTES.md` — keep both in sync.
