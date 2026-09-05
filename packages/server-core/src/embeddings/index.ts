/**
 * embeddings — optional vector embeddings for memory search (pgvector). When no provider is
 * configured (`EMBEDDING_PROVIDER=none`) the caller falls back to PostgreSQL full-text search.
 *
 * Providers speak raw HTTP through an injected `fetch` (Deno Edge + Node tests), batch inputs in
 * groups of at most 100, and retry 429 / 5xx responses with exponential backoff via an injected
 * `sleep`. Vectors are validated against the configured dimension before they reach the database.
 */
import type { EmailCategory, Importance, SourceType } from '@da/domain';
import { z } from 'zod';
import { parseRetryAfterSec } from '../ai/providerError';
import type { AiFetch, AiLogger } from '../ai/types';
import { AppError } from '../errors';
import { chunk, estimateTokens, normalizeText } from '../util';

export const EMBEDDING_PROVIDER_NAMES = ['openai', 'voyage'] as const;
export type EmbeddingProviderName = (typeof EMBEDDING_PROVIDER_NAMES)[number];

/** Voyage distinguishes query vs. document embeddings; OpenAI ignores the hint. */
export type EmbeddingInputType = 'document' | 'query';

export interface EmbedOptions {
  inputType?: EmbeddingInputType;
}

export interface EmbeddingProvider {
  readonly name: EmbeddingProviderName;
  readonly model: string;
  readonly dimensions: number;
  /** One vector per input text, in input order. `[]` for an empty input without any request. */
  embed(texts: string[], opts?: EmbedOptions): Promise<number[][]>;
}

export const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
export const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';
export const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_VOYAGE_EMBEDDING_MODEL = 'voyage-3';
/** Maximum inputs per request (OpenAI hard limit is 2048, Voyage 128; 100 keeps payloads small). */
export const EMBEDDING_BATCH_MAX = 100;
export const EMBEDDING_MAX_ATTEMPTS = 3;
/** Chunks shorter than this carry no retrievable meaning ("Tamam, teşekkürler"). */
export const EMBEDDING_MIN_TOKENS = 8;
/** Provider input limit is 8191 tokens for text-embedding-3; keep a margin for the 4-chars/token estimate. */
export const EMBEDDING_MAX_INPUT_TOKENS = 8000;
const DEFAULT_TIMEOUT_MS = 30_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8_000;

export type EmbeddingSleep = (ms: number) => Promise<void>;

export interface EmbeddingProviderConfig {
  apiKey: string;
  model: string;
  dimensions: number;
  fetch: AiFetch;
  /** Injected so tests never wait; defaults to setTimeout. */
  sleep?: EmbeddingSleep;
  logger?: AiLogger;
  timeoutMs?: number;
  /** Override for proxies / tests. */
  url?: string;
  maxAttempts?: number;
}

const embeddingsResponseSchema = z.object({
  data: z.array(z.object({ index: z.number().int().nonnegative().optional(), embedding: z.array(z.number()) })),
  model: z.string().optional(),
});

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
}

