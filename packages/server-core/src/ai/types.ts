/**
 * AI provider abstraction — shared types for the provider adapters, the client and the prompt
 * builders. Runtime-agnostic: providers receive an injected `fetch` and never read env.
 */
import type { Locale } from '@da/domain';
import type { z } from 'zod';

export const AI_PROVIDER_NAMES = ['anthropic', 'openai'] as const;
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

export const AI_TIERS = ['small', 'large'] as const;
export type AiTier = (typeof AI_TIERS)[number];

/** Why a call is made — used for cost telemetry and per-purpose context limits. Never prompt text. */
export const AI_PURPOSES = [
  'email_deep_analysis',
  'email_batch_classify',
  'briefing',
  'meeting_prep',
  'commitment_extraction',
  'capture_analysis',
  'assistant_answer',
  'reply_draft',
  'voice_intent',
  'schedule_suggestion',
  'suggested_questions',
  'other',
] as const;
export type AiPurpose = (typeof AI_PURPOSES)[number];

/** Injected fetch so provider calls are testable and work in Deno + Node. */
export type AiFetch = (input: string, init: RequestInit) => Promise<Response>;

/** Minimal logger contract; never receives prompt or completion text. */
export interface AiLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequestMetadata {
  userId: string;
  purpose: AiPurpose;
}

/** JSON Schema object (draft 2020-12 as produced by `z.toJSONSchema`). */
export type AiJsonSchema = Record<string, unknown>;

export interface AiRequest {
  tier: AiTier;
  system: string;
  messages: AiMessage[];
  /** When present the provider is forced to return an object matching this schema. */
  jsonSchema?: AiJsonSchema;
  maxOutputTokens: number;
  temperature?: number;
  metadata: AiRequestMetadata;
}

export type AiStopReason = 'end' | 'max_tokens' | 'tool_use' | 'refusal' | 'other';

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  /** Provider-side prompt-cache reads, when reported. */
  cacheReadInputTokens?: number;
}

export interface AiResponse {
  text: string;
  /** Parsed structured output (tool input / JSON body) when `jsonSchema` was requested. */
  json?: unknown;
  usage: AiUsage;
  model: string;
  provider: AiProviderName;
  latencyMs: number;
  stopReason: AiStopReason;
}

export interface AiProvider {
  readonly name: AiProviderName;
  complete(req: AiRequest): Promise<AiResponse>;
}

/** Cost telemetry record. Contains ids, counters and model names only — never prompt content. */
export interface AiUsageRecord {
  userId: string;
  purpose: AiPurpose;
  provider: AiProviderName;
  model: string;
  tier: AiTier;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** True when the result came from the injected result cache (no provider call). */
  cached: boolean;
  ok: boolean;
  /** Short machine-readable failure class when `ok` is false (e.g. "http_429", "invalid_output"). */
  errorCode?: string;
}

export type AiUsageSink = (record: AiUsageRecord) => void | Promise<void>;

/**
 * Optional result cache so identical inputs (same content fingerprint) are never sent to a
 * provider twice. Edge functions implement it over Postgres / KV; values are opaque JSON strings.
 */
export interface AiCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
}

/**
 * A prompt ready to be sent. `user` holds the task instructions (never truncated); `context`
 * holds the evidence (emails, chunks, calendar rows) and is the only part cut when the input
 * budget is exceeded.
 */
export interface PromptSpec<T = unknown> {
  purpose: AiPurpose;
  tier: AiTier;
  system: string;
  user: string;
  context?: string;
  schema?: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
  locale?: Locale;
}
