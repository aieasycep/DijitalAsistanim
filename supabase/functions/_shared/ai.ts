/**
 * AI / embeddings / speech factories for Edge Functions. Everything is built from env, with:
 *  - a usage sink that records content-free telemetry (ai_usage) and the user's daily token counter,
 *  - a result cache over ai_analysis_cache (same fingerprint → no second provider call),
 *  - a daily token budget check (free vs pro) before expensive calls.
 */
import type { Plan } from '@da/domain';
import {
  assertBudget,
  createAiClient,
  type AiBudgetStatus,
  type AiCacheStore,
  type AiClient,
  type AiLogger,
  type AiUsageRecord,
} from '@da/server-core/ai';
import { createEmbeddingProvider, type EmbeddingProvider } from '@da/server-core/embeddings';
import { AppError } from '@da/server-core/errors';
import {
  resolveSttProvider,
  resolveTtsProvider,
  type SttProvider,
  type TtsProvider,
} from '@da/server-core/speech';
import { adminClient, type Db } from './db.ts';
import { getEnv } from './env.ts';
import { log } from './log.ts';
import { localDateKey } from './rows.ts';

const aiLogger: AiLogger = {
  debug: (m, meta) => log.debug(m, meta),
  info: (m, meta) => log.info(m, meta),
  warn: (m, meta) => log.warn(m, meta),
  error: (m, meta) => log.error(m, meta),
};

function cacheStore(admin: Db, userId: string): AiCacheStore {
  return {
    async get(key) {
      const { data } = await admin
        .from('ai_analysis_cache')
        .select('result, created_at')
        .eq('user_id', userId)
        .eq('fingerprint', key)
        .eq('purpose', 'client')
        .maybeSingle();
      const row = data as { result: { value: string; expiresAt: string } } | null;
      if (!row) return null;
      if (Date.parse(row.result.expiresAt) < Date.now()) return null;
      return row.result.value;
    },
    async set(key, value, ttlSec) {
      const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
      await admin
        .from('ai_analysis_cache')
        .upsert(
          { user_id: userId, fingerprint: key, purpose: 'client', result: { value, expiresAt } },
          { onConflict: 'user_id,fingerprint,purpose' },
        );
    },
  };
}

async function recordUsage(admin: Db, timezone: string, r: AiUsageRecord): Promise<void> {
  const tokens = r.inputTokens + r.outputTokens;
  const { error } = await admin.from('ai_usage').insert({
    user_id: r.userId,
    purpose: r.purpose,
    provider: r.provider,
    model: r.model,
    tier: r.tier,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    latency_ms: r.latencyMs,
    cached: r.cached,
    ok: r.ok,
  });
  if (error) log.warn('ai_usage insert failed', { error: error.message });
  if (tokens > 0 && !r.cached) {
    const day = localDateKey(new Date(), timezone);
    const { data } = await admin
      .from('usage_counters')
      .select('ai_tokens')
      .eq('user_id', r.userId)
      .eq('day', day)
      .maybeSingle();
    const current = (data as { ai_tokens: number } | null)?.ai_tokens ?? 0;
    await admin.from('usage_counters').upsert(
      {
        user_id: r.userId,
        day,
        ai_tokens: current + tokens,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,day' },
    );
  }
}

export interface AiContext {
  userId: string;
  plan: Plan;
  timezone: string;
  locale: 'tr' | 'en';
}

/** Whether any LLM provider key is configured (otherwise AI features degrade to rule-based output). */
export function aiConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.ai.anthropicApiKey || env.ai.openaiApiKey);
}

export function createAi(ctx: AiContext): AiClient {
  const env = getEnv();
  const admin = adminClient();
  if (!aiConfigured())
    throw new AppError('ai_unavailable', 'AI sağlayıcısı bu ortamda yapılandırılmamış.', {
      status: 503,
    });
  const provider =
    env.ai.provider === 'anthropic' && !env.ai.anthropicApiKey
      ? 'openai'
      : env.ai.provider === 'openai' && !env.ai.openaiApiKey
        ? 'anthropic'
        : env.ai.provider;
  return createAiClient({
    provider,
    fallbackProvider: env.ai.fallbackProvider ?? null,
    ...(env.ai.anthropicApiKey
      ? {
          anthropic: {
            apiKey: env.ai.anthropicApiKey,
            modelSmall: env.ai.anthropicModelSmall,
            modelLarge: env.ai.anthropicModelLarge,
          },
        }
      : {}),
    ...(env.ai.openaiApiKey
      ? {
          openai: {
            apiKey: env.ai.openaiApiKey,
            modelSmall: env.ai.openaiModelSmall,
            modelLarge: env.ai.openaiModelLarge,
          },
        }
      : {}),
    fetch: (input, init) => fetch(input, init),
    maxInputTokensPerCall: env.ai.maxInputTokensPerCall,
    logger: aiLogger,
    onUsage: (r) => recordUsage(admin, ctx.timezone, r),
    cache: cacheStore(admin, ctx.userId),
    locale: ctx.locale,
  });
}

/** Throws `quota_exceeded` when the user's daily token budget is exhausted. */
export async function checkAiBudget(ctx: AiContext, requested = 0): Promise<AiBudgetStatus> {
  const env = getEnv();
  const admin = adminClient();
  const day = localDateKey(new Date(), ctx.timezone);
  const { data } = await admin
    .from('usage_counters')
    .select('ai_tokens')
    .eq('user_id', ctx.userId)
    .eq('day', day)
    .maybeSingle();
  const usedToday = (data as { ai_tokens: number } | null)?.ai_tokens ?? 0;
  return assertBudget({
    plan: ctx.plan,
    usedToday,
    limits: { free: env.ai.dailyTokenBudgetFree, pro: env.ai.dailyTokenBudgetPro },
    requested,
    locale: ctx.locale,
    timezone: ctx.timezone,
  });
}

export function createEmbeddings(): EmbeddingProvider | null {
  const env = getEnv();
  const apiKey =
    env.embeddings.provider === 'voyage' ? env.embeddings.voyageApiKey : env.ai.openaiApiKey;
  return createEmbeddingProvider({
    provider: env.embeddings.provider,
    apiKey: apiKey ?? null,
    model: env.embeddings.model,
    dimensions: env.embeddings.dimensions,
    fetch: (input, init) => fetch(input, init),
    logger: aiLogger,
  });
}

export function createTts(): TtsProvider | null {
  const env = getEnv();
  return resolveTtsProvider({
    provider: env.tts.provider,
    voice: env.tts.voice,
    openaiApiKey: env.ai.openaiApiKey ?? null,
    elevenLabsApiKey: env.tts.elevenLabsApiKey ?? null,
    elevenLabsVoiceId: env.tts.elevenLabsVoiceId ?? null,
    fetch: (input, init) => fetch(input, init),
    logger: aiLogger,
  });
}

export function createStt(): SttProvider | null {
  const env = getEnv();
  return resolveSttProvider({
    provider: env.stt.provider,
    openaiApiKey: env.ai.openaiApiKey ?? null,
    deepgramApiKey: env.stt.deepgramApiKey ?? null,
    fetch: (input, init) => fetch(input, init),
    logger: aiLogger,
  });
}