function providerError(provider: EmbeddingProviderName, status: number | null, kind: 'http' | 'network' | 'timeout' | 'parse', retryAfterSec?: number | null, cause?: unknown): AppError {
  const message =
    kind === 'timeout' ? 'Gömme sağlayıcısı zaman aşımına uğradı.' : kind === 'network' ? 'Gömme sağlayıcısına ulaşılamadı.' : kind === 'parse' ? 'Gömme sağlayıcısının yanıtı çözümlenemedi.' : `Gömme sağlayıcısı hata döndürdü (HTTP ${status}).`;
  return new AppError('ai_unavailable', message, {
    details: { provider, kind, ...(status !== null ? { status } : {}) },
    ...(retryAfterSec ? { retryAfterSec } : {}),
    cause,
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * POST JSON with timeout and bounded retries on 429 / 5xx / network failures. Retry delay honours
 * `Retry-After` when present, otherwise exponential backoff through the injected `sleep`.
 */
async function postJsonWithRetry(
  provider: EmbeddingProviderName,
  config: EmbeddingProviderConfig,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const maxAttempts = Math.max(1, config.maxAttempts ?? EMBEDDING_MAX_ATTEMPTS);
  const sleep = config.sleep ?? defaultSleep;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: AppError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await config.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      clearTimeout(timer);
      lastError = providerError(provider, null, controller.signal.aborted ? 'timeout' : 'network', null, cause);
      config.logger?.warn('embedding request failed', { provider, attempt, kind: controller.signal.aborted ? 'timeout' : 'network' });
      if (attempt < maxAttempts) await sleep(backoffMs(attempt));
      continue;
    }
    let text = '';
    try {
      text = await response.text();
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) {
      try {
        return JSON.parse(text) as unknown;
      } catch (cause) {
        throw providerError(provider, response.status, 'parse', null, cause);
      }
    }
    const retryAfterSec = parseRetryAfterSec(response.headers.get('retry-after'));
    lastError = providerError(provider, response.status, 'http', retryAfterSec);
    config.logger?.warn('embedding request rejected', { provider, attempt, status: response.status });
    if (!isRetryableStatus(response.status) || attempt >= maxAttempts) break;
    await sleep(retryAfterSec ? Math.min(BACKOFF_MAX_MS, retryAfterSec * 1000) : backoffMs(attempt));
  }
  throw lastError ?? providerError(provider, null, 'network');
}

function parseVectors(provider: EmbeddingProviderName, json: unknown, expectedCount: number, dimensions: number): number[][] {
  const parsed = embeddingsResponseSchema.safeParse(json);
  if (!parsed.success) throw providerError(provider, null, 'parse');
  const rows = parsed.data.data.map((row, position) => ({ index: row.index ?? position, embedding: row.embedding })).sort((a, b) => a.index - b.index);
  if (rows.length !== expectedCount) {
    throw new AppError('ai_unavailable', 'Gömme sağlayıcısı eksik sonuç döndürdü.', {
      details: { provider, expected: expectedCount, received: rows.length },
    });
  }
  for (const row of rows) {
    if (row.embedding.length !== dimensions) {
      throw new AppError('internal', 'Gömme vektörü boyutu yapılandırmayla uyuşmuyor.', {
        details: { provider, expected: dimensions, received: row.embedding.length },
      });
    }
  }
  return rows.map((r) => r.embedding);
}

function assertTexts(texts: string[]): void {
  const empty = texts.findIndex((t) => t.trim().length === 0);
  if (empty >= 0) {
    throw new AppError('validation', 'Boş metin gömülemez.', { details: { index: empty } });
  }
}

function assertConfig(provider: EmbeddingProviderName, config: EmbeddingProviderConfig): void {
  if (!Number.isInteger(config.dimensions) || config.dimensions <= 0) {
    throw new AppError('internal', 'Gömme boyutu pozitif bir tam sayı olmalı.', { details: { provider, dimensions: config.dimensions } });
  }
  if (!config.apiKey) {
    throw new AppError('internal', 'Gömme sağlayıcısı için API anahtarı eksik.', { details: { provider } });
  }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

/** text-embedding-3-* accept a `dimensions` parameter (Matryoshka truncation); ada-002 does not. */
export function openAiSupportsDimensions(model: string): boolean {
  return /^text-embedding-3/i.test(model);
}

export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly name = 'openai' as const;
  readonly model: string;
  readonly dimensions: number;
  private readonly config: EmbeddingProviderConfig;

  constructor(config: EmbeddingProviderConfig) {
    assertConfig('openai', config);
    this.config = config;
    this.model = config.model || DEFAULT_OPENAI_EMBEDDING_MODEL;
    this.dimensions = config.dimensions;
  }

  buildBody(texts: string[]): Record<string, unknown> {
    const body: Record<string, unknown> = { model: this.model, input: texts, encoding_format: 'float' };
    if (openAiSupportsDimensions(this.model)) body.dimensions = this.dimensions;
    return body;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    assertTexts(texts);
    const out: number[][] = [];
    for (const batch of chunk(texts, EMBEDDING_BATCH_MAX)) {
      const json = await postJsonWithRetry(this.name, this.config, this.config.url ?? OPENAI_EMBEDDINGS_URL, { authorization: `Bearer ${this.config.apiKey}` }, this.buildBody(batch));
      out.push(...parseVectors(this.name, json, batch.length, this.dimensions));
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Voyage
// ---------------------------------------------------------------------------

/** Models that accept `output_dimension`; voyage-3 / voyage-3-lite are fixed at 1024 / 512. */
export function voyageSupportsOutputDimension(model: string): boolean {
  return /^voyage-(3-large|3\.5|3\.5-lite|code-3)/i.test(model);
}

export class VoyageEmbeddings implements EmbeddingProvider {
  readonly name = 'voyage' as const;
  readonly model: string;
  readonly dimensions: number;
  private readonly config: EmbeddingProviderConfig;

  constructor(config: EmbeddingProviderConfig) {
    assertConfig('voyage', config);
    this.config = config;
    this.model = config.model || DEFAULT_VOYAGE_EMBEDDING_MODEL;
    this.dimensions = config.dimensions;
  }

  buildBody(texts: string[], opts?: EmbedOptions): Record<string, unknown> {
    const body: Record<string, unknown> = { model: this.model, input: texts, truncation: true };
    if (opts?.inputType) body.input_type = opts.inputType;
    if (voyageSupportsOutputDimension(this.model)) body.output_dimension = this.dimensions;
    return body;
  }

  async embed(texts: string[], opts?: EmbedOptions): Promise<number[][]> {
    if (texts.length === 0) return [];
    assertTexts(texts);
    const out: number[][] = [];
    for (const batch of chunk(texts, EMBEDDING_BATCH_MAX)) {
      const json = await postJsonWithRetry(this.name, this.config, this.config.url ?? VOYAGE_EMBEDDINGS_URL, { authorization: `Bearer ${this.config.apiKey}` }, this.buildBody(batch, opts));
      out.push(...parseVectors(this.name, json, batch.length, this.dimensions));
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface EmbeddingConfig {
  provider: EmbeddingProviderName | 'none';
  apiKey?: string | null;
  model: string;
  dimensions: number;
  fetch: AiFetch;
  sleep?: EmbeddingSleep;
  logger?: AiLogger;
  timeoutMs?: number;
}

/**
 * Build the configured provider, or `null` when embeddings are disabled or the key is missing —
 * the caller then uses full-text search. Never throws for a missing key (graceful degradation);
 * an invalid dimension is a programming error and does throw.
 */
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider | null {
  if (config.provider === 'none') return null;
  if (!config.apiKey) {
    config.logger?.warn('embedding provider configured without api key; falling back to full-text search', { provider: config.provider });
    return null;
  }
  const base: EmbeddingProviderConfig = {
    apiKey: config.apiKey,
    model: config.model,
    dimensions: config.dimensions,
    fetch: config.fetch,
    ...(config.sleep ? { sleep: config.sleep } : {}),
    ...(config.logger ? { logger: config.logger } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
  };
  return config.provider === 'openai' ? new OpenAIEmbeddings(base) : new VoyageEmbeddings(base);
}

// ---------------------------------------------------------------------------
// Selection: what is worth a vector
// ---------------------------------------------------------------------------

export interface EmbedCandidate {
  sourceType: SourceType;
  importance?: Importance | null;
  category?: EmailCategory | null;
  /** Newsletter / bulk mail detected by triage (List-Unsubscribe, Precedence: bulk). */
  isNewsletter?: boolean;
  tokenCount: number;
}

export type EmbedSkipReason = 'too_short' | 'promotion' | 'newsletter' | 'low_importance';

/** Why a chunk is not embedded, or `null` when it should be. */
export function embedSkipReason(candidate: EmbedCandidate): EmbedSkipReason | null {
  if (!Number.isFinite(candidate.tokenCount) || candidate.tokenCount < EMBEDDING_MIN_TOKENS) return 'too_short';
  if (candidate.category === 'promotion') return 'promotion';
  if (candidate.isNewsletter) return 'newsletter';
  if (candidate.importance === 'low') return 'low_importance';
  return null;
}

/** Promotions, newsletters, low-importance mail and tiny fragments never get a vector. */
export function shouldEmbed(candidate: EmbedCandidate): boolean {
  return embedSkipReason(candidate) === null;
}

/** Strip HTML / whitespace noise and cap the text to the provider's input limit. */
export function prepareEmbeddingText(text: string, maxTokens: number = EMBEDDING_MAX_INPUT_TOKENS): string {
  const clean = normalizeText(text ?? '').replace(/\s*\n\s*/g, '\n');
  if (estimateTokens(clean) <= maxTokens) return clean;
  const room = Math.max(0, maxTokens * 4);
  let cut = clean.slice(0, room);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > room * 0.8) cut = cut.slice(0, lastSpace);
  return cut.trimEnd();
}

// ---------------------------------------------------------------------------
// Vector math and pgvector I/O
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new AppError('validation', 'Vektör boyutları eşleşmiyor.', { details: { a: a.length, b: b.length } });
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** `[0.1,-0.2,…]` — the literal pgvector accepts for `vector` columns and RPC parameters. */
export function toPgVectorLiteral(vector: readonly number[]): string {
  if (vector.length === 0) throw new AppError('validation', 'Boş vektör yazılamaz.');
  const parts = new Array<string>(vector.length);
  for (let i = 0; i < vector.length; i++) {
    const v = vector[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new AppError('validation', 'Vektör yalnızca sonlu sayılar içermeli.', { details: { index: i } });
    }
    parts[i] = String(v);
  }
  return `[${parts.join(',')}]`;
}

/** Parse a pgvector literal (`[1,2,3]`) back into numbers; the inverse of `toPgVectorLiteral`. */
export function fromPgVectorLiteral(literal: string): number[] {
  const trimmed = literal.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new AppError('validation', 'Geçersiz pgvector değeri.');
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((part, index) => {
    const n = Number(part.trim());
    if (!Number.isFinite(n)) throw new AppError('validation', 'Geçersiz pgvector değeri.', { details: { index } });
    return n;
  });
}
