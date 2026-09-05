import { describe, expect, it } from 'vitest';
import { ANALYTICS_FORBIDDEN_KEYS } from '@da/domain';
import { sha256Hex } from '../crypto';
import { ANALYTICS_EVENT_NAMES, MemorySink, NoopSink, PostHogSink, hashDistinctId, sanitizeAnalyticsEvent } from './index';

describe('analytics · sanitizeAnalyticsEvent', () => {
  it('accepts only catalogued event names', () => {
    expect(ANALYTICS_EVENT_NAMES).toContain('assistant_query');
    expect(sanitizeAnalyticsEvent('email_opened', {})).toEqual({ ok: false, reason: 'unknown_event' });
    expect(sanitizeAnalyticsEvent('toString', {})).toEqual({ ok: false, reason: 'unknown_event' });
    expect(sanitizeAnalyticsEvent('paywall_viewed', { context: 'meeting_prep' })).toMatchObject({ ok: true, name: 'paywall_viewed', props: { context: 'meeting_prep' } });
  });

  it('drops forbidden keys, e-mail addresses, long strings and non-primitive values', () => {
    const r = sanitizeAnalyticsEvent('insight_opened', {
      kind: 'deadline',
      badge: 'urgent',
      Subject: 'Re: Revize teklif',
      body: 'Merhaba Ahmet Bey',
      sender: 'ahmet@musteri.com',
      snippet: 'x',
      note: 'a'.repeat(81),
      nested: { deep: true },
      list: [1, 2],
      ratio: Number.NaN,
      count: 3,
      edited: false,
      emailsFound: 12,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.props).toEqual({ kind: 'deadline', badge: 'urgent', count: 3, edited: false, emailsFound: 12 });
    const droppedKeys = r.dropped.map((d) => d.key).sort();
    expect(droppedKeys).toEqual(['Subject', 'body', 'list', 'nested', 'note', 'ratio', 'sender', 'snippet'].sort());
    expect(r.dropped.find((d) => d.key === 'sender')?.reason).toBe('email');
    expect(r.dropped.find((d) => d.key === 'note')?.reason).toBe('too_long');
    for (const key of ANALYTICS_FORBIDDEN_KEYS) {
      const s = sanitizeAnalyticsEvent('insight_opened', { [key]: 'value' });
      expect(s.ok && Object.keys(s.props)).toEqual([]);
    }
  });

  it('treats null props as empty and rejects arrays', () => {
    expect(sanitizeAnalyticsEvent('onboarding_started', null)).toMatchObject({ ok: true, props: {} });
    expect(sanitizeAnalyticsEvent('onboarding_started', [1])).toEqual({ ok: false, reason: 'invalid_props' });
    expect(sanitizeAnalyticsEvent('onboarding_started', 'ios')).toEqual({ ok: false, reason: 'invalid_props' });
  });
});

describe('analytics · sinks', () => {
  it('hashes user ids and falls back to anonymous', async () => {
    expect(await hashDistinctId('u1')).toBe(await sha256Hex('u1'));
    expect(await hashDistinctId('u1')).not.toContain('u1');
    expect(await hashDistinctId(null)).toBe('anonymous');
    expect(await hashDistinctId('  ')).toBe('anonymous');
  });

  it('NoopSink resolves and MemorySink stores sanitized events', async () => {
    await expect(new NoopSink().capture()).resolves.toBeUndefined();
    const mem = new MemorySink();
    await mem.capture({ name: 'referral_shared', props: { channel: 'whatsapp' }, userId: 'u1' });
    await mem.capture({ name: 'not_an_event' as 'referral_shared', props: { channel: 'copy' } });
    expect(mem.events).toHaveLength(1);
    expect(mem.events[0]).toMatchObject({ name: 'referral_shared', props: { channel: 'whatsapp' }, distinctId: await sha256Hex('u1') });
    expect(mem.rejected).toEqual([{ name: 'not_an_event', reason: 'unknown_event' }]);
  });

  it('PostHogSink posts a scrubbed payload with a hashed distinct id and never throws', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchOk = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response('{}', { status: 200 });
    };
    const sink = new PostHogSink(fetchOk, { host: 'https://eu.i.posthog.com/', apiKey: 'phc_test', now: () => '2026-09-05T08:00:00.000Z' });
    await sink.capture({ name: 'action_approved', props: { actionType: 'email_send', edited: true }, userId: 'u1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://eu.i.posthog.com/capture/');
    expect(calls[0]?.body).toEqual({
      api_key: 'phc_test',
      event: 'action_approved',
      distinct_id: await sha256Hex('u1'),
      timestamp: '2026-09-05T08:00:00.000Z',
      properties: { actionType: 'email_send', edited: true, $lib: 'da-server-core', $process_person_profile: false },
    });
    expect(sink.sent).toBe(1);

    await sink.capture({ name: 'unknown' as 'action_approved', props: { actionType: 'x', edited: false } });
    expect(calls).toHaveLength(1);

    const failing = new PostHogSink(
      async () => {
        throw new Error('network down');
      },
      { host: 'https://eu.i.posthog.com', apiKey: 'phc_test' },
    );
    await expect(failing.capture({ name: 'trial_started', props: { productId: 'da_pro_monthly' }, userId: 'u1' })).resolves.toBeUndefined();
    expect(failing.failures).toBe(1);

    const rejected = new PostHogSink(async () => new Response('nope', { status: 401 }), { host: 'https://eu.i.posthog.com', apiKey: 'phc_test' });
    await rejected.capture({ name: 'trial_started', props: { productId: 'da_pro_monthly' } });
    expect(rejected.failures).toBe(1);
    expect(rejected.lastStatus).toBe(401);

    let called = false;
    const disabled = new PostHogSink(
      async () => {
        called = true;
        return new Response('{}');
      },
      { host: 'https://eu.i.posthog.com', apiKey: '' },
    );
    await disabled.capture({ name: 'trial_started', props: { productId: 'da_pro_monthly' } });
    expect(disabled.enabled).toBe(false);
    expect(called).toBe(false);
  });
});
