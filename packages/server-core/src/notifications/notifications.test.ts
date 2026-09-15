import { describe, expect, it } from 'vitest';
import type { BriefingSchedule, NotificationCategory } from '@da/domain';
import { NOTIFICATION_CATEGORIES } from '@da/domain';
import {
  applyLockScreenPrivacy,
  buildApprovalNotification,
  buildCriticalEmailNotification,
  buildDeadlineNotification,
  buildEveningNotification,
  buildFollowUpNotification,
  buildGenericNotification,
  buildLifeEventNotification,
  buildMeetingNotification,
  buildMiddayNotification,
  buildMorningNotification,
  buildReminderNotification,
  buildWeeklyNotification,
  computeMiddayDelta,
  dueBriefings,
  isQuietHours,
  nextQuietHoursEnd,
  pushDedupeKey,
  shouldSend,
  type NotificationPrefsInput,
} from './index';

const now = '2026-09-04T05:42:00.000Z'; // Friday 08:42 Istanbul
const tz = 'Europe/Istanbul';
const ctx = { timezone: tz, now };

function prefs(
  partial: Partial<NotificationPrefsInput> & { off?: NotificationCategory[] } = {},
): NotificationPrefsInput {
  const categories = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((c) => [c, !(partial.off ?? []).includes(c)]),
  ) as Record<NotificationCategory, boolean>;
  const { off: _off, ...rest } = partial;
  return {
    categories,
    onlyWhenImportant: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    ...rest,
  };
}

