# Privacy data flow

What data enters the system, where it goes, how long it stays, and who can see it.

## 1. Sources → ingestion

| Source | What is read | Where it is stored | Not stored |
| --- | --- | --- | --- |
| Gmail / Outlook | headers, labels, snippet, plain-text body (retention-limited), attachment metadata | `email_threads`, `email_messages` | attachment binaries (unless the user enables "Ekleri analiz et" → PDF/text ≤ 10 MB cached temporarily in `attachments-cache`, deleted after analysis) |
| Google / Microsoft / Apple / Android calendars | title, time, location, attendees, meeting links | `calendar_events` | — |
| Google Tasks / To Do / Reminders | title, due, status | `tasks` | — |
| Android notifications (opt-in, Android only) | package, app name, title, text | on device; `android_notifications` **only** when "sunucuya gönder" consent is on | OTP codes, authenticator/password-manager notifications (dropped in the native service) |
| Universal Capture | image/PDF/file/link/text the user explicitly shares | `captures` + private storage `captures/<user>/…`; extracted text | — |
| Voice | microphone audio for a question/note | transcribed then discarded; audio never stored server-side | audio files |

## 2. Analysis

- Stage 1 heuristics and Stage 2 rules run without any AI (labels, senders, keywords, VIP, rules).
- Only threads that need it go to the model, batched and deduplicated by content hash (`ai_analysis_cache`).
- Prompts include truncated, redacted content (signatures/disclaimers stripped, per-purpose char limits).
- Model outputs (summaries, categories, extracted dates with evidence) are stored as `analysis` jsonb; **raw bodies
  are never written to memory** — `memory_chunks` holds normalized summaries and ≤ 600-char excerpts.
- AI providers receive content only for the duration of the request under API terms that exclude training.

## 3. What the user sees & controls

| Control | Effect |
| --- | --- |
| Data source controls (per account) | read mail / analyze attachments / detect deadlines / drafts / read events / suggest schedule / create with approval / read tasks — enforced server-side in the pipeline |
| Priority rules | deterministic, override AI learning |
| AI personalization toggle | off → no new learned preferences are written; existing can be disabled/deleted individually |
| Retention (30d / 90d / 1y / forever) | daily cleanup job removes older content; applies going forward |
| Geçmişi Sil | immediate deletion of analyzed content and memory; connections stay |
| Verilerimi İndir | async JSON/ZIP export, 24-hour signed URL, no tokens |
| Hesabımı Sil | revoke provider access, delete storage, unlink subscription, delete auth user (cascade) |
| Lock-screen privacy | full / title only / generic notification body |
| Android notification scope | all allowed apps / selected apps; upload consent separate from listener permission |

## 4. Outbound data

| Destination | Data | Purpose |
| --- | --- | --- |
| Anthropic / OpenAI (server) | redacted excerpts, extracted metadata | summaries, classification, briefings, assistant answers |
| Embedding provider (optional) | normalized summaries | semantic search |
| TTS / STT provider (optional) | briefing script text / voice audio | audio briefing, voice questions |
| Expo Push | device token, notification title/body (privacy-mode aware) | notifications |
| RevenueCat | app user id (opaque), purchase receipts | subscriptions |
| Sentry (optional) | crash data with PII scrubbed | stability |
| PostHog (optional) | typed events without content (`AnalyticsEventMap`) | product analytics |
| Google Routes (optional) | event location + origin | travel time (only when configured) |

Never sent anywhere: OAuth refresh tokens (server-only, encrypted), full mailboxes, contact books, analytics with
names/subjects/bodies.

## 5. Access

- Users: only their own rows (RLS forced on every user table; storage path scoping).
- Service role: Edge Functions and cron only; no dashboard access to bodies in normal operations.
- Audit: every credential decrypt, approval decision/execution, export, deletion and OAuth change is logged with ids only.
