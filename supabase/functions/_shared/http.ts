/**
 * HTTP helpers: CORS, JSON envelope `{ ok, data } | { ok, error }`, error mapping, request parsing.
 */
import type { ApiError, ApiResult } from '@da/domain';
import { z } from 'zod';
import { AppError, toAppError } from '@da/server-core/errors';
import { log } from './log.ts';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-internal-secret, x-device-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function json<T>(data: T, init: ResponseInit = {}): Response {
  const body: ApiResult<T> = { ok: true, data };
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(e: unknown, requestId?: string): Response {
  const err = toAppError(e);
  const api: ApiError = err.toApiError();
  if (err.code === 'internal') {
    log.error('unhandled error', {
      requestId,
      message: err.message,
      cause: err.cause instanceof Error ? err.cause.message : undefined,
    });
    api.message = 'Bir şeyler ters gitti.';
  }
  const body: ApiResult<never> = { ok: false, error: api };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
  };
  if (err.retryAfterSec) headers['Retry-After'] = String(err.retryAfterSec);
  return new Response(JSON.stringify(body), { status: err.status, headers });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  return null;
}

export function assertMethod(req: Request, ...methods: string[]): void {
  if (!methods.includes(req.method)) {
    throw new AppError('validation', `Yöntem desteklenmiyor: ${req.method}`, { status: 405 });
  }
}

/** Parse & validate a JSON body (POST) or query params (GET) with a zod schema. */
export async function parseInput<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const obj: Record<string, unknown> = {};
    url.searchParams.forEach((v, k) => {
      if (v === 'true') obj[k] = true;
      else if (v === 'false') obj[k] = false;
      else if (/^-?\d+$/.test(v) && k !== 'code' && k !== 'state') obj[k] = Number(v);
      else obj[k] = v;
    });
    raw = obj;
  } else {
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      try {
        raw = await req.json();
      } catch {
        throw new AppError('validation', 'Geçersiz JSON gövdesi.');
      }
    } else {
      raw = {};
    }
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError('validation', 'İstek doğrulanamadı.', {
      details: {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  return result.data as z.output<S>;
}

export function requestId(req: Request): string {
  return req.headers.get('x-request-id') ?? crypto.randomUUID();
}

export function clientIp(req: Request): string | undefined {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    undefined
  );
}

/** Standard wrapper: CORS preflight, error envelope, request id. */
export function handler(
  fn: (req: Request, ctx: { requestId: string }) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    const id = requestId(req);
    try {
      return await fn(req, { requestId: id });
    } catch (e) {
      return errorResponse(e, id);
    }
  };
}

export const emptySchema = z.object({}).passthrough();
export const uuidParam = z.string().uuid();
