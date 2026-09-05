# Architecture

Dijital Asistan is a personal command center: it reads the user's mail, calendar and tasks, reduces them to the
handful of things that matter today, and asks for approval before doing anything on the user's behalf.

```
apps/mobile (Expo SDK 57 · expo-router · TanStack Query · Zustand)
   │  uses
   ├── packages/ui            React Native components (Claude Design system, light/dark)
   ├── packages/api-client    DataSource interface → SupabaseDataSource | DemoDataSource
   ├── packages/i18n          tr/en strings + timezone-safe formatting
   ├── packages/design-tokens colors · type · spacing · radii · shadows · motion · icons
   ├── packages/domain        entities · enums · API/function contracts · deep links · entitlements
   └── packages/validation    zod schemas (AI outputs, API payloads)

apps/web (Next.js 16)        marketing site, legal/OAuth pages, universal-link fallbacks, .well-known

supabase/
   ├── migrations/            PostgreSQL schema, RLS, functions, storage, pg_cron
   ├── functions/             Deno Edge Functions (one folder per EDGE_FUNCTIONS entry) + _shared infra
   ├── seed/                  demo dataset (Yunus)
   └── tests/                 pgTAP RLS tests + Supabase shim for plain Postgres

packages/server-core         runtime-agnostic backend logic used by Edge Functions and unit-tested in Node:
                             triage → priority engine → insights → briefings; AI provider layer; extraction
                             (dates, commitments, life events); approvals state machine; entitlements; referral;
                             retention; reminders; notifications; calendar intelligence; follow-ups; memory/RAG;
                             provider adapters (Gmail, Graph, Calendar, Tasks, demo); push; sync planning;
                             crypto (AES-GCM); SSRF-safe fetch; rate limiting; OAuth.
```

## Runtime flow

1. **Connect** — OAuth (least-privilege read scopes) → tokens encrypted → `sync_states` created → initial 72 h analysis
   enqueued. Device calendars (EventKit / Android) are read on device and uploaded.
2. **Ingest** — `sync-*` functions pull mail/calendar/tasks (webhooks when configured, polling otherwise) and store
   normalized rows. Every message gets a content fingerprint.
3. **Classify** — `triage` (deterministic labels/senders/keywords) decides `skip | low | rules | ai`. Only `ai` items go
   to the small model in batches; a few high-signal items get deep analysis with the large model. Results are cached by hash.
4. **Extract** — dates with evidence, commitments, life events (shipment/flight/payment/subscription/security), follow-ups.
5. **Rank** — the priority engine (explicit rules > security > deadline > VIP > waiting-for-user > own commitments >
   meeting relevance > learned preferences > AI importance > promotion penalty) scores candidates; `insights` rows are upserted
   with dedupe keys.
6. **Compose** — `today` groups insights into the Today feed; `briefing` assembles morning/midday/evening/weekly
   briefings (deterministic fallback narrative, optionally enriched by the large model, never inventing items).
7. **Notify** — timezone-aware cron evaluates each user's schedule; pushes are deduped, quiet-hours-aware and
   respect lock-screen privacy; widgets are refreshed from the Today snapshot.
8. **Act** — every write (send mail, create/move event, create task/reminder/commitment) is an `approval_actions` row.
   The user approves/edits/rejects; `approvals-decide` executes idempotently via the provider adapter and records the result.
9. **Ask** — the assistant retrieves memory chunks (pgvector or Turkish FTS), answers with citations, and turns write
   intents into approvals.

## Client architecture

- **expo-router** file routes (see `apps/mobile/ROUTES.md`), root layout handles auth/onboarding redirects, deep links,
  share intents, notification taps and widget sync.
- **DataSource** (`@da/api-client`) is the only data boundary. Demo mode (development only) provides deterministic
  fixtures and simulated execution so the whole app works without credentials; production always uses Supabase.
- **State**: TanStack Query for server state (offline-first, persisted in encrypted MMKV), Zustand for session/UI
  state, no global mutable singletons beyond the data source.
- **Theme**: `ThemeProvider` resolves system/light/dark; every component reads tokens from `useTheme()`; no
  hard-coded surfaces.
- **Entitlements**: `useEntitlement().gate(feature, context)` is the single place that opens the paywall.
- **Native**: Android `NotificationListenerService` (Expo module, Kotlin), widgets (`expo-widgets`), share
  extension / intents (`expo-share-intent`), EventKit via `expo-calendar`, RevenueCat, Sentry, PostHog.

## Backend architecture

- Postgres is the system of record; RLS is the authorization layer; Edge Functions hold business logic and secrets.
- `server-core` contains no I/O — functions receive data and return plans/results, so the logic is unit-tested in
  Node and executed in Deno unchanged (`supabase/functions/deno.json` import map).
- Cost control: heuristics before models, batching, hash dedupe, small/large model tiers, per-user token budgets,
  embeddings only for meaningful chunks, content-free usage telemetry (`ai_usage`).
- Reliability: idempotency keys on approvals/executions/webhooks, error backoff in `sync_states`, retention and
  approval expiry jobs, delivery logs for push.

## Environments

| | Development | Preview | Production |
| --- | --- | --- | --- |
| Data | Demo fixtures (`EXPO_PUBLIC_DATA_MODE=demo`) or local Supabase | Supabase project (staging) | Supabase project (prod) |
| Build | Expo dev client (`eas build --profile development`) | internal distribution | App Store / Play |
| AI | optional keys | real keys, small budgets | real keys |
| Push | Expo push (dev credentials) | Expo push | Expo push (APNs key / FCM) |

See `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/AI_PIPELINE.md`, `docs/DATA_MODEL.md`.
