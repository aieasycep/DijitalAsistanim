# Maestro E2E flows

Critical user journeys (Flow A–L from the product spec) run against a **development build in demo mode**
(`EXPO_PUBLIC_DATA_MODE=demo`) so they are deterministic and need no external credentials.

```bash
# iOS simulator
pnpm --filter @da/mobile prebuild && pnpm --filter @da/mobile ios
maestro test apps/mobile/maestro/flows --env APP_ID=com.dijitalasistan.app

# Android emulator
pnpm --filter @da/mobile android
maestro test apps/mobile/maestro/flows --env APP_ID=com.dijitalasistan.app
```

`flows/00-onboarding.yaml` (Flow A) must run first on a fresh install; every other flow starts from the
signed-in Today screen via `subflows/ensure-signed-in.yaml`, which performs the demo sign-in when needed.

testIDs are documented in `apps/mobile/ROUTES.md` — keep both in sync.
