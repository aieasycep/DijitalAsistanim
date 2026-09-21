/**
 * Typed Edge Function client. Every call goes through the EDGE_FUNCTIONS catalogue (name → method + contract):
 * GET requests serialise the input as a query string, POST requests send JSON (or multipart when the input is
 * a FormData). Responses follow the server `ApiResult<T>` envelope `{ ok: true, data } | { ok: false, error }`.
 */
import {
  EDGE_FUNCTIONS,
  type ApiError,
  type EdgeFunctionName,
  type EdgeFunctionRequest,
  type EdgeFunctionResponse,
} from '@da/domain';
import { ClientApiError } from '../errors';
import { buildQuery } from './url';

export const DEFAULT_TIMEOUT_MS = 20_000;
/** AI-backed endpoints (model round-trips) get a longer budget. */
export const AI_TIMEOUT_MS = 60_000;
const AI_FUNCTIONS: ReadonlySet<EdgeFunctionName> = new Set<EdgeFunctionName>([
  'assistant-ask',
  'briefing',
  'meeting-prep',
  'capture-analyze',
  'email-draft-reply',
]);
const DEFAULT_RETRY_DELAY_MS = 300;

export interface CallOptions {
  /** Caller-owned abort signal (screen unmounted, user cancelled). */
  signal?: AbortSignal;
  /** Overrides the per-function default timeout. */
  timeoutMs?: number;
}

export interface FunctionsClient {
  call<N extends EdgeFunctionName>(
    name: N,
    input: EdgeFunctionRequest<N>,
    options?: CallOptions,
  ): Promise<EdgeFunctionResponse<N>>;
}

export interface FunctionsClientOptions {
  /** `${supabaseUrl}/functions/v1` unless configured otherwise. */
  baseUrl: string;
  anonKey: string;
  fetch: typeof fetch;
  getAccessToken(): Promise<string | null>;
  /** Delay before the single GET retry (tests set 0). */
  retryDelayMs?: number;
}

const KNOWN_CODES: ReadonlySet<string> = new Set<ApiError['code']>([
  'unauthorized',
  'forbidden',
  'not_found',
  'validation',
  'rate_limited',
  'quota_exceeded',
  'provider_unavailable',
  'oauth_expired',
  'scope_required',
  'ai_unavailable',
  'conflict',
  'offline',
  'internal',
]);

export function timeoutFor(name: EdgeFunctionName): number {
  return AI_FUNCTIONS.has(name) ? AI_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

export function createFunctionsClient(options: FunctionsClientOptions): FunctionsClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  async function call<N extends EdgeFunctionName>(
    name: N,
    input: EdgeFunctionRequest<N>,
    callOptions?: CallOptions,
  ): Promise<EdgeFunctionResponse<N>> {
    const contract = EDGE_FUNCTIONS[name];
    const token = await options.getAccessToken();
    if (!token) {
      throw new ClientApiError({
        code: 'unauthorized',
        message: 'Oturum bulunamadı. Lütfen tekrar giriş yap.',
      });
    }
    const isGet = contract.method === 'GET';
    const timeoutMs = callOptions?.timeoutMs ?? timeoutFor(name);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      apikey: options.anonKey,
      Accept: 'application/json',
    };
    let url = `${base}/${name}`;
    let body: BodyInit | undefined;
    if (isGet) {
      const query = buildQuery(asRecord(input));
      if (query) url += `?${query}`;
    } else if (typeof FormData !== 'undefined' && input instanceof FormData) {
      body = input; // fetch sets the multipart boundary itself
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(input ?? {});
    }

    const attempts = isGet ? 2 : 1;
    let lastError: ClientApiError | null = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await request<EdgeFunctionResponse<N>>({
          url,
          method: contract.method,
          headers,
          body,
          timeoutMs,
          signal: callOptions?.signal,
          fetch: options.fetch,
        });
      } catch (e) {
        const err = toClientError(e);
        const canRetry =
          isGet && attempt < attempts - 1 && isRetryable(err) && !callOptions?.signal?.aborted;
        if (!canRetry) throw err;
        lastError = err;
        if (retryDelayMs > 0) await delay(retryDelayMs);
      }
    }
    throw lastError ?? new ClientApiError({ code: 'internal', message: 'Bir şeyler ters gitti.' });
  }

  return { call };
}

interface RequestInput {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body: BodyInit | undefined;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  fetch: typeof fetch;
}

