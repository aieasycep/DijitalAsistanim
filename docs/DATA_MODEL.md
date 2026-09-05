# Data model

Source of truth: `supabase/migrations/*.sql`. TypeScript mirrors: `packages/domain/src/entities.ts` (camelCase)
and `packages/domain/src/enums.ts` (enum unions mirrored 1:1 by Postgres enum types — change both together).
All timestamps are `timestamptz` in UTC; the user's IANA timezone lives in `profiles.timezone` and
`user_preferences.timezone`.

## Identity & preferences

| Table                      | Purpose                                                                                                                                                                                                       | Notes                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `profiles`                 | 1:1 with `auth.users`; name, timezone, locale, onboarding/first-analysis timestamps, `referral_code` (unique, generated), `plan`, `revenuecat_app_user_id`                                                    | created by trigger `internal.handle_new_user` |
| `user_preferences`         | theme, locale, briefing schedule (jsonb `BriefingSchedule`), interests, `learn_from_interactions`, retention, attachment analysis opt-in, motion/haptics, Android notification scope/allowlist/upload consent |                                               |
| `notification_preferences` | per-category toggles, only-when-important, quiet hours, lock-screen privacy, meeting lead minutes                                                                                                             |                                               |

## Connections & sync

| Table                 | Purpose                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connected_accounts`  | provider (google/microsoft/apple/device/demo), kinds[] (email/calendar/tasks…), status, granted scopes, per-account `controls` (data-source toggles), backfill flag, soft delete |
| `oauth_credentials`   | encrypted access/refresh tokens, expiry, scope, key version — **server only**                                                                                                    |
| `oauth_states`        | PKCE verifier (encrypted) + signed state for in-flight OAuth flows (10 min)                                                                                                      |
| `sync_states`         | per (account, resource) cursor (Gmail historyId / Graph deltaLink), webhook subscription id/expiry, mode webhook/polling, backfill pagination, error backoff                     |
| `first_analysis_runs` | onboarding progress (step, counts, window 72h)                                                                                                                                   |
| `webhook_events`      | idempotency for Pub/Sub, Graph and RevenueCat deliveries                                                                                                                         |

## Content

| Table                                      | Purpose                                                                                                                                               | Dedupe / uniqueness                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `email_threads`                            | provider thread with participants, importance/category, `analysis` jsonb (`EmailAnalysis`), priority score & reasons, triage bucket, user flags       | `(account_id, external_thread_id)`; `fingerprint` |
| `email_messages`                           | messages (retention-limited `body_text`), attachments metadata, `is_from_user`                                                                        | `(account_id, external_message_id)`               |
| `ai_analysis_cache`                        | hash-keyed AI results so the same content is never sent to a model twice                                                                              | PK `(user_id, fingerprint, purpose)`              |
| `calendar_events`                          | normalized events from Google/Microsoft/EventKit/Android, meeting URL/provider, `provider_updated_at` for conflict resolution, cached `prep`          | `(account_id, external_event_id)`                 |
| `tasks`                                    | internal + provider tasks (Google Tasks / To Do), scheduled block for Plan                                                                            | `(account_id, external_task_id)`                  |
| `reminders`                                | smart reminders (option, target, smart reason, local notification id)                                                                                 |                                                   |
| `commitments`                              | "Cuma gönderirim" style promises (direction user_owes/other_owes), source, confidence, status                                                         | `(user_id, dedupe_key)`                           |
| `follow_ups`                               | threads the user sent last with no reply; nudge cadence, snooze, dismiss count                                                                        | `(user_id, thread_id)`                            |
| `life_events`                              | shipment/flight/reservation/payment/subscription/security with evidence-only `details`                                                                | `(user_id, dedupe_key)`                           |
| `calendar_conflicts`                       | overlapping events + suggestions, status                                                                                                              | `(user_id, event_a_id, event_b_id)`               |
| `insights`                                 | Today/Flow cards: kind, badge, title, reason, score, time label, source, actions[], entity ref, tags, `for_date`                                      | `(user_id, dedupe_key)`                           |
| `briefings` / `briefing_items`             | morning/midday/evening/weekly briefings with narrative, counts, audio chapters, weekly metrics; items grouped by section                              | `(user_id, kind, for_date, version)`              |
| `approval_actions`                         | the safety core: type, status machine, what/why/change summary, payload + original payload, idempotency key, expiry, execution result, required scope | `(user_id, idempotency_key)`                      |
| `assistant_threads` / `assistant_messages` | conversations with sources, rich cards, created approval ids, uncertainty flag, token usage                                                           |                                                   |
| `memory_chunks`                            | normalized summaries/excerpts with `embedding vector(1536)` (HNSW) and Turkish `tsvector` (GIN) — never raw bodies                                    | `(user_id, source_type, source_id)`               |
| `captures`                                 | Universal Capture items: kind, storage path, extracted text, analysis, origin (in-app / share extension / Android intent)                             |                                                   |
| `post_meeting_notes`                       | text/voice notes after meetings → extracted commitments                                                                                               |                                                   |
| `android_notifications`                    | Android-only opt-in notification items (never OTP/authenticator)                                                                                      | `(user_id, fingerprint)`                          |

## People & rules

| Table                 | Purpose                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts`            | derived from communication + manual; emails[], stats, `is_vip`                                                                                                            |
| `vip_people`          | explicit VIP list (contact, email, relation, notify_always)                                                                                                               |
| `priority_rules`      | deterministic rules (sender/domain important, VIP notify, keyword high/low, promotions low, mute sender/domain), ordered                                                  |
| `learned_preferences` | AI-learned preferences (person priority, category priority, reminder lead, follow-up cadence, dismiss patterns) with weight/evidence — always lower precedence than rules |
| `ai_feedback`         | "Önemli değil", "Bunu daha sık göster", VIP, stop following…                                                                                                              |