describe('notifications · builders', () => {
  it('morning / midday / evening / weekly carry briefing deep links and Turkish copy', () => {
    const m = buildMorningNotification({ count: 5, briefingId: 'b1' }, ctx);
    expect(m).toMatchObject({
      category: 'morning',
      title: 'Sabah brifingi',
      body: '☀️ Günaydın. Bugün bilmen gereken 5 şey var.',
      deepLink: '/briefing/morning?id=b1',
      dedupeKey: 'morning:b1:2026-09-04',
      collapseId: 'morning:b1:2026-09-04',
      data: { category: 'morning', deepLink: '/briefing/morning?id=b1', entityId: 'b1' },
      ios: { interruptionLevel: 'active', threadId: 'morning' },
      android: { channelId: 'da_morning', priority: 'default' },
    });
    expect(buildMorningNotification({ count: 0 }, ctx).body).toBe(
      '☀️ Günaydın. Bugün sakin bir gün.',
    );
    expect(buildMorningNotification({ count: 3 }, { ...ctx, locale: 'en' }).body).toBe(
      '☀️ Good morning. 3 things to know today.',
    );
    expect(buildMiddayNotification({ count: 2, briefingId: 'b2' }, ctx).body).toBe(
      'Sabahından beri 2 önemli gelişme oldu.',
    );
    expect(buildEveningNotification({ count: 4, briefingId: 'b3' }, ctx).body).toBe(
      'Bugünden yarına kalan 4 konu var.',
    );
    expect(
      buildWeeklyNotification({ important: 7, timeSavedMinutes: 168, briefingId: 'b4' }, ctx).body,
    ).toBe('Haftalık özetin hazır: 7 önemli konu, 2 saat 48 dakika kazandın.');
    expect(
      buildWeeklyNotification({ important: 7, timeSavedMinutes: 168 }, { ...ctx, locale: 'en' })
        .body,
    ).toBe('Your weekly review is ready: 7 important topics, 2 hours 48 minutes saved.');
  });

  it('critical e-mail uses a proper Turkish deadline phrase and never includes a subject', () => {
    const n = buildCriticalEmailNotification(
      { threadId: 't1', person: 'Ahmet Yılmaz', deadlineAt: '2026-09-04T14:00:00.000Z' },
      ctx,
    );
    expect(n.body).toBe("Ahmet Yılmaz senden bugün 17:00'ye kadar dönüş bekliyor.");
    expect(n.deepLink).toBe('/email/t1');
    expect(n.title).toBe('Önemli mail');
    expect(n.android.priority).toBe('high');
    expect(
      buildCriticalEmailNotification({ threadId: 't1', person: 'Ahmet Yılmaz' }, ctx).body,
    ).toBe('Ahmet Yılmaz senden dönüş bekliyor.');
    expect(
      buildCriticalEmailNotification(
        { threadId: 't1', person: 'Ahmet Yılmaz', deadlineAt: '2026-09-04T14:00:00.000Z' },
        { ...ctx, locale: 'en' },
      ).body,
    ).toBe('Ahmet Yılmaz expects a reply by today 17:00.');
  });

  it('meeting copy shows local time, minutes and prep count; time-sensitive only with entitlement', () => {
    const n = buildMeetingNotification(
      { eventId: 'ev1', startAt: '2026-09-04T11:00:00.000Z', minutesBefore: 20, prepCount: 3 },
      ctx,
    );
    expect(n.body).toBe('14:00 toplantına 20 dakika kaldı. 3 hazırlık notun var.');
    expect(n.deepLink).toBe('/meeting/ev1/prep');
    expect(n.ios.interruptionLevel).toBe('active');
    const noPrep = buildMeetingNotification(
      { eventId: 'ev1', startAt: '2026-09-04T11:00:00.000Z', minutesBefore: 20, prepCount: 0 },
      { ...ctx, timeSensitiveEntitlement: true },
    );
    expect(noPrep.body).toBe('14:00 toplantına 20 dakika kaldı.');
    expect(noPrep.ios.interruptionLevel).toBe('time-sensitive');
    expect(
      buildMorningNotification({ count: 1 }, { ...ctx, timeSensitiveEntitlement: true }).ios
        .interruptionLevel,
    ).toBe('active');
  });

  it('deadline, follow-up, life event, approval, reminder and generic payloads', () => {
    expect(
      buildDeadlineNotification(
        {
          entityId: 'd1',
          title: 'Teklif',
          dueAt: '2026-09-04T08:42:00.000Z',
          deepLink: '/email/t9',
        },
        ctx,
      ),
    ).toMatchObject({ body: 'Teklif · 3 saat kaldı', deepLink: '/email/t9' });
    expect(
      buildDeadlineNotification(
        { entityId: 'd1', title: 'Teklif', dueAt: '2026-09-04T05:00:00.000Z' },
        ctx,
      ),
    ).toMatchObject({ body: 'Teklif · süresi geçti', deepLink: '/today' });
    expect(
      buildDeadlineNotification(
        { entityId: 'd1', title: 'Teklif', dueAt: '2026-09-07T05:42:00.000Z' },
        ctx,
      ).body,
    ).toBe('Teklif · 3 gün kaldı');
    expect(
      buildDeadlineNotification(
        { entityId: 'd1', title: 'Teklif', dueAt: '2026-09-04T06:07:00.000Z' },
        { ...ctx, locale: 'en' },
      ).body,
    ).toBe('Teklif · 25 minutes left');

    expect(
      buildFollowUpNotification(
        { followUpId: 'f1', person: 'Mehmet Kaya', days: 4, threadId: 't2' },
        ctx,
      ),
    ).toMatchObject({ body: 'Mehmet Kaya 4 gündür yanıt vermedi.', deepLink: '/email/t2' });
    expect(
      buildFollowUpNotification({ followUpId: 'f1', person: 'Mehmet Kaya', days: 4 }, ctx).deepLink,
    ).toBe('/followups');

    expect(
      buildLifeEventNotification(
        { lifeEventId: 'l1', type: 'shipment', title: 'Trendyol siparişi' },
        ctx,
      ),
    ).toMatchObject({ title: 'Kargo', body: 'Kargon bugün geliyor.', deepLink: '/life/l1' });
    expect(
      buildLifeEventNotification(
        { lifeEventId: 'l2', type: 'flight', title: 'TK2158', at: '2026-09-05T04:30:00.000Z' },
        ctx,
      ).body,
    ).toBe('Yarın 07:30 uçuşun var. Check-in açık.');
    expect(
      buildLifeEventNotification(
        {
          lifeEventId: 'l3',
          type: 'payment',
          title: 'Elektrik faturası',
          at: '2026-09-05T12:00:00.000Z',
        },
        ctx,
      ).body,
    ).toBe('Elektrik faturası son ödeme yarın.');
    expect(
      buildLifeEventNotification(
        { lifeEventId: 'l4', type: 'subscription', title: 'Netflix yenileniyor' },
        ctx,
      ),
    ).toMatchObject({ title: 'Abonelik', body: 'Netflix yenileniyor' });

    expect(buildApprovalNotification({ approvalId: 'a1' }, ctx)).toMatchObject({
      title: 'Onay bekliyor',
      body: 'Onayını bekleyen bir işlem var.',
      deepLink: '/approvals/a1',
    });
    expect(
      buildReminderNotification(
        { reminderId: 'r1', title: 'Ahmet’i ara', deepLink: '/email/t3' },
        ctx,
      ),
    ).toMatchObject({
      title: 'Hatırlatıcı',
      body: 'Ahmet’i ara',
      deepLink: '/email/t3',
      dedupeKey: 'reminder:r1:2026-09-04',
    });
    expect(buildGenericNotification('life_event', 'x', ctx)).toMatchObject({
      body: "Dijital Asistan'da yeni bir gelişme var.",
      deepLink: '/today',
    });
  });

  it('pushDedupeKey is category:entity:date', () => {
    expect(pushDedupeKey('meeting', 'ev1', '2026-09-04')).toBe('meeting:ev1:2026-09-04');
  });
});

