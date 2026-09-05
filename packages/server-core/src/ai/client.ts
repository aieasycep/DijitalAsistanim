/**
 * AI client: budget-fitted prompts, structured output validated with zod, one repair retry,
 * provider fallback, result cache and content-free usage telemetry.
 */
import type { Locale } from '@da/domain';
import type { z } from 'zod';
import { AppError } from '../errors';
import { estimateTokens } from '../util';
import { AnthropicProvider } from './anthropic';
import { fitPromptToBudget } from './inputBudget';
import { OpenAIProvider } from './openai';
import { isAiProviderError } from './providerError';
import { extractJson, formatZodIssues, jsonSchemaFor } from './schema';
import type {
  AiCacheStore,
  AiFetch,
  AiLogger,
  AiMessage,
  AiProvider,
  AiProviderName,
  AiRequest,
  AiResponse,
  AiUsage,
  AiUsageRecord,
  AiUsageSink,
  PromptSpec,
} from './types';

export interface AiProviderCredentials {
  apiKey: string;
  modelSmall: string;
  modelLarge: string;
}

export interface AiClientConfig {
  provider: AiProviderName;
  fallbackProvider?: AiProviderName | null;
  anthropic?: AiProviderCredentials;
  openai?: AiProviderCredentials;
  fetch: AiFetch;
  /** Hard cap on estimated prompt tokens per call (AI_MAX_INPUT_TOKENS_PER_CALL). */
  maxInputTokensPerCall: number;
  logger?: AiLogger;
  onUsage?: AiUsageSink;
  cache?: AiCacheStore;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  locale?: Locale;
  defaultMaxOutputTokens?: number;
  /** Pre-built providers (tests, custom endpoints). Take precedence over credentials. */
  providers?: Partial<Record<AiProviderName, AiProvider>>;
}

export interface GenerateOptions {
  userId: string;
  locale?: Locale;
  /** Content fingerprint; when set and a cache store is configured, identical inputs are served from cache. */
  cacheKey?: string;
  cacheTtlSec?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GenerateStructuredResult<T> {
  data: T;
  usage: AiUsage;
  model: string;
  provider: AiProviderName;
  attempts: number;
  truncated: boolean;
  cached: boolean;
}

export interface GenerateTextResult {
  text: string;
  usage: AiUsage;
  model: string;
  provider: AiProviderName;
  attempts: number;
  truncated: boolean;
}

export interface AiClient {
  readonly providers: readonly AiProvider[];
  generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: PromptSpec,
    opts: GenerateOptions,
  ): Promise<GenerateStructuredResult<T>>;
  generateText(prompt: PromptSpec, opts: GenerateOptions): Promise<GenerateTextResult>;
}

export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
export const DEFAULT_CACHE_TTL_SEC = 7 * 24 * 3600;
const MAX_RETRY_DELAY_MS = 5_000;

export function aiUnavailableMessage(locale: Locale = 'tr'): string {
  return locale === 'en'
    ? 'The assistant is briefly unavailable. Please try again in a moment.'
    : 'Asistan şu an kısa bir süre için yanıt veremiyor. Birazdan tekrar dene.';
}

export function repairMessage(issues: string, locale: Locale = 'tr'): string {
  const head =
    locale === 'en'
      ? 'Your previous answer did not match the required schema. Problems:'
      : 'Önceki yanıtın istenen şemaya uymadı. Sorunlar:';
  return `${head}\n${issues}\n\nFix these issues, output ONLY valid JSON matching the schema. Do not add any other text and do not add facts that are not in the sources.`;
}

function buildProviders(config: AiClientConfig): AiProvider[] {
  const make = (name: AiProviderName): AiProvider | null => {
    const injected = config.providers?.[name];
    if (injected) return injected;
    const base = {
      fetch: config.fetch,
      timeoutMs: config.timeoutMs,
      logger: config.logger,
      now: config.now,
    };
    if (name === 'anthropic')
      return config.anthropic ? new AnthropicProvider({ ...config.anthropic, ...base }) : null;
    return config.openai ? new OpenAIProvider({ ...config.openai, ...base }) : null;
  };
  const primary = make(config.provider);
  if (!primary) {
    throw new AppError('internal', `AI sağlayıcı yapılandırması eksik: ${config.provider}`, {
      details: { provider: config.provider },
    });
  }
  const chain = [primary];
  const fallbackName = config.fallbackProvider ?? null;
  if (fallbackName && fallbackName !== config.provider) {
    const fallback = make(fallbackName);
    if (fallback) chain.push(fallback);
    else
      config.logger?.warn('ai fallback provider not configured; continuing without fallback', {
        provider: fallbackName,
      });
  }
  return chain;
}