## Platform

| Table                             | Purpose                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `push_tokens` / `push_deliveries` | device tokens; delivery log with dedupe key, status, receipts                                     |
| `briefing_send_log`               | one briefing push per (user, kind, local date)                                                    |
| `subscriptions`                   | RevenueCat mirror + referral/promo/demo grants; entitlement resolver picks the best active source |
| `referrals` / `referral_credits`  | invite codes, redemptions with abuse fields, 14-day credits for both sides                        |
| `usage_counters`                  | per-day quotas (assistant queries, captures, AI tokens)                                           |
| `ai_usage`                        | content-free cost telemetry (purpose, model, tokens, latency)                                     |
| `rate_limits`                     | fixed-window counters                                                                             |
| `audit_logs`                      | append-only trail (ids only, never content)                                                       |
| `data_export_requests`            | async export status + signed URL expiry                                                           |
| `feedback_submissions`            | in-app feedback                                                                                   |

## Functions & RPCs

- `search_memory(query, count, embedding?, contact?)` — semantic when an embedding is passed, else Turkish FTS (`websearch_to_tsquery('turkish')` + unaccent).
- `increment_usage(counter, amount)`, `my_entitlement()`, `resolve_insight(id, status, feedback?)`, `delete_my_history(days?)`, `person_open_loops(contact)`.
- `internal.rate_limit_hit`, `internal.expire_approvals`, `internal.run_retention_cleanup`, `internal.upsert_contact`, `internal.invoke_function` (pg_cron → Edge Functions via pg_net).

## Cron (pg_cron → `cron-dispatch`)

| Job                | Schedule        | Purpose                                                 |
| ------------------ | --------------- | ------------------------------------------------------- |
| `da_briefings`     | */5 min         | timezone-aware morning/midday/evening/weekly evaluation |
| `da_sync_poll`     | */10 min        | polling sync for accounts without webhooks              |
| `da_reminders`     | every minute    | due reminders & meeting lead notifications              |
| `da_followups`     | hourly          | follow-up detection, midday delta                       |
| `da_subscriptions` | 6 h             | Gmail watch / Graph subscription renewal                |
| `da_retention`     | daily 03:15 UTC | retention cleanup, approval expiry                      |
| `da_exports`       | */15 min        | export & deletion queue                                 |
| `da_backfill`      | */30 min        | 90-day history backfill                                 |

## Retention & deletion

Retention cutoff per user (`internal.retention_cutoff`) applies to messages, threads, memory, captures,
notifications, assistant messages, briefings and resolved insights — never to connections, approvals or subscriptions.
Account deletion cascades from `auth.users` → `profiles` → every user table (all FKs `on delete cascade`).