describe('notifications · lock screen privacy', () => {
  const n = buildCriticalEmailNotification(
    { threadId: 't1', person: 'Ahmet Yılmaz', deadlineAt: '2026-09-04T14:00:00.000Z' },
    ctx,
  );
  it('keeps full, reduces to title only, or makes generic — deep links intact', () => {
    expect(applyLockScreenPrivacy(n, 'full')).toEqual(n);
    const titleOnly = applyLockScreenPrivacy(n, 'title_only');
    expect(titleOnly.title).toBe('Önemli mail');
    expect(titleOnly.body).toBe('Yeni gelişme');
    expect(titleOnly.deepLink).toBe('/email/t1');
    const generic = applyLockScreenPrivacy(n, 'generic');
    expect(generic.title).toBe('Dijital Asistan');
    expect(generic.body).toBe("Dijital Asistan'da yeni bir gelişme var.");
    expect(generic.data.entityId).toBe('t1');
    const en = applyLockScreenPrivacy(
      buildMorningNotification({ count: 2 }, { ...ctx, locale: 'en' }),
      'generic',
    );
    expect(en.body).toBe("There's a new update in Dijital Asistan.");
  });
});

describe('notifications · quiet hours', () => {
  const overnight = { enabled: true, start: '22:00', end: '08:00' };
  it('handles overnight windows in the user timezone', () => {
    expect(isQuietHours('2026-09-04T20:30:00.000Z', overnight, tz)).toBe(true); // 23:30
    expect(isQuietHours('2026-09-04T04:59:00.000Z', overnight, tz)).toBe(true); // 07:59
    expect(isQuietHours('2026-09-04T05:00:00.000Z', overnight, tz)).toBe(false); // 08:00
    expect(isQuietHours('2026-09-04T09:00:00.000Z', overnight, tz)).toBe(false); // 12:00
    expect(isQuietHours('2026-09-04T19:00:00.000Z', overnight, tz)).toBe(true); // 22:00
  });
  it('handles same-day windows, disabled and degenerate configs', () => {
    const lunch = { enabled: true, start: '12:00', end: '14:00' };
    expect(isQuietHours('2026-09-04T10:00:00.000Z', lunch, tz)).toBe(true); // 13:00
    expect(isQuietHours('2026-09-04T12:00:00.000Z', lunch, tz)).toBe(false); // 15:00
    expect(isQuietHours('2026-09-04T20:30:00.000Z', { ...overnight, enabled: false }, tz)).toBe(
      false,
    );
    expect(
      isQuietHours('2026-09-04T20:30:00.000Z', { enabled: true, start: '22:00', end: '22:00' }, tz),
    ).toBe(false);
    expect(
      isQuietHours('2026-09-04T20:30:00.000Z', { enabled: true, start: 'abc', end: '08:00' }, tz),
    ).toBe(false);
  });
  it('nextQuietHoursEnd finds the end today or tomorrow', () => {
    expect(nextQuietHoursEnd('2026-09-04T04:59:00.000Z', overnight, tz)).toBe(
      '2026-09-04T05:00:00.000Z',
    );
    expect(nextQuietHoursEnd('2026-09-04T20:30:00.000Z', overnight, tz)).toBe(
      '2026-09-05T05:00:00.000Z',
    );
    expect(nextQuietHoursEnd('2026-09-04T09:00:00.000Z', overnight, tz)).toBe(
      '2026-09-04T09:00:00.000Z',
    );
  });
});

