import type { PushToken } from '@da/domain';
import { describe, expect, it } from 'vitest';
import { isAppError } from '../errors';
import type { NotificationPayload } from '../notifications';
import type { FetchLike } from '../safefetch/fetch';
import {
  EXPO_PUSH_SEND_URL,
  classifyExpoOutcome,
  getExpoReceipts,
  isExpoPushToken,
  planDeliveries,
  sendExpoPush,
  summarizeReceipts,
  summarizeTickets,
  toExpoMessage,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from './index';

const NOW = '2026-09-05T08:00:00.000Z';

function payload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    category: 'meeting',
    locale: 'tr',
    title: 'Toplantı',
    body: '14:00 toplantına 30 dakika kaldı.',
    deepLink: 'da://meeting/evt-1/prep',
    dedupeKey: 'meeting:evt-1:2026-09-05',
    data: { category: 'meeting', deepLink: 'da://meeting/evt-1/prep', entityId: 'evt-1' },
    ios: { interruptionLevel: 'active', threadId: 'meeting', relevanceScore: 0.9 },
    android: { channelId: 'da_meeting', priority: 'high' },
    collapseId: 'meeting:evt-1:2026-09-05',
    ...overrides,
  };
}

function token(id: string, overrides: Partial<PushToken> = {}): PushToken {
  return {
    id,
    userId: 'user-1',
    token: `ExponentPushToken[${id}]`,
    platform: 'ios',
    deviceId: `device-${id}`,
    isActive: true,
    lastSeenAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function stubFetch(handler: (url: string, body: unknown, init: RequestInit) => Response) {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const body: unknown = JSON.parse(String(init.body));
    calls.push({ url, body, headers: (init.headers ?? {}) as Record<string, string> });
    return handler(url, body, init);
  };
  return { fetch, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('push/expo', () => {
  it('validates Expo push tokens', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc-DEF_123]')).toBe(true);
    expect(isExpoPushToken('6c2c1b1e-1b2a-4c3d-8e9f-0a1b2c3d4e5f')).toBe(true);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken('fcm:abcdef')).toBe(false);
    expect(isExpoPushToken('')).toBe(false);
  });

  it('chunks sends by 100 and aligns tickets with messages', async () => {
    const messages: ExpoPushMessage[] = Array.from({ length: 250 }, (_, i) => ({
      to: `ExponentPushToken[t${i}]`,
      title: 'x',
    }));
    const { fetch, calls } = stubFetch((_url, body) => {
      const batch = body as ExpoPushMessage[];
      return json({
        data: batch.map((m, i) =>
          i === 0
            ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
            : { status: 'ok', id: `ticket-${m.to}` },
        ),
      });
    });
    const tickets = await sendExpoPush(fetch, { messages, accessToken: 'expo-secret' });
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => (c.body as unknown[]).length)).toEqual([100, 100, 50]);
    expect(calls[0]?.url).toBe(EXPO_PUSH_SEND_URL);
    expect(calls[0]?.headers.authorization).toBe('Bearer expo-secret');
    expect(tickets).toHaveLength(250);
    expect(tickets[0]?.status).toBe('error');
    expect(tickets[1]).toEqual({ status: 'ok', id: 'ticket-ExponentPushToken[t1]' });
    expect(tickets[100]?.status).toBe('error');
    expect(tickets[249]).toEqual({ status: 'ok', id: 'ticket-ExponentPushToken[t249]' });
  });

  it('omits the bearer header without a token and maps request-level failures', async () => {
    const { fetch, calls } = stubFetch(() => json({ data: [{ status: 'ok', id: 't' }] }));
    await sendExpoPush(fetch, { messages: [{ to: 'ExponentPushToken[a]' }] });
    expect(calls[0]?.headers.authorization).toBeUndefined();

    const throttled = stubFetch(
      () => new Response('{}', { status: 429, headers: { 'retry-after': '12' } }),
    );
    const rateError = await sendExpoPush(throttled.fetch, {
      messages: [{ to: 'ExponentPushToken[a]' }],
    }).catch((e: unknown) => e);
    expect(isAppError(rateError) && rateError.code).toBe('provider_unavailable');
    expect(isAppError(rateError) && rateError.retryAfterSec).toBe(12);

    const unauthorized = stubFetch(() =>
      json({ errors: [{ code: 'UNAUTHORIZED', message: 'bad token' }] }, 401),
    );
    const authError = await sendExpoPush(unauthorized.fetch, {
      messages: [{ to: 'ExponentPushToken[a]' }],
    }).catch((e: unknown) => e);
    expect(isAppError(authError) && authError.code).toBe('internal');

    const invalid = stubFetch(() => json({ errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS' }] }));
    const validationError = await sendExpoPush(invalid.fetch, {
      messages: [{ to: 'ExponentPushToken[a]' }],
    }).catch((e: unknown) => e);
    expect(isAppError(validationError) && validationError.code).toBe('validation');
  });

  it('fetches receipts in one call per 1 000 ids', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `ticket-${i}`);
    const { fetch, calls } = stubFetch((_url, body) => {
      const requested = (body as { ids: string[] }).ids;
      return json({
        data: Object.fromEntries(
          requested.map((id) => [
            id,
            id === 'ticket-5'
              ? { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } }
              : { status: 'ok' },
          ]),
        ),
      });
    });
    const receipts = await getExpoReceipts(fetch, { ticketIds: ids });
    expect(calls.map((c) => (c.body as { ids: string[] }).ids.length)).toEqual([1000, 200]);
    expect(Object.keys(receipts)).toHaveLength(1200);
    expect(classifyExpoOutcome(receipts['ticket-5'] as ExpoPushTicket)).toBe(
      'device_not_registered',
    );
    expect(
      classifyExpoOutcome({
        status: 'error',
        message: 'x',
        details: { error: 'MessageRateExceeded' },
      }),
    ).toBe('rate_exceeded');
    expect(
      classifyExpoOutcome({
        status: 'error',
        message: 'x',
        details: { error: 'InvalidCredentials' },
      }),
    ).toBe('invalid_credentials');
    expect(classifyExpoOutcome({ status: 'error', message: 'x' })).toBe('unknown_error');
  });
});

