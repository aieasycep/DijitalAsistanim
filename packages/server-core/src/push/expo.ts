/**
 * Expo push service client: chunked sends, receipt lookups and the ticket/receipt error taxonomy.
 * Only Web APIs; `fetch` is injected. Request-level failures (network, 5xx, 429, bad
 * credentials) throw AppError — per-message problems come back as tickets so one bad token never
 * blocks a batch.
 */
import { AppError } from '../errors';
import type { FetchLike } from '../safefetch/fetch';
import { chunk } from '../util';

export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo accepts at most 100 messages per send request and 1 000 ids per receipt request. */
export const EXPO_PUSH_SEND_CHUNK = 100;
export const EXPO_PUSH_RECEIPT_CHUNK = 1000;
const DEFAULT_TIMEOUT_MS = 20_000;

export type ExpoPushPriority = 'default' | 'normal' | 'high';
export type ExpoInterruptionLevel = 'passive' | 'active' | 'time-sensitive' | 'critical';

export interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  subtitle?: string;
  body?: string;
  data?: Record<string, unknown>;
  ttl?: number;
  expiration?: number;
  priority?: ExpoPushPriority;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  categoryId?: string;
  mutableContent?: boolean;
  interruptionLevel?: ExpoInterruptionLevel;
  _contentAvailable?: boolean;
}

export type ExpoPushErrorCode =
  | 'DeviceNotRegistered'
  | 'MessageTooBig'
  | 'MessageRateExceeded'
  | 'InvalidCredentials'
  | 'MismatchSenderId'
  | 'InvalidProviderToken'
  | 'ExpoPushTokenInvalid';

export interface ExpoPushTicketOk {
  status: 'ok';
  id: string;
}
export interface ExpoPushTicketError {
  status: 'error';
  message: string;
  details?: { error?: ExpoPushErrorCode | string; expoPushToken?: string };
}
export type ExpoPushTicket = ExpoPushTicketOk | ExpoPushTicketError;

export interface ExpoPushReceiptOk {
  status: 'ok';
}
export interface ExpoPushReceiptError {
  status: 'error';
  message: string;
  details?: { error?: ExpoPushErrorCode | string };
}
export type ExpoPushReceipt = ExpoPushReceiptOk | ExpoPushReceiptError;

/** Outcome class of a ticket or receipt. */
export type ExpoOutcome =
  | 'ok'
  | 'device_not_registered'
  | 'message_too_big'
  | 'rate_exceeded'
  | 'invalid_credentials'
  | 'invalid_token'
  | 'unknown_error';

const TOKEN_PATTERN = /^(?:ExponentPushToken|ExpoPushToken)\[[^\]\s]{1,200}\]$/;
const LEGACY_TOKEN_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

/** `ExponentPushToken[…]` / `ExpoPushToken[…]` (or the legacy UUID form). */
export function isExpoPushToken(token: string): boolean {
  const trimmed = token.trim();
  return TOKEN_PATTERN.test(trimmed) || LEGACY_TOKEN_PATTERN.test(trimmed);
}

export function classifyExpoOutcome(result: ExpoPushTicket | ExpoPushReceipt): ExpoOutcome {
  if (result.status === 'ok') return 'ok';
  switch (result.details?.error) {
    case 'DeviceNotRegistered':
      return 'device_not_registered';
    case 'MessageTooBig':
      return 'message_too_big';
    case 'MessageRateExceeded':
      return 'rate_exceeded';
    case 'InvalidCredentials':
    case 'InvalidProviderToken':
    case 'MismatchSenderId':
      return 'invalid_credentials';
    case 'ExpoPushTokenInvalid':
      return 'invalid_token';
    default:
      return 'unknown_error';
  }
}

interface ExpoRequestOptions {
  accessToken?: string | null;
  timeoutMs?: number;
}

