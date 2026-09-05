/**
 * SSRF-safe fetch for user-supplied links. Every hop (including redirects) is re-validated,
 * response size is enforced while streaming, and only capture-relevant content types pass.
 *
 * Limits: the optional DNS resolver hook validates the addresses behind a hostname up front, but
 * the runtime's fetch resolves the name again — a rebinding between the two is possible on
 * platforms that cannot pin the address. Treat fetched content as untrusted regardless.
 */
import { AppError } from '../errors';
import {
  validateOutboundUrl,
  validateResolvedAddresses,
  type SafeFetchRejectReason,
  type UrlPolicy,
} from './url';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type DnsResolver = (hostname: string) => Promise<string[]>;

export interface SafeFetchOptions extends UrlPolicy {
  /** Injected fetch (tests use mocks; edge functions may pass the global). Defaults to globalThis.fetch. */
  fetch?: FetchLike;
  /** Optional resolver so IPs behind a public hostname can be validated before connecting. */
  resolve?: DnsResolver;
  /** Whole-operation budget including redirects (default 8 000 ms). */
  timeoutMs?: number;
  /** Max response bytes (default 2 MiB) — enforced on Content-Length and while streaming. */
  maxBytes?: number;
  /** Max redirects followed (default 3). */
  maxRedirects?: number;
  /** MIME types accepted (default text/html, text/plain, application/pdf). */
  allowedContentTypes?: string[];
  userAgent?: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'HEAD';
}

export interface SafeFetchSuccess {
  ok: true;
  /** URL as requested (normalized). */
  url: string;
  /** URL that actually answered after redirects. */
  finalUrl: string;
  status: number;
  contentType: string;
  mimeType: string;
  charset: string | null;
  bytes: Uint8Array;
  /** Decoded text for text/* responses, null for binary. */
  text: string | null;
  redirects: string[];
}

export interface SafeFetchFailure {
  ok: false;
  reason: SafeFetchRejectReason;
  message: string;
  url: string;
  status?: number;
  redirects: string[];
}

export type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure;