describe('push/messages', () => {
  it('maps payloads to Expo messages with priority, ttl and ids-only data', () => {
    const message = toExpoMessage('ExponentPushToken[abc]', payload(), { badge: 2.4 });
    expect(message).toEqual({
      to: 'ExponentPushToken[abc]',
      title: 'Toplantı',
      body: '14:00 toplantına 30 dakika kaldı.',
      data: {
        category: 'meeting',
        deepLink: 'da://meeting/evt-1/prep',
        entityId: 'evt-1',
        dedupeKey: 'meeting:evt-1:2026-09-05',
        collapseId: 'meeting:evt-1:2026-09-05',
        threadId: 'meeting',
      },
      ttl: 900,
      priority: 'high',
      sound: 'default',
      channelId: 'da_meeting',
      categoryId: 'meeting',
      interruptionLevel: 'active',
      mutableContent: false,
      badge: 2,
    });
    const weekly = toExpoMessage(
      'ExponentPushToken[abc]',
      payload({
        category: 'weekly',
        android: { channelId: 'da_weekly', priority: 'default' },
        ios: { interruptionLevel: 'passive', threadId: 'weekly', relevanceScore: 0.3 },
      }),
      {
        channelId: 'custom',
        interruptionLevel: 'time-sensitive',
        collapseId: 'weekly:1',
        sound: null,
        ttlSeconds: 60,
      },
    );
    expect(weekly.priority).toBe('normal');
    expect(weekly.ttl).toBe(60);
    expect(weekly.channelId).toBe('custom');
    expect(weekly.interruptionLevel).toBe('time-sensitive');
    expect(weekly.sound).toBeNull();
    expect(weekly.data?.collapseId).toBe('weekly:1');
    expect(weekly.badge).toBeUndefined();
  });
});

describe('push/deliveries', () => {
  it('plans deliveries and records skip reasons', () => {
    const tokens = [
      token('a'),
      token('b', { isActive: false }),
      token('c', { token: 'not-a-token' }),
      token('d', { token: 'ExponentPushToken[a]' }),
      token('e', { platform: 'web' }),
      token('f', { platform: 'android', token: 'ExpoPushToken[f]' }),
    ];
    const plan = planDeliveries({
      tokens,
      payload: payload(),
      alreadySent: new Set(['meeting:evt-1:2026-09-05:f']),
    });
    expect(plan.dedupeKey).toBe('meeting:evt-1:2026-09-05');
    expect(plan.deliveries.map((d) => d.token.id)).toEqual(['a']);
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0]?.to).toBe('ExponentPushToken[a]');
    expect(plan.skipped).toEqual([
      { tokenId: 'b', reason: 'inactive' },
      { tokenId: 'c', reason: 'invalid_token' },
      { tokenId: 'd', reason: 'duplicate_token' },
      { tokenId: 'e', reason: 'unsupported_platform' },
      { tokenId: 'f', reason: 'already_sent' },
    ]);
    const sent = planDeliveries({
      tokens: [token('a')],
      payload: payload(),
      alreadySent: new Set(['meeting:evt-1:2026-09-05']),
    });
    expect(sent.messages).toEqual([]);
    expect(sent.skipped).toEqual([{ tokenId: 'a', reason: 'already_sent' }]);
  });

  it('summarises tickets into delivered / disable / retry / failed buckets', () => {
    const tokens = [token('a'), token('b'), token('c'), token('d'), token('e')];
    const tickets: ExpoPushTicket[] = [
      { status: 'ok', id: 'ticket-a' },
      { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
      { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
    ];
    const summary = summarizeTickets(tickets, tokens);
    expect(summary.delivered).toEqual(['a']);
    expect(summary.toDisable).toEqual(['b']);
    expect(summary.retry).toEqual(['c', 'e']);
    expect(summary.failed).toEqual([
      { tokenId: 'd', outcome: 'message_too_big', message: 'too big' },
    ]);
    expect(summary.ticketIds).toEqual({ a: 'ticket-a' });

    const receipts = summarizeReceipts(
      {
        'ticket-a': { status: 'ok' },
        'ticket-b': { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
      },
      { 'ticket-a': 'a', 'ticket-b': 'b', 'ticket-missing': 'z' },
    );
    expect(receipts.delivered).toEqual(['a']);
    expect(receipts.toDisable).toEqual(['b']);
    expect(receipts.retry).toEqual([]);
  });
});
