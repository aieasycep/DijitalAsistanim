import { describe, expect, it } from 'vitest';
import type { AiFetch } from '../ai/types';
import { isAppError } from '../errors';
import {
  EMBEDDING_BATCH_MAX,
  EMBEDDING_MIN_TOKENS,
  OPENAI_EMBEDDINGS_URL,
  OpenAIEmbeddings,
  VOYAGE_EMBEDDINGS_URL,
  VoyageEmbeddings,
  cosineSimilarity,
  createEmbeddingProvider,
  embedSkipReason,
  fromPgVectorLiteral,
  prepareEmbeddingText,
  shouldEmbed,
  toPgVectorLiteral,
} from './index';

interface FetchCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function embeddingsFor(texts: unknown, dims: number, shuffle = false): Response {
  const inputs = texts as string[];
  const data = inputs.map((_, index) => ({ index, embedding: Array.from({ length: dims }, (_v, d) => (index + 1) * (d + 1)) }));
  if (shuffle) data.reverse();
  return json({ data, model: 'test-model', usage: { total_tokens: 10 } });
}

function mockFetch(responders: ((call: FetchCall, index: number) => Response)[]) {
  const calls: FetchCall[] = [];
  const fetch: AiFetch = async (url, init) => {
    const call: FetchCall = { url, headers: (init.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init.body)) as Record<string, unknown> };
    calls.push(call);
    const responder = responders[Math.min(calls.length - 1, responders.length - 1)];
    if (!responder) throw new Error('no responder');
    return responder(call, calls.length - 1);
  };
  return { fetch, calls };
}

