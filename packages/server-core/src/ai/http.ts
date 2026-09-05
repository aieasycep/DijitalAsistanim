/** Shared JSON POST helper for provider adapters (timeouts, network errors, status mapping). */
import { AiProviderError, parseRetryAfterSec } from './providerError';
import type { AiFetch, AiProviderName } from './types';

export interface JsonPostResult {
  status: number;
  json: unknown;
  text: string;
  headers: Headers;
}

export interface JsonPostInput {
  fetch: AiFetch;
  provider: AiProviderName;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
}

export async function postJson(input: JsonPostInput): Promise<JsonPostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  let response: Response;
  try {
    response = await input.fetch(input.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...input.headers },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new AiProviderError(input.provider, 'timeout', 'Sağlayıcı zaman aşımına uğradı.', { cause });
    }
    throw new AiProviderError(input.provider, 'network', 'Sağlayıcıya ulaşılamadı.', { cause });
  }
  let text = '';
  try {
    text = await response.text();
  } catch (cause) {
    clearTimeout(timer);
    throw new AiProviderError(input.provider, 'network', 'Sağlayıcı yanıtı okunamadı.', { cause });
  } finally {
    clearTimeout(timer);
  }
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text, headers: response.headers };
}

/** Extract a provider error message without leaking request content. */
export function providerErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const error = (json as { error?: unknown }).error;
  if (!error) return null;
  if (typeof error === 'string') return error.slice(0, 200);
  if (typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message.slice(0, 200);
  }
  return null;
}

export function httpError(provider: AiProviderName, result: JsonPostResult, now: number = Date.now()): AiProviderError {
  const detail = providerErrorMessage(result.json);
  const message = detail ? `${provider} ${result.status}: ${detail}` : `${provider} HTTP ${result.status}`;
  return new AiProviderError(provider, 'http', message, {
    status: result.status,
    retryAfterSec: parseRetryAfterSec(result.headers.get('retry-after'), now),
  });
}