describe('notifications · shouldSend', () => {
  const base = { now, timezone: tz, entitlement: { isPro: true } };
  it('respects category toggles and system permission', () => {
    expect(
      shouldSend({ ...base, category: 'follow_up', prefs: prefs({ off: ['follow_up'] }) }),
    ).toEqual({ send: false, reason: 'category_off' });
    expect(
      shouldSend({
        ...base,
        category: 'follow_up',
        prefs: prefs({ systemPermissionGranted: false }),
        isCritical: true,
      }),
    ).toEqual({ send: false, reason: 'system_permission' });
    expect(shouldSend({ ...base, category: 'follow_up', prefs: prefs() })).toEqual({ send: true });
  });
  it('gates midday / evening / weekly behind Pro', () => {
    for (const category of ['midday', 'evening', 'weekly'] as const) {
      expect(
        shouldSend({ ...base, category, prefs: prefs(), entitlement: { isPro: false } }),
      ).toEqual({ send: false, reason: 'pro_required' });
      expect(shouldSend({ ...base, category, prefs: prefs() })).toEqual({ send: true });
    }
    expect(
      shouldSend({ ...base, category: 'morning', prefs: prefs(), entitlement: { isPro: false } }),
    ).toEqual({ send: true });
  });
  it('"only when important" keeps critical/high event pushes and leaves scheduled ones alone', () => {
    const p = prefs({ onlyWhenImportant: true });
    expect(shouldSend({ ...base, category: 'follow_up', prefs: p, importance: 'normal' })).toEqual({
      send: false,
      reason: 'only_important',
    });
    expect(shouldSend({ ...base, category: 'life_event', prefs: p })).toEqual({
      send: false,
      reason: 'only_important',
    });
    expect(shouldSend({ ...base, category: 'deadline', prefs: p, importance: 'high' })).toEqual({
      send: true,
    });
    expect(
      shouldSend({ ...base, category: 'critical_email', prefs: p, importance: 'critical' }),
    ).toEqual({ send: true });
    expect(
      shouldSend({
        ...base,
        category: 'meeting',
        prefs: p,
        importance: 'normal',
        isCritical: true,
      }),
    ).toEqual({ send: true });
    expect(shouldSend({ ...base, category: 'morning', prefs: p })).toEqual({ send: true });
    expect(shouldSend({ ...base, category: 'approval', prefs: p })).toEqual({ send: true });
  });
  it('quiet hours suppress non-critical pushes and say when to retry', () => {
    const p = prefs({ quietHoursEnabled: true });
    const atSeven = '2026-09-04T04:00:00.000Z';
    expect(
      shouldSend({ ...base, now: atSeven, category: 'follow_up', prefs: p, importance: 'high' }),
    ).toEqual({ send: false, reason: 'quiet_hours', deferUntil: '2026-09-04T05:00:00.000Z' });
    expect(shouldSend({ ...base, now: atSeven, category: 'morning', prefs: p })).toMatchObject({
      send: false,
      reason: 'quiet_hours',
    });
    expect(
      shouldSend({
        ...base,
        now: atSeven,
        category: 'critical_email',
        prefs: p,
        importance: 'critical',
      }),
    ).toEqual({ send: true });
    expect(
      shouldSend({ ...base, now: atSeven, category: 'meeting', prefs: p, isCritical: true }),
    ).toEqual({ send: true });
    expect(shouldSend({ ...base, category: 'follow_up', prefs: p })).toEqual({ send: true });
  });
});

describe('notifications · computeMiddayDelta', () => {
  it('reports added and resolved insights', () => {
    const d = computeMiddayDelta(
      ['i1', 'i2', 'i3'],
      [
        { id: 'i1', status: 'active' },
        { id: 'i2', status: 'completed' },
        { id: 'i4', status: 'active' },
        { id: 'i5', status: 'dismissed' },
      ],
    );
    expect(d).toEqual({ changed: { added: ['i4'], resolved: ['i2', 'i3'] }, hasChanges: true });
    expect(computeMiddayDelta(['i1'], [{ id: 'i1', status: 'active' }])).toEqual({
      changed: { added: [], resolved: [] },
      hasChanges: false,
    });
  });
});