function sleeper() {
  const sleeps: number[] = [];
  return {
    sleeps,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
}

async function expectAppError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    if (!isAppError(error)) throw new Error(`expected AppError, got ${String(error)}`);
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected rejection with ${code}`);
}

describe('embeddings · OpenAI', () => {
  it('posts to /v1/embeddings with bearer auth, model and dimensions; returns vectors in input order', async () => {
    const { fetch, calls } = mockFetch([(call) => embeddingsFor(call.body.input, 4, true)]);
    const provider = new OpenAIEmbeddings({ apiKey: 'sk-test', model: 'text-embedding-3-small', dimensions: 4, fetch });
    const vectors = await provider.embed(['birinci metin burada', 'ikinci metin burada']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(OPENAI_EMBEDDINGS_URL);
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-test');
    expect(calls[0]!.body).toEqual({ model: 'text-embedding-3-small', input: ['birinci metin burada', 'ikinci metin burada'], encoding_format: 'float', dimensions: 4 });
    expect(vectors).toEqual([
      [1, 2, 3, 4],
      [2, 4, 6, 8],
    ]);
    expect(provider.name).toBe('openai');
    expect(provider.dimensions).toBe(4);
  });

  it('omits dimensions for ada-002 and sends nothing for empty input', async () => {
    const { fetch, calls } = mockFetch([(call) => embeddingsFor(call.body.input, 3)]);
    const provider = new OpenAIEmbeddings({ apiKey: 'k', model: 'text-embedding-ada-002', dimensions: 3, fetch });
    expect(await provider.embed([])).toEqual([]);
    expect(calls).toHaveLength(0);
    await provider.embed(['metin']);
    expect(calls[0]!.body.dimensions).toBeUndefined();
  });

  it('splits inputs into batches of at most 100 and concatenates results', async () => {
    const { fetch, calls } = mockFetch([(call) => embeddingsFor(call.body.input, 2)]);
    const provider = new OpenAIEmbeddings({ apiKey: 'k', model: 'text-embedding-3-small', dimensions: 2, fetch });
    const texts = Array.from({ length: 250 }, (_, i) => `metin ${i}`);
    const vectors = await provider.embed(texts);
    expect(calls.map((c) => (c.body.input as string[]).length)).toEqual([EMBEDDING_BATCH_MAX, EMBEDDING_BATCH_MAX, 50]);
    expect(vectors).toHaveLength(250);
    expect(vectors[0]).toEqual([1, 2]);
    expect(vectors[100]).toEqual([1, 2]);
    expect(vectors[249]).toEqual([50, 100]);
  });

  it('retries 429 with Retry-After, then 5xx with exponential backoff through the injected sleep', async () => {
    const { sleep, sleeps } = sleeper();
    const { fetch, calls } = mockFetch([
      () => json({ error: { message: 'rate limited' } }, 429, { 'retry-after': '2' }),
      () => json({ error: { message: 'boom' } }, 500),
      (call) => embeddingsFor(call.body.input, 2),
    ]);
    const provider = new OpenAIEmbeddings({ apiKey: 'k', model: 'text-embedding-3-small', dimensions: 2, fetch, sleep });
    const vectors = await provider.embed(['uzunca bir metin']);
    expect(vectors).toEqual([[1, 2]]);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([2000, 1000]);
  });

  it('gives up after the attempt limit and surfaces retryAfterSec; 401 is not retried', async () => {
    const { sleep, sleeps } = sleeper();
    const limited = mockFetch([() => json({ error: { message: 'rate limited' } }, 429, { 'retry-after': '7' })]);
    const provider = new OpenAIEmbeddings({ apiKey: 'k', model: 'text-embedding-3-small', dimensions: 2, fetch: limited.fetch, sleep });
    const error = await expectAppError(provider.embed(['metin']), 'ai_unavailable');
    expect(limited.calls).toHaveLength(3);
    expect(sleeps).toEqual([7000, 7000]);
    expect(error.retryAfterSec).toBe(7);
    expect(error.details).toMatchObject({ provider: 'openai', status: 429, kind: 'http' });

    const unauthorized = mockFetch([() => json({ error: { message: 'bad key' } }, 401)]);
    const p2 = new OpenAIEmbeddings({ apiKey: 'k', model: 'text-embedding-3-small', dimensions: 2, fetch: unauthorized.fetch, sleep });
    const e2 = await expectAppError(p2.embed(['metin']), 'ai_unavailable');
    expect(unauthorized.calls).toHaveLength(1);
    expect(e2.details?.status).toBe(401);
  });

  it('retries network failures and maps a final failure', async () => {
    const { sleep, sleeps } = sleeper();
    let attempts = 0;
    const fetch: AiFetch = async () => {
      attempts++;
      throw new TypeError('fetch failed');
    };
    const provider = new OpenAIEmbeddings({ apiKey: 'k', model: 'text-embedding-3-small', dimensions: 2, fetch, sleep });
    const error = await expectAppError(provider.embed(['metin']), 'ai_unavailable');
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([500, 1000]);
    expect(error.details).toMatchObject({ kind: 'network' });
  });

  it('rejects vectors whose dimension does not match the configuration, and empty texts', async () => {
    const { fetch } = mockFetch([(call) => embeddingsFor(call.body.input, 3)]);
    const provider = new OpenAIEmbeddings({ apiKey: 'k', model: 'text-embedding-3-small', dimensions: 4, fetch });
    const error = await expectAppError(provider.embed(['metin']), 'internal');
    expect(error.details).toMatchObject({ expected: 4, received: 3 });
    await expectAppError(provider.embed(['metin', '   ']), 'validation');
  });
});

describe('embeddings · Voyage', () => {
  it('posts to voyage with input_type and only sends output_dimension for flexible models', async () => {
    const { fetch, calls } = mockFetch([(call) => embeddingsFor(call.body.input, 2)]);
    const v3 = new VoyageEmbeddings({ apiKey: 'pa-test', model: 'voyage-3', dimensions: 2, fetch });
    await v3.embed(['sorgu'], { inputType: 'query' });
    expect(calls[0]!.url).toBe(VOYAGE_EMBEDDINGS_URL);
    expect(calls[0]!.headers.authorization).toBe('Bearer pa-test');
    expect(calls[0]!.body).toEqual({ model: 'voyage-3', input: ['sorgu'], truncation: true, input_type: 'query' });

    const large = new VoyageEmbeddings({ apiKey: 'pa-test', model: 'voyage-3-large', dimensions: 2, fetch });
    await large.embed(['belge']);
    expect(calls[1]!.body).toEqual({ model: 'voyage-3-large', input: ['belge'], truncation: true, output_dimension: 2 });
    expect(large.name).toBe('voyage');
  });
});

describe('embeddings · factory and selection', () => {
  const fetch: AiFetch = async () => json({});

  it('createEmbeddingProvider returns null for none / missing key and the right class otherwise', () => {
    const warnings: string[] = [];
    const logger = { warn: (m: string) => void warnings.push(m), error: () => undefined };
    expect(createEmbeddingProvider({ provider: 'none', model: 'x', dimensions: 1536, fetch })).toBeNull();
    expect(createEmbeddingProvider({ provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536, fetch, logger })).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(createEmbeddingProvider({ provider: 'openai', apiKey: 'k', model: 'text-embedding-3-small', dimensions: 1536, fetch })).toBeInstanceOf(OpenAIEmbeddings);
    expect(createEmbeddingProvider({ provider: 'voyage', apiKey: 'k', model: 'voyage-3', dimensions: 1024, fetch })).toBeInstanceOf(VoyageEmbeddings);
    expect(() => createEmbeddingProvider({ provider: 'openai', apiKey: 'k', model: 'x', dimensions: 0, fetch })).toThrowError(/pozitif/);
  });

  it('shouldEmbed skips promotions, newsletters, low importance and tiny chunks', () => {
    const ok = { sourceType: 'gmail' as const, importance: 'high' as const, category: 'action_required' as const, tokenCount: 120 };
    expect(shouldEmbed(ok)).toBe(true);
    expect(embedSkipReason(ok)).toBeNull();
    expect(embedSkipReason({ ...ok, category: 'promotion' })).toBe('promotion');
    expect(embedSkipReason({ ...ok, isNewsletter: true })).toBe('newsletter');
    expect(embedSkipReason({ ...ok, importance: 'low' })).toBe('low_importance');
    expect(embedSkipReason({ ...ok, tokenCount: EMBEDDING_MIN_TOKENS - 1 })).toBe('too_short');
    expect(shouldEmbed({ sourceType: 'meeting_note', tokenCount: EMBEDDING_MIN_TOKENS })).toBe(true);
    expect(shouldEmbed({ sourceType: 'capture', tokenCount: Number.NaN })).toBe(false);
  });

  it('prepareEmbeddingText strips html and caps length', () => {
    expect(prepareEmbeddingText('<p>Merhaba&nbsp;<b>Yunus</b></p>\n\n\n  Selam ')).toBe('Merhaba Yunus\nSelam');
    const capped = prepareEmbeddingText('kelime '.repeat(20_000), 100);
    expect(capped.length).toBeLessThanOrEqual(400);
    expect(capped.endsWith('kelime')).toBe(true);
  });
});

describe('embeddings · vector math and pgvector', () => {
  it('cosineSimilarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 2])).toThrowError(/eşleşmiyor/);
  });

  it('toPgVectorLiteral / fromPgVectorLiteral round-trip and validation', () => {
    expect(toPgVectorLiteral([0.1, -2, 3e-7])).toBe('[0.1,-2,3e-7]');
    expect(fromPgVectorLiteral('[0.1,-2,3e-7]')).toEqual([0.1, -2, 3e-7]);
    expect(fromPgVectorLiteral(' [ 1 , 2 ] ')).toEqual([1, 2]);
    expect(fromPgVectorLiteral('[]')).toEqual([]);
    expect(() => toPgVectorLiteral([])).toThrowError(/Boş vektör/);
    expect(() => toPgVectorLiteral([1, Number.NaN])).toThrowError(/sonlu/);
    expect(() => fromPgVectorLiteral('1,2')).toThrowError(/Geçersiz/);
    expect(() => fromPgVectorLiteral('[1,x]')).toThrowError(/Geçersiz/);
  });
});