const MESSAGES = {
  unavailable: 'Bildirim servisine şu an ulaşılamıyor.',
  timeout: 'Bildirim servisi zamanında yanıt vermedi.',
  credentials: 'Bildirim servisi kimlik bilgilerini kabul etmedi.',
  invalid: 'Bildirim isteği kabul edilmedi.',
  badBody: 'Bildirim servisi yanıtı çözümlenemedi.',
} as const;

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

async function expoPost<T>(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  opts: ExpoRequestOptions,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      const timedOut = controller.signal.aborted || isAbortError(cause);
      throw new AppError(
        'provider_unavailable',
        timedOut ? MESSAGES.timeout : MESSAGES.unavailable,
        {
          details: { reason: timedOut ? 'timeout' : 'network' },
          retryAfterSec: 30,
          cause,
        },
      );
    }
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new AppError('internal', MESSAGES.credentials, {
        details: { status: response.status },
      });
    }
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '');
      throw new AppError('provider_unavailable', MESSAGES.unavailable, {
        details: { status: response.status },
        retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30,
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new AppError('validation', MESSAGES.invalid, { details: { status: response.status } });
    }
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new AppError('internal', MESSAGES.badBody, { cause });
    }
  } finally {
    clearTimeout(timer);
  }
}

interface ExpoSendResponse {
  data?: ExpoPushTicket[];
  errors?: { code?: string; message?: string }[];
}
interface ExpoReceiptsResponse {
  data?: Record<string, ExpoPushReceipt>;
  errors?: { code?: string; message?: string }[];
}

function requestLevelError(
  errors: { code?: string; message?: string }[] | undefined,
): AppError | null {
  const first = errors?.[0];
  if (!first) return null;
  const code = first.code ?? 'UNKNOWN';
  if (
    code === 'PUSH_TOO_MANY_EXPERIENCE_IDS' ||
    code === 'PUSH_TOO_MANY_NOTIFICATIONS' ||
    code === 'VALIDATION_ERROR'
  ) {
    return new AppError('validation', MESSAGES.invalid, { details: { expoCode: code } });
  }
  if (code === 'UNAUTHORIZED' || code === 'INVALID_CREDENTIALS') {
    return new AppError('internal', MESSAGES.credentials, { details: { expoCode: code } });
  }
  return new AppError('provider_unavailable', MESSAGES.unavailable, {
    details: { expoCode: code },
    retryAfterSec: 30,
  });
}

export interface SendExpoPushInput extends ExpoRequestOptions {
  messages: ExpoPushMessage[];
}

/** Send messages in chunks of 100; the returned tickets align with `messages` by index. */
export async function sendExpoPush(
  fetchImpl: FetchLike,
  input: SendExpoPushInput,
): Promise<ExpoPushTicket[]> {
  const tickets: ExpoPushTicket[] = [];
  for (const batch of chunk(input.messages, EXPO_PUSH_SEND_CHUNK)) {
    const response = await expoPost<ExpoSendResponse>(fetchImpl, EXPO_PUSH_SEND_URL, batch, input);
    const error = requestLevelError(response.errors);
    if (error) throw error;
    const data = response.data ?? [];
    for (let i = 0; i < batch.length; i++) {
      tickets.push(data[i] ?? { status: 'error', message: 'Bilet alınamadı.', details: {} });
    }
  }
  return tickets;
}

export interface GetExpoReceiptsInput extends ExpoRequestOptions {
  ticketIds: string[];
}

/** Fetch receipts for ticket ids (chunks of 1 000); ids without a receipt yet are absent. */
export async function getExpoReceipts(
  fetchImpl: FetchLike,
  input: GetExpoReceiptsInput,
): Promise<Record<string, ExpoPushReceipt>> {
  const receipts: Record<string, ExpoPushReceipt> = {};
  for (const ids of chunk(input.ticketIds, EXPO_PUSH_RECEIPT_CHUNK)) {
    const response = await expoPost<ExpoReceiptsResponse>(
      fetchImpl,
      EXPO_PUSH_RECEIPTS_URL,
      { ids },
      input,
    );
    const error = requestLevelError(response.errors);
    if (error) throw error;
    Object.assign(receipts, response.data ?? {});
  }
  return receipts;
}