export function createAiClient(config: AiClientConfig): AiClient {
  const providers = buildProviders(config);
  const now = config.now ?? (() => Date.now());
  const sleep =
    config.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const defaultLocale = config.locale ?? 'tr';

  const emit = async (record: AiUsageRecord): Promise<void> => {
    if (!config.onUsage) return;
    try {
      await config.onUsage(record);
    } catch (cause) {
      config.logger?.warn('ai usage sink failed', {
        cause: cause instanceof Error ? cause.message : 'unknown',
      });
    }
  };

  const usageBase = (prompt: PromptSpec, opts: GenerateOptions, provider: AiProvider) => ({
    userId: opts.userId,
    purpose: prompt.purpose,
    provider: provider.name,
    tier: prompt.tier,
  });

  /** One provider call; on a retryable transport error waits and retries once. */
  const callProvider = async (
    provider: AiProvider,
    req: AiRequest,
    prompt: PromptSpec,
    opts: GenerateOptions,
  ): Promise<{ response: AiResponse; attempts: number } | { error: unknown; attempts: number }> => {
    let attempts = 0;
    let lastError: unknown = null;
    for (let i = 0; i < 2; i++) {
      attempts++;
      const started = now();
      try {
        const response = await provider.complete(req);
        await emit({
          ...usageBase(prompt, opts, provider),
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          latencyMs: response.latencyMs,
          cached: false,
          ok: true,
        });
        return { response, attempts };
      } catch (error) {
        lastError = error;
        const providerError = isAiProviderError(error) ? error : null;
        await emit({
          ...usageBase(prompt, opts, provider),
          model: 'unknown',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Math.max(0, now() - started),
          cached: false,
          ok: false,
          errorCode: providerError?.code ?? 'unknown',
        });
        config.logger?.warn('ai provider call failed', {
          provider: provider.name,
          purpose: prompt.purpose,
          code: providerError?.code ?? 'unknown',
        });
        if (!providerError || !providerError.retryable || i === 1) break;
        await sleep(Math.min(MAX_RETRY_DELAY_MS, (providerError.retryAfterSec ?? 1) * 1000));
      }
    }
    return { error: lastError, attempts };
  };

  const unavailable = (
    locale: Locale,
    attempts: number,
    failures: string[],
    lastError: unknown,
  ): AppError => {
    const retryAfterSec = isAiProviderError(lastError)
      ? (lastError.retryAfterSec ?? undefined)
      : undefined;
    return new AppError('ai_unavailable', aiUnavailableMessage(locale), {
      details: { attempts, failures },
      ...(retryAfterSec ? { retryAfterSec } : {}),
      cause: lastError,
    });
  };

  const addUsage = (total: AiUsage, part: AiUsage): void => {
    total.inputTokens += part.inputTokens;
    total.outputTokens += part.outputTokens;
    if (part.cacheReadInputTokens)
      total.cacheReadInputTokens = (total.cacheReadInputTokens ?? 0) + part.cacheReadInputTokens;
  };

  const baseRequest = (
    prompt: PromptSpec,
    opts: GenerateOptions,
    messages: AiMessage[],
  ): AiRequest => ({
    tier: prompt.tier,
    system: prompt.system,
    messages,
    maxOutputTokens:
      opts.maxOutputTokens ??
      prompt.maxOutputTokens ??
      config.defaultMaxOutputTokens ??
      DEFAULT_MAX_OUTPUT_TOKENS,
    ...((opts.temperature ?? prompt.temperature) !== undefined
      ? { temperature: opts.temperature ?? prompt.temperature }
      : {}),
    metadata: { userId: opts.userId, purpose: prompt.purpose },
  });

  async function generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: PromptSpec,
    opts: GenerateOptions,
  ): Promise<GenerateStructuredResult<T>> {
    const locale = opts.locale ?? prompt.locale ?? defaultLocale;
    const jsonSchema = jsonSchemaFor(schema);
    const fit = fitPromptToBudget(prompt, {
      maxInputTokens: config.maxInputTokensPerCall,
      schemaTokens: estimateTokens(JSON.stringify(jsonSchema)),
      locale,
    });
    const cacheKey = opts.cacheKey && config.cache ? `ai:${prompt.purpose}:${opts.cacheKey}` : null;
    if (cacheKey && config.cache) {
      const hit = await readCache(config.cache, cacheKey, schema, config.logger);
      if (hit) {
        await emit({
          userId: opts.userId,
          purpose: prompt.purpose,
          provider: hit.provider,
          model: hit.model,
          tier: prompt.tier,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          cached: true,
          ok: true,
        });
        return {
          data: hit.data,
          usage: { inputTokens: 0, outputTokens: 0 },
          model: hit.model,
          provider: hit.provider,
          attempts: 0,
          truncated: fit.truncated,
          cached: true,
        };
      }
    }

    const usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
    const failures: string[] = [];
    let attempts = 0;
    let lastError: unknown = null;

    for (const provider of providers) {
      const messages: AiMessage[] = [{ role: 'user', content: fit.userMessage }];
      for (let round = 0; round < 2; round++) {
        const req: AiRequest = { ...baseRequest(prompt, opts, messages), jsonSchema };
        const outcome = await callProvider(provider, req, prompt, opts);
        attempts += outcome.attempts;
        if ('error' in outcome) {
          lastError = outcome.error;
          failures.push(
            `${provider.name}:${isAiProviderError(outcome.error) ? outcome.error.code : 'unknown'}`,
          );
          break;
        }
        addUsage(usage, outcome.response.usage);
        const candidate =
          outcome.response.json !== undefined
            ? outcome.response.json
            : extractJson(outcome.response.text);
        const parsed = schema.safeParse(candidate);
        if (parsed.success) {
          if (cacheKey && config.cache) {
            await writeCache(
              config.cache,
              cacheKey,
              parsed.data,
              outcome.response,
              opts.cacheTtlSec ?? DEFAULT_CACHE_TTL_SEC,
              config.logger,
            );
          }
          return {
            data: parsed.data,
            usage,
            model: outcome.response.model,
            provider: provider.name,
            attempts,
            truncated: fit.truncated,
            cached: false,
          };
        }
        failures.push(`${provider.name}:invalid_output`);
        config.logger?.warn('ai structured output failed validation', {
          provider: provider.name,
          purpose: prompt.purpose,
          issues: parsed.error.issues.length,
          round,
        });
        if (round === 0) {
          messages.push(
            { role: 'assistant', content: outcome.response.text },
            { role: 'user', content: repairMessage(formatZodIssues(parsed.error), locale) },
          );
        }
      }
    }
    throw unavailable(locale, attempts, failures, lastError);
  }

  async function generateText(
    prompt: PromptSpec,
    opts: GenerateOptions,
  ): Promise<GenerateTextResult> {
    const locale = opts.locale ?? prompt.locale ?? defaultLocale;
    const fit = fitPromptToBudget(prompt, { maxInputTokens: config.maxInputTokensPerCall, locale });
    const failures: string[] = [];
    let attempts = 0;
    let lastError: unknown = null;
    for (const provider of providers) {
      const req = baseRequest(prompt, opts, [{ role: 'user', content: fit.userMessage }]);
      const outcome = await callProvider(provider, req, prompt, opts);
      attempts += outcome.attempts;
      if ('error' in outcome) {
        lastError = outcome.error;
        failures.push(
          `${provider.name}:${isAiProviderError(outcome.error) ? outcome.error.code : 'unknown'}`,
        );
        continue;
      }
      return {
        text: outcome.response.text,
        usage: outcome.response.usage,
        model: outcome.response.model,
        provider: provider.name,
        attempts,
        truncated: fit.truncated,
      };
    }
    throw unavailable(locale, attempts, failures, lastError);
  }

  return { providers, generateStructured, generateText };
}