describe('notifications · dueBriefings', () => {
  const schedule: BriefingSchedule = {
    morningTime: '08:30',
    middayEnabled: true,
    middayTime: '13:00',
    eveningEnabled: true,
    eveningTime: '19:00',
    weeklyEnabled: true,
    weeklyDay: 5,
    weeklyTime: '18:00',
    weekendEnabled: false,
    quietDays: [],
  };
  it('sends within the tolerance window, once per local day', () => {
    expect(dueBriefings({ schedule, timezone: tz, now, lastSent: {} })).toEqual(['morning']);
    expect(
      dueBriefings({ schedule, timezone: tz, now, lastSent: { morning: '2026-09-04' } }),
    ).toEqual([]);
    expect(
      dueBriefings({ schedule, timezone: tz, now, lastSent: { morning: '2026-09-03' } }),
    ).toEqual(['morning']);
    expect(
      dueBriefings({ schedule, timezone: tz, now: '2026-09-04T05:46:00.000Z', lastSent: {} }),
    ).toEqual([]);
    expect(
      dueBriefings({
        schedule,
        timezone: tz,
        now: '2026-09-04T05:46:00.000Z',
        lastSent: {},
        toleranceMin: 30,
      }),
    ).toEqual(['morning']);
    expect(
      dueBriefings({ schedule, timezone: tz, now: '2026-09-04T05:29:00.000Z', lastSent: {} }),
    ).toEqual([]);
    expect(
      dueBriefings({ schedule, timezone: tz, now: '2026-09-04T10:05:00.000Z', lastSent: {} }),
    ).toEqual(['midday']);
    expect(
      dueBriefings({
        schedule: { ...schedule, middayEnabled: false },
        timezone: tz,
        now: '2026-09-04T10:05:00.000Z',
        lastSent: {},
      }),
    ).toEqual([]);
    expect(
      dueBriefings({ schedule, timezone: tz, now: '2026-09-04T16:00:00.000Z', lastSent: {} }),
    ).toEqual(['evening']);
  });
  it('weekly fires on weeklyDay (0 = Sunday) independent of the weekend switch; quiet days silence all', () => {
    expect(
      dueBriefings({ schedule, timezone: tz, now: '2026-09-04T15:00:00.000Z', lastSent: {} }),
    ).toEqual(['weekly']);
    expect(
      dueBriefings({
        schedule,
        timezone: tz,
        now: '2026-09-04T15:00:00.000Z',
        lastSent: { weekly: '2026-09-04' },
      }),
    ).toEqual([]);
    const sunday = { ...schedule, weeklyDay: 0 as const };
    expect(
      dueBriefings({
        schedule: sunday,
        timezone: tz,
        now: '2026-09-06T15:00:00.000Z',
        lastSent: {},
      }),
    ).toEqual(['weekly']);
    expect(
      dueBriefings({
        schedule: sunday,
        timezone: tz,
        now: '2026-09-06T05:42:00.000Z',
        lastSent: {},
      }),
    ).toEqual([]);
    expect(
      dueBriefings({
        schedule: { ...sunday, weekendEnabled: true },
        timezone: tz,
        now: '2026-09-06T05:42:00.000Z',
        lastSent: {},
      }),
    ).toEqual(['morning']);
    expect(
      dueBriefings({ schedule: { ...schedule, quietDays: [5] }, timezone: tz, now, lastSent: {} }),
    ).toEqual([]);
    expect(
      dueBriefings({
        schedule: { ...schedule, quietDays: [5] },
        timezone: tz,
        now: '2026-09-04T15:00:00.000Z',
        lastSent: {},
      }),
    ).toEqual([]);
  });
  it('can report several kinds at once when times coincide', () => {
    const same = { ...schedule, eveningTime: '18:00' };
    expect(
      dueBriefings({ schedule: same, timezone: tz, now: '2026-09-04T15:00:00.000Z', lastSent: {} }),
    ).toEqual(['evening', 'weekly']);
  });
});