export const DEFAULT_SAFE_FETCH_TIMEOUT_MS = 8_000;
export const DEFAULT_SAFE_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_SAFE_FETCH_MAX_REDIRECTS = 3;
export const DEFAULT_ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/pdf',
] as const;
const DEFAULT_USER_AGENT = 'DijitalAsistan-LinkPreview/1.0 (+https://dijitalasistan.app)';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function parseContentType(header: string | null): {
  mimeType: string;
  charset: string | null;
} {
  if (!header) return { mimeType: '', charset: null };
  const [type = '', ...params] = header.split(';');
  let charset: string | null = null;
  for (const p of params) {
    const [k, v] = p.split('=');
    if (k?.trim().toLowerCase() === 'charset' && v)
      charset = v
        .trim()
        .replace(/^["']|["']$/g, '')
        .toLowerCase();
  }
  return { mimeType: type.trim().toLowerCase(), charset };
}

/** Release a body we will not read. Never awaited: tee'd/odd streams may resolve cancel late. */
function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

/** Sniff <meta charset> from the first bytes of an HTML document. */
function sniffHtmlCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const m = /<meta\b[^>]*charset\s*=\s*["']?\s*([A-Za-z0-9_-]+)/i.exec(head);
  return m?.[1]?.toLowerCase() ?? null;
}

function decodeText(bytes: Uint8Array, mimeType: string, charset: string | null): string {
  const label = charset ?? (mimeType === 'text/html' ? sniffHtmlCharset(bytes) : null) ?? 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function readBodyLimited(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const body = response.body;
  if (!body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > maxBytes ? { ok: false } : { ok: true, bytes: buffer };
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: out };
}

/** Fetch a user-supplied URL under the SSRF policy. Never throws for policy/network outcomes. */
export async function safeFetch(
  input: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const fetchImpl: FetchLike = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SAFE_FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_SAFE_FETCH_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_SAFE_FETCH_MAX_REDIRECTS;
  const allowedTypes = (opts.allowedContentTypes ?? [...DEFAULT_ALLOWED_CONTENT_TYPES]).map((t) =>
    t.toLowerCase(),
  );
  const policy: UrlPolicy = {
    allowedPorts: opts.allowedPorts,
    blockedHostSuffixes: opts.blockedHostSuffixes,
  };
  const redirects: string[] = [];

  const initial = validateOutboundUrl(input, policy);
  if (!initial.ok)
    return { ok: false, reason: initial.reason, message: initial.message, url: input, redirects };
  const requestedUrl = initial.url.href;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fail = (
    reason: SafeFetchRejectReason,
    message: string,
    status?: number,
  ): SafeFetchFailure => ({
    ok: false,
    reason,
    message,
    url: requestedUrl,
    ...(status !== undefined ? { status } : {}),
    redirects,
  });

  try {
    let current = initial;
    let method: 'GET' | 'HEAD' = opts.method ?? 'GET';

    for (let hop = 0; ; hop++) {
      if (!current.isIpLiteral && opts.resolve) {
        let addresses: string[];
        try {
          addresses = await opts.resolve(current.hostname);
        } catch {
          return fail('dns_failed', 'Adres çözümlenemedi.');
        }
        const resolved = validateResolvedAddresses(addresses);
        if (!resolved.ok) return fail(resolved.reason, resolved.message);
      }

      let response: Response;
      try {
        response = await fetchImpl(current.url.href, {
          method,
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': opts.userAgent ?? DEFAULT_USER_AGENT,
            accept: allowedTypes.join(', '),
            'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7',
            ...(opts.headers ?? {}),
          },
        });
      } catch (e) {
        if (isAbortError(e) || controller.signal.aborted)
          return fail('timeout', 'Sayfa zamanında yanıt vermedi.');
        return fail('network_error', 'Sayfaya ulaşılamadı.');
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        discardBody(response);
        if (!location)
          return fail('redirect_missing_location', 'Yönlendirme hedefi eksik.', response.status);
        if (hop >= maxRedirects)
          return fail('too_many_redirects', 'Çok fazla yönlendirme var.', response.status);
        let target: URL;
        try {
          target = new URL(location, current.url);
        } catch {
          return fail('invalid_url', 'Yönlendirme hedefi geçersiz.', response.status);
        }
        const next = validateOutboundUrl(target, policy);
        if (!next.ok) return fail(next.reason, next.message, response.status);
        redirects.push(next.url.href);
        if (response.status === 303) method = 'GET';
        current = next;
        continue;
      }

      if (!response.ok) {
        discardBody(response);
        return fail('http_error', 'Sayfa yanıt vermedi.', response.status);
      }

      const { mimeType, charset } = parseContentType(response.headers.get('content-type'));
      if (!allowedTypes.includes(mimeType)) {
        discardBody(response);
        return fail('unsupported_content_type', 'Bu içerik türü desteklenmiyor.', response.status);
      }

      const declaredLength = Number(response.headers.get('content-length') ?? '');
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        discardBody(response);
        return fail('too_large', 'Sayfa çok büyük.', response.status);
      }

      if (method === 'HEAD') {
        return {
          ok: true,
          url: requestedUrl,
          finalUrl: current.url.href,
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          mimeType,
          charset,
          bytes: new Uint8Array(0),
          text: null,
          redirects,
        };
      }

      let body: Awaited<ReturnType<typeof readBodyLimited>>;
      try {
        body = await readBodyLimited(response, maxBytes);
      } catch (e) {
        if (isAbortError(e) || controller.signal.aborted)
          return fail('timeout', 'Sayfa zamanında yanıt vermedi.');
        return fail('network_error', 'Sayfa okunamadı.');
      }
      if (!body.ok) return fail('too_large', 'Sayfa çok büyük.', response.status);

      return {
        ok: true,
        url: requestedUrl,
        finalUrl: current.url.href,
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        mimeType,
        charset,
        bytes: body.bytes,
        text: mimeType.startsWith('text/') ? decodeText(body.bytes, mimeType, charset) : null,
        redirects,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** `safeFetch` that throws an AppError instead of returning a failure result. */
export async function safeFetchOrThrow(
  input: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchSuccess> {
  const result = await safeFetch(input, opts);
  if (result.ok) return result;
  throw safeFetchError(result);
}

export function safeFetchError(failure: SafeFetchFailure): AppError {
  const details = {
    reason: failure.reason,
    ...(failure.status !== undefined ? { status: failure.status } : {}),
  };
  switch (failure.reason) {
    case 'timeout':
    case 'network_error':
    case 'http_error':
    case 'dns_failed':
      return new AppError('provider_unavailable', failure.message, { details });
    default:
      return new AppError('validation', failure.message, { details });
  }
}