interface CachedEntry {
  data: unknown;
  model: string;
  provider: AiProviderName;
}

async function readCache<T>(
  cache: AiCacheStore,
  key: string,
  schema: z.ZodType<T>,
  logger?: AiLogger,
): Promise<{ data: T; model: string; provider: AiProviderName } | null> {
  let raw: string | null = null;
  try {
    raw = await cache.get(key);
  } catch (cause) {
    logger?.warn('ai cache read failed', {
      cause: cause instanceof Error ? cause.message : 'unknown',
    });
    return null;
  }
  if (!raw) return null;
  const entry = extractJson(raw);
  if (!entry || typeof entry !== 'object') return null;
  const { data, model, provider } = entry as Partial<CachedEntry>;
  if (typeof model !== 'string' || (provider !== 'anthropic' && provider !== 'openai')) return null;
  const parsed = schema.safeParse(data);
  if (!parsed.success) return null;
  return { data: parsed.data, model, provider };
}

async function writeCache(
  cache: AiCacheStore,
  key: string,
  data: unknown,
  response: AiResponse,
  ttlSec: number,
  logger?: AiLogger,
): Promise<void> {
  const entry: CachedEntry = { data, model: response.model, provider: response.provider };
  try {
    await cache.set(key, JSON.stringify(entry), ttlSec);
  } catch (cause) {
    logger?.warn('ai cache write failed', {
      cause: cause instanceof Error ? cause.message : 'unknown',
    });
  }
}
