# Security

Threat model: a consumer app that reads users' email and calendars. The two things that must never
leak are **provider credentials** and **message content**. Everything below follows from that.

## Trust boundaries

```
 Mobile app (untrusted client) ──JWT──▶ Supabase Auth
        │                                  │
        │ RLS-scoped PostgREST/RPC          ▼
        ├────────────────────────────▶ PostgreSQL (RLS on every user table)
        │
        └── Edge Functions (Deno) ──service role──▶ PostgreSQL / Storage
                 │
                 ├── Gmail / Graph / Calendar APIs (OAuth tokens decrypted in-memory only)
                 ├── AI provider (Anthropic / OpenAI) — server-side keys only
                 └── Expo Push, RevenueCat, TTS/STT/Embeddings adapters
```

- The client never holds provider refresh tokens, AI keys, service-role keys or webhook secrets.
- `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` are the only variables bundled into clients; `scripts/check-secrets.mjs`
  fails CI if a server-only variable name is referenced from client code or a credential-looking string is committed.

## OAuth credentials at rest

- Stored in `oauth_credentials` as `v1:<iv>:<ciphertext+tag>` — AES-256-GCM via WebCrypto
  (`packages/server-core/src/crypto`). Key: `TOKEN_ENCRYPTION_KEY` (32 bytes base64). Rotation:
  `TOKEN_ENCRYPTION_KEY_PREVIOUS` is tried on decrypt; rows are re-encrypted lazily (`key_version`).
- Table has **no client policies** and `REVOKE ALL … FROM anon, authenticated`; only the service role reads it.
- Access tokens are decrypted inside an Edge Function invocation and discarded. Every decrypt writes an
  `audit_logs` row (`token.decrypt`) with account id only.
- Least privilege: read scopes at connect time; `gmail.send`, `calendar.events`, `Mail.Send`,
  `Calendars.ReadWrite`, `Tasks.ReadWrite` are requested progressively the first time an approval needs them
  (`approval_actions.required_scope` → `scope_required` API error → app opens the incremental consent flow).
- Refresh-token rotation (Microsoft returns new refresh tokens) is handled by always persisting the newest token.
- Revocation: Google revoke endpoint on disconnect/account deletion; Microsoft has no per-app revoke API
  (documented in KNOWN_PLATFORM_LIMITATIONS.md).
- OAuth `state` is HMAC-signed, single-use, 10-minute TTL (`oauth_states`), and PKCE is used for both providers.

## Row Level Security

- Every user-owned table has RLS **enabled and forced**; policies are `user_id = auth.uid()`.
- Server-produced tables (threads, insights, briefings, approvals…) are read-only for clients; the few
  client-editable columns are enforced with `BEFORE UPDATE` guard triggers that reset all other columns
  (`internal.guard_*`). The approval state machine is enforced in the database, not just in code.
- `anon` has no privileges on `public` tables. Storage policies scope every object to `<user_id>/…`.
- `supabase/tests/rls.test.sql` (pgTAP, 37 assertions) proves cross-user isolation, secret invisibility,
  guard triggers and storage scoping; it runs in CI against a fresh Postgres.

## Edge Functions

- User functions verify the Supabase JWT and use a **user-scoped client** for reads/writes on the user's
  behalf; the service-role client is used only for pipelines, credentials and cron.
- Webhooks (`webhook-gmail`, `webhook-microsoft`, `webhook-revenuecat`) verify: Pub/Sub verification token,
  Graph `clientState`, RevenueCat `Authorization` header (constant-time compare). Events are idempotent via
  `webhook_events`.
- `cron-dispatch` and function-to-function calls require `x-internal-secret` (`INTERNAL_FUNCTION_SECRET`).
- Rate limits (`internal.rate_limit_hit`) per user/endpoint: assistant 20/min, capture upload 30/10 min,
  OAuth start 10/10 min, referral redeem 5/h, search 60/min, export 3/day. Sync is never rate-limited into failure.
- All user input is validated with zod (`@da/validation`) before use; errors return a stable envelope without stack traces.

## SSRF-safe link capture

`packages/server-core/src/safefetch`: http(s) only; rejects localhost, loopback, RFC1918, link-local,
CGNAT, multicast, IPv6 ULA/link-local and IPv4-mapped addresses, `*.local`/`*.internal`, non-standard ports;
re-validates every redirect hop (max 3); 8 s timeout; 2 MB streaming cap; content-type allowlist; optional DNS
resolver hook to reject public hostnames resolving to private IPs.

## AI safety

- Server-only provider keys; the client never calls an AI API.
- Structured outputs validated with zod; invalid output is rejected and retried once, then the fallback provider.
- Anti-hallucination instructions in every prompt; dates/amounts/flight numbers are only accepted with a verbatim
  `evidence` snippet, checked against the source text.
- Write intents from the assistant/voice become **approval actions** — never executed directly.
- Per-user daily token budgets, hash-based dedupe (`ai_analysis_cache`), heuristics before the model.

## Client-side storage

- Session material: `expo-secure-store` (Keychain / Keystore), chunked for iOS size limits.
- Cached summaries/preferences/offline snapshot: encrypted MMKV (`react-native-mmkv`) whose key lives in SecureStore.
- Raw email bodies are never cached on device; briefing/widget snapshots contain titles only.
- Logout and account deletion wipe the cache, the MMKV key and demo state (`wipeLocalData`).

## Logging & monitoring

- Structured logs redact tokens, emails and any field whose key matches `token|secret|body|subject|content…`.
- Sentry: `sendDefaultPii: false`, breadcrumbs stripped to method/status, PII scrubbed in `beforeSend`.
- Analytics: typed event catalogue; properties matching forbidden keys (body, subject, name, email, text…) are dropped
  before capture. No mail content, names or assistant text ever reach PostHog.

## Data lifecycle

Retention options 30d / 90d / 1y / forever (`internal.run_retention_cleanup`, daily 03:15 UTC), "Geçmişi Sil"
(`delete_my_history` RPC), async export with 24-hour signed URLs, account deletion (`privacy-delete-account`):
revoke tokens → delete storage prefixes → unlink RevenueCat → anonymize audit → delete auth user (cascades).

## What we do **not** claim

- Not end-to-end encrypted: the server must read content to summarize it. Wording everywhere is
  "Veriler aktarım sırasında ve saklanırken şifrelenir."
- No AI-training claims about third-party providers beyond their published terms.
