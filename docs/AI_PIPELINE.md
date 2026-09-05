# AI pipeline

Goal: surface the 5 things that matter, cheaply and without inventing facts.

## Stages

```
mail/calendar/tasks/notifications/captures
   │
   ▼ Stage 1 — deterministic triage (no AI)             packages/server-core/src/triage
   │   provider labels (SPAM, PROMOTIONS, SOCIAL, UPDATES), no-reply / bulk / List-Unsubscribe,
   │   known automated senders, subject heuristics (%, indirim, kampanya, bülten…)
   │   → skip | low
   ▼ Stage 2 — rules & signals (no AI)
   │   VIP sender, explicit priority rules (always important / mute / keyword), deadline terms (dates module),
   │   meeting terms, security alerts (fast path), finance/payment, travel, shipment
   │   → rules (pre-classified) | ai (needs a model)
   ▼ Stage 3 — AI only where needed                      packages/server-core/src/ai
       batch classification (small model, ≤ 20 items/call) → needsDeepAnalysis?
       deep analysis (large model) for action-required / VIP / deadline candidates
       every result validated with zod, cached by content hash (ai_analysis_cache)
```

Downstream consumers: extraction (dates/commitments/life events), priority engine, insights, briefings,
meeting prep, assistant, capture analysis, reply drafts — all through the same `createAiClient`.

## Provider layer

- `AI_PROVIDER=anthropic|openai`, optional `AI_FALLBACK_PROVIDER`. Models per tier: `*_MODEL_SMALL` (classification,
  suggestions) and `*_MODEL_LARGE` (briefing narrative, meeting prep, assistant, deep analysis).
- Anthropic: Messages API with a forced `emit` tool whose `input_schema` is the zod-derived JSON schema.
  OpenAI: chat completions with `response_format: json_schema` (strict).
- `generateStructured(schema, prompt)` → budget-fit prompt → provider → zod validation → one repair retry with the
  validation issues → fallback provider → `ai_unavailable` error (UI degrades to sources without summaries).
- Usage records (purpose, model, tokens, latency, cached, ok) go to `ai_usage`; prompts/content are never logged.

## Anti-hallucination rules (in every system prompt)

- Do not infer exact facts not present in the sources.
- Do not invent deadlines, amounts, attendees, bookings, flight numbers or PNRs.
- Dates/amounts must be returned with a verbatim `evidence` snippet; the pipeline verifies the snippet exists in the
  source and otherwise drops the field.
- If uncertain: "Kaynakta kesinleşmiyor." and lower `confidence`.
- Low-confidence actionable items (< 0.6) are shown with a confirmation prompt instead of being acted on.
- Briefing/meeting-prep prompts receive candidate items with ids and may only reorder/narrate those ids.
- Assistant answers must cite retrieved chunk ids; the grounding check flags numbers/dates not present in cited chunks.

## Prompt catalogue (`src/ai/prompts`)

| Purpose                                  | Tier  | Schema                           |
| ---------------------------------------- | ----- | -------------------------------- |
| emailBatchClassify                       | small | `emailBatchClassificationSchema` |
| emailDeepAnalysis                        | large | `emailAnalysisAiSchema`          |
| briefing (morning/midday/evening/weekly) | large | `briefingAiSchema`               |
| meetingPrep                              | large | `meetingPrepAiSchema`            |
| commitmentExtraction                     | small | `commitmentExtractionAiSchema`   |
| captureAnalysis                          | large | `captureAnalysisAiSchema`        |
| assistantAnswer (RAG)                    | large | `assistantAnswerAiSchema`        |
| replyDraft (4 tones)                     | large | `replyDraftAiSchema`             |
| voiceIntent                              | small | `voiceIntentAiSchema`            |
| scheduleSuggestion                       | small | `scheduleSuggestionAiSchema`     |
| suggestedQuestions                       | small | `suggestedQuestionsAiSchema`     |

## Priority engine order

1. explicit user rules (mute → score 0) · 2. security · 3. hard deadline · 4. VIP person · 5. waiting for the user's
   reply · 6. the user's own commitment · 7. upcoming meeting relevance · 8. learned preference · 9. AI importance ·
2. promotion/newsletter penalty. Feedback ("Önemli değil", "Bunu daha sık göster", "Bu kişiyi VIP yap", "Bunu takip
   etme") writes explicit rules/VIPs or learned preferences (only when "Etkileşimlerimden öğren" is on).

## Memory & RAG

- `memory_chunks` = normalized summary + key points + ≤ 600-char excerpt + metadata (topic, person, time).
- Embeddings (`EMBEDDING_PROVIDER=openai|voyage`) only for meaningful chunks; otherwise Turkish FTS (`search_memory`).
- Retrieval → trim to token budget → answer with citations → grounding check → source chips/cards in the UI.

## Cost controls

Heuristics first · batching · hash dedupe · small/large tiers · per-call input cap (`AI_MAX_INPUT_TOKENS_PER_CALL`) ·
per-user daily budgets (`AI_DAILY_TOKEN_BUDGET_FREE/PRO`) · initial analysis caps deep analysis at 20 threads and
defers the rest · free-plan assistant/capture quotas (`usage_counters`) · content-free telemetry.

## Speech

TTS: `TTS_PROVIDER=none` → device TTS (expo-speech) reads the chapter script; `openai|elevenlabs` → server audio stored in
`briefing-audio` with signed URLs. STT: `STT_PROVIDER=none` → the voice screen offers typing; `openai|deepgram` → server
transcription (audio discarded after).