async function request<T>(input: RequestInput): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  const onExternalAbort = (): void => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) onExternalAbort();
    else input.signal.addEventListener('abort', onExternalAbort);
  }
  try {
    let response: Response;
    try {
      response = await input.fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        signal: controller.signal,
      });
    } catch (e) {
      if (timedOut) {
        throw new ClientApiError({
          code: 'offline',
          message: 'Sunucu yanıt vermedi. Bağlantını kontrol et.',
          details: { reason: 'timeout' },
        });
      }
      if (input.signal?.aborted || isAbortError(e)) {
        throw new ClientApiError({
          code: 'internal',
          message: 'İstek iptal edildi.',
          details: { reason: 'aborted' },
        });
      }
      throw new ClientApiError({
        code: 'offline',
        message: 'Çevrimdışısın.',
        details: { reason: 'network' },
      });
    }
    return await parseResponse<T>(response);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onExternalAbort);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const envelope = asEnvelope(json);
  if (envelope) {
    if (envelope.ok) return envelope.data as T;
    throw new ClientApiError(normalizeApiError(envelope.error), response.status);
  }
  if (!response.ok) throw errorForStatus(response);
  if (json !== null) return json as T;
  throw new ClientApiError(
    { code: 'internal', message: 'Sunucu beklenmeyen bir yanıt döndürdü.' },
    response.status,
  );
}

type Envelope = { ok: true; data: unknown } | { ok: false; error: unknown };

function asEnvelope(value: unknown): Envelope | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return null;
  const ok = (value as { ok: unknown }).ok;
  if (ok === true) return { ok: true, data: (value as { data?: unknown }).data };
  if (ok === false) return { ok: false, error: (value as { error?: unknown }).error };
  return null;
}

export function normalizeApiError(raw: unknown): ApiError {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const code =
    typeof obj.code === 'string' && KNOWN_CODES.has(obj.code)
      ? (obj.code as ApiError['code'])
      : 'internal';
  const message =
    typeof obj.message === 'string' && obj.message ? obj.message : 'Bir şeyler ters gitti.';
  const out: ApiError = { code, message };
  if (typeof obj.details === 'object' && obj.details !== null)
    out.details = obj.details as Record<string, unknown>;
  if (typeof obj.retryAfterSec === 'number') out.retryAfterSec = obj.retryAfterSec;
  if (typeof obj.requiredScope === 'string') out.requiredScope = obj.requiredScope;
  return out;
}

function errorForStatus(response: Response): ClientApiError {
  const status = response.status;
  const retryAfterHeader = Number(response.headers.get('retry-after') ?? '');
  const retryAfterSec =
    Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined;
  switch (status) {
    case 401:
      return new ClientApiError(
        { code: 'unauthorized', message: 'Oturumun sona erdi. Lütfen tekrar giriş yap.' },
        status,
      );
    case 402:
      return new ClientApiError({ code: 'quota_exceeded', message: 'Günlük kota doldu.' }, status);
    case 403:
      return new ClientApiError(
        { code: 'forbidden', message: 'Bu işlem için yetkin yok.' },
        status,
      );
    case 404:
      return new ClientApiError({ code: 'not_found', message: 'Kayıt bulunamadı.' }, status);
    case 409:
      return new ClientApiError({ code: 'conflict', message: 'Kayıt bu arada değişti.' }, status);
    case 400:
    case 422:
      return new ClientApiError({ code: 'validation', message: 'İstek geçersiz.' }, status);
    case 429:
      return new ClientApiError(
        {
          code: 'rate_limited',
          message: 'Çok fazla istek gönderildi. Biraz sonra tekrar dene.',
          retryAfterSec,
        },
        status,
      );
    default:
      return new ClientApiError(
        { code: 'internal', message: 'Sunucu şu anda yanıt veremiyor.' },
        status,
      );
  }
}

function isRetryable(err: ClientApiError): boolean {
  if (err.code === 'offline') return err.details?.reason !== 'aborted';
  return err.status === 502 || err.status === 503 || err.status === 504;
}

function toClientError(e: unknown): ClientApiError {
  if (e instanceof ClientApiError) return e;
  if (isAbortError(e))
    return new ClientApiError({
      code: 'internal',
      message: 'İstek iptal edildi.',
      details: { reason: 'aborted' },
    });
  if (e instanceof TypeError)
    return new ClientApiError({
      code: 'offline',
      message: 'Çevrimdışısın.',
      details: { reason: 'network' },
    });
  return ClientApiError.from(e);
}

function isAbortError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'name' in e &&
    (e as { name: unknown }).name === 'AbortError'
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
