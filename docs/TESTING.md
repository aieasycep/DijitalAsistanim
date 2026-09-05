# Testing

| Layer | Tool | Command | What it covers |
| --- | --- | --- | --- |
| Design tokens, domain, validation, i18n | Vitest | `pnpm test:unit` | token contrast rules, zod schemas (anti-hallucination invariants), locale parity, timezone-safe formatting |
| Server core | Vitest | `pnpm --filter @da/server-core test` | priority engine & rule precedence, triage, date extraction (TR/EN), commitments, life events, AI client (request shaping, retry, fallback, budgets), embeddings/speech adapters, entitlements & RevenueCat events, referral abuse rules, retention plans, approval state machine, smart reminder times, time-saved formula, analytics scrubbing, notification scheduling/quiet hours, calendar conflicts/free blocks, follow-ups, insights, briefings, memory/RAG grounding, provider adapters (MIME, base64url, normalizers), push batching, sync planning, crypto, SSRF fetcher, rate limiter, OAuth |
| API client | Vitest | `pnpm --filter @da/api-client test` | demo adapter determinism & approval lifecycle, Supabase adapter request/envelope/error mapping, mappers, SecureStore chunking |
| Database | pgTAP | `pnpm test:db` (needs Postgres; `DATABASE_URL`) | migrations apply on a fresh DB, every table has RLS, cross-user isolation, secret tables unreadable, client guard triggers, approval transitions, RPC scoping, storage path scoping |
| Mobile components/services | Jest (jest-expo) + Testing Library | `pnpm test:mobile` | deep-link parsing, lock-screen privacy, widget snapshots, quiet hours, handoff URL validation, Android notification filters, screen rendering with the demo data source |
| Edge functions | Deno | `pnpm typecheck:functions` | type safety of every function against server-core |
| Web | Next.js | `pnpm build:web` | typecheck + production build |
| Expo config | expo-doctor / config introspection | `pnpm validate:expo` | plugins evaluate, identity fields, app group |
| E2E | Maestro | `pnpm --filter @da/mobile e2e` | Flows A–L on a development build in demo mode |
| Static | ESLint / Prettier / scripts | `pnpm lint`, `pnpm format:check`, `pnpm check:dead-code`, `pnpm check:secrets` | no `any`, no console noise, no TODO/placeholder/empty handlers, no committed secrets or server-only vars in clients |

`pnpm check:all` runs everything that does not need a device. CI (`.github/workflows/ci.yml`) runs install, lint,
typecheck (+Deno), unit/component tests, database tests against a `pgvector/pgvector:pg16` service, web build, Expo
validation and security checks.

## Running E2E locally

```bash
pnpm --filter @da/mobile prebuild
pnpm --filter @da/mobile ios          # or android
maestro test apps/mobile/maestro/flows --env APP_ID=com.dijitalasistan.app
```
Flows rely on the testIDs documented in `apps/mobile/ROUTES.md` and on demo-mode fixtures (Ahmet / Mehmet / Selin,
TK2412, 1.842 TL). They cannot run in the CI container (no simulator); run them on the release candidate.

## Writing tests

- Unit tests live next to the code (`*.test.ts`); use injected clocks (`now`) and `Europe/Istanbul` for time logic.
- Never call the network in tests — inject `fetch` mocks (see `src/ai/ai.test.ts`, `src/providers/*.test.ts`).
- Database tests are plain SQL in `supabase/tests/*.test.sql` using pgTAP; add a `plan(n)` and keep them idempotent
  (they run inside a transaction that is rolled back).
