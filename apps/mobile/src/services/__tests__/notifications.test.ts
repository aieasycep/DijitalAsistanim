import type { DataSource } from '@da/api-client';
import type { NotificationPreferences } from '@da/domain';

jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('@/lib/env', () => ({
  env: { easProjectId: 'test-project', appVersion: '1.0.0', appScheme: 'dijitalasistan', isProduction: false, universalHosts: ['dijitalasistan.app'], webUrl: 'https://dijitalasistan.app' },
  IS_PRODUCTION: false,
  hasSupabase: false,
  isDemoMode: true,
}));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n), randomUUID: () => '00000000-0000-4000-8000-000000000000' }));
jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'Test iPhone' }));
jest.mock('expo-application', () => ({ applicationId: 'com.dijitalasistan.app', getAndroidId: () => 'android-id', getIosIdForVendorAsync: async () => 'ios-vendor-id' }));

const mockScheduled: { identifier?: string; content: Record<string, unknown>; trigger: unknown }[] = [];
const mockPermission = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' as const };

jest.mock('expo-notifications', () => ({
  AndroidNotificationPriority: { MIN: 'min', LOW: 'low', DEFAULT: 'default', HIGH: 'high', MAX: 'max' },
  AndroidImportance: { UNKNOWN: 0, UNSPECIFIED: 1, NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 },
  AndroidNotificationVisibility: { UNKNOWN: 0, PUBLIC: 1, PRIVATE: 2, SECRET: 3 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ ...mockPermission })),
  requestPermissionsAsync: jest.fn(async () => {
    mockPermission.status = 'granted';
    mockPermission.granted = true;
    return { ...mockPermission };
  }),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[abc]' })),
  scheduleNotificationAsync: jest.fn(async (req: { identifier?: string; content: Record<string, unknown>; trigger: unknown }) => {
    mockScheduled.push(req);
    return req.identifier ?? 'generated';
  }),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  dismissAllNotificationsAsync: jest.fn(async () => undefined),
  setBadgeCountAsync: jest.fn(async () => true),
}));

import * as Notifications from 'expo-notifications';
import { CacheKeys, writeCache } from '@/lib/storage';
import {
  PUSH_TOKEN_CACHE_KEY,
  applyLockScreenPrivacy,
  cacheNotificationPreferences,
  cancelLocalReminder,
  channelForCategory,
  decideForegroundBehavior,
  getNotificationDeepLink,
  isWithinQuietHours,
  quietHoursEndAfter,
  readNotificationMeta,
  registerPushToken,
  requestPermission,
  resolveQuietHours,
  scheduleLocalReminder,
  scheduleMeetingLeadNotification,
  syncBadgeCount,
} from '@/services/notifications';
import { removeCache } from '@/lib/storage';

const TZ = 'Europe/Istanbul';

const prefs = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  userId: 'u1',
  createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z',
  categories: {
    morning: true,
    midday: true,
    evening: true,
    weekly: true,
    critical_email: true,
    meeting: true,
    deadline: true,
    follow_up: false,
    life_event: true,
    approval: true,
    reminder: true,
  },
  onlyWhenImportant: false,
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  lockScreenPrivacy: 'full',
  meetingLeadMinutes: 30,
  systemPermissionGranted: true,
  ...overrides,
});

beforeAll(() => {
  writeCache(CacheKeys.preferences, { timezone: TZ, locale: 'tr' });
});

beforeEach(() => {
  mockScheduled.length = 0;
  jest.clearAllMocks();
});

describe('applyLockScreenPrivacy', () => {
  it('keeps everything in full mode', () => {
    expect(applyLockScreenPrivacy('Ahmet revize teklif bekliyor', 'Detay', 'full')).toEqual({ title: 'Ahmet revize teklif bekliyor', body: 'Detay' });
  });
  it('strips the body in title_only mode', () => {
    expect(applyLockScreenPrivacy('Ahmet revize teklif bekliyor', 'Detay', 'title_only')).toEqual({ title: 'Ahmet revize teklif bekliyor', body: null });
  });
  it('replaces everything in generic mode', () => {
    const out = applyLockScreenPrivacy('Ahmet revize teklif bekliyor', 'Detay', 'generic');
    expect(out.title).toBe('Dijital Asistan');
    expect(out.body).toBe("Dijital Asistan'da yeni bir gelişme var.");
    expect(out.title).not.toContain('Ahmet');
    expect(out.body).not.toContain('Detay');
  });
});

describe('quiet hours', () => {
  const p = prefs();
  it('detects overnight ranges in the user timezone', () => {
    expect(isWithinQuietHours(p, new Date('2030-09-05T20:30:00Z'), TZ)).toBe(true); // 23:30
    expect(isWithinQuietHours(p, new Date('2030-09-05T04:30:00Z'), TZ)).toBe(true); // 07:30
    expect(isWithinQuietHours(p, new Date('2030-09-05T09:00:00Z'), TZ)).toBe(false); // 12:00
    expect(isWithinQuietHours(p, new Date('2030-09-05T05:00:00Z'), TZ)).toBe(false); // 08:00 exactly → open
  });
  it('handles same-day ranges, disabled and degenerate settings', () => {
    const day = prefs({ quietHoursStart: '12:00', quietHoursEnd: '14:00' });
    expect(isWithinQuietHours(day, new Date('2030-09-05T10:00:00Z'), TZ)).toBe(true); // 13:00
    expect(isWithinQuietHours(day, new Date('2030-09-05T12:00:00Z'), TZ)).toBe(false); // 15:00
    expect(isWithinQuietHours(prefs({ quietHoursEnabled: false }), new Date('2030-09-05T20:30:00Z'), TZ)).toBe(false);
    expect(isWithinQuietHours(prefs({ quietHoursStart: '08:00', quietHoursEnd: '08:00' }), new Date('2030-09-05T20:30:00Z'), TZ)).toBe(false);
    expect(isWithinQuietHours(null, new Date(), TZ)).toBe(false);
  });
  it('computes the end of quiet hours', () => {
    expect(quietHoursEndAfter(new Date('2030-09-05T20:30:00Z'), p, TZ).toISOString()).toBe('2030-09-06T05:00:00.000Z');
    expect(quietHoursEndAfter(new Date('2030-09-05T04:30:00Z'), p, TZ).toISOString()).toBe('2030-09-05T05:00:00.000Z');
  });
  it('applies the delivery policy', () => {
    const at = new Date('2030-09-05T20:30:00Z');
    expect(resolveQuietHours(at, p, 'defer', TZ)).toEqual({ at: new Date('2030-09-06T05:00:00.000Z'), silent: false });
    expect(resolveQuietHours(at, p, 'silent', TZ)).toEqual({ at, silent: true });
    expect(resolveQuietHours(at, p, 'skip', TZ)).toBeNull();
    expect(resolveQuietHours(at, p, 'ignore', TZ)).toEqual({ at, silent: false });
    const noon = new Date('2030-09-05T09:00:00Z');
    expect(resolveQuietHours(noon, p, 'defer', TZ)).toEqual({ at: noon, silent: false });
  });
});

describe('foreground behavior & channels', () => {
  it('maps categories to channels', () => {
    expect(channelForCategory('morning')).toBe('briefings');
    expect(channelForCategory('critical_email')).toBe('critical');
    expect(channelForCategory('meeting')).toBe('meetings');
    expect(channelForCategory('reminder')).toBe('reminders');
    expect(channelForCategory('approval')).toBe('general');
    expect(channelForCategory(null)).toBe('general');
  });
  it('suppresses disabled categories entirely', () => {
    expect(decideForegroundBehavior({ category: 'follow_up' }, prefs(), new Date('2030-09-05T09:00:00Z'), TZ)).toMatchObject({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false });
  });
  it('mutes sound during quiet hours and sets the badge for approvals', () => {
    expect(decideForegroundBehavior({ category: 'critical_email' }, prefs(), new Date('2030-09-05T20:30:00Z'), TZ)).toMatchObject({ shouldShowBanner: true, shouldPlaySound: false, shouldSetBadge: false });
    expect(decideForegroundBehavior({ category: 'critical_email' }, prefs(), new Date('2030-09-05T09:00:00Z'), TZ)).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
    expect(decideForegroundBehavior({ category: 'approval' }, prefs(), new Date('2030-09-05T09:00:00Z'), TZ)).toMatchObject({ shouldSetBadge: true, shouldShowList: true });
    expect(decideForegroundBehavior({ category: 'morning' }, null, new Date(), TZ)).toMatchObject({ shouldShowBanner: true, shouldPlaySound: false });
  });
  it('reads payload metadata defensively', () => {
    expect(readNotificationMeta({ category: 'meeting', deepLink: 'dijitalasistan://meeting/x/prep', insightKind: 'meeting', badge: 'meeting' })).toEqual({
      category: 'meeting',
      deepLink: 'dijitalasistan://meeting/x/prep',
      insightKind: 'meeting',
      badge: 'meeting',
      dedupeKey: null,
    });
    expect(readNotificationMeta({ category: 'bogus', url: 42 })).toEqual({ category: null, deepLink: null, insightKind: null, badge: null, dedupeKey: null });
    expect(getNotificationDeepLink(null)).toBeNull();
  });
});

describe('permission & push token', () => {
  it('prompts only when undetermined and returns granted afterwards', async () => {
    expect(await requestPermission()).toBe('granted');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(await requestPermission()).toBe('granted');
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('registers once per user/token and skips unchanged registrations', async () => {
    removeCache(PUSH_TOKEN_CACHE_KEY);
    const registerPushTokenMock = jest.fn(async () => undefined);
    const ds = { profile: { registerPushToken: registerPushTokenMock } } as unknown as DataSource;
    expect(await registerPushToken(ds, { userId: 'u1' })).toEqual({ status: 'registered', token: 'ExponentPushToken[abc]' });
    expect(registerPushTokenMock).toHaveBeenCalledWith(expect.objectContaining({ token: 'ExponentPushToken[abc]', platform: 'ios', deviceId: 'ios-vendor-id', appVersion: '1.0.0' }));
    expect(await registerPushToken(ds, { userId: 'u1' })).toEqual({ status: 'skipped', reason: 'unchanged' });
    expect(await registerPushToken(ds, { userId: 'u2' })).toEqual({ status: 'registered', token: 'ExponentPushToken[abc]' });
    expect(registerPushTokenMock).toHaveBeenCalledTimes(2);
  });
});

describe('local scheduling', () => {
  it('defers reminders out of quiet hours and strips the body in title_only mode', async () => {
    cacheNotificationPreferences(prefs({ lockScreenPrivacy: 'title_only' }));
    const id = await scheduleLocalReminder({ id: 'r1', title: 'Teklifi gönder', body: 'Ahmet bekliyor', at: '2030-09-05T20:30:00Z', deepLink: 'dijitalasistan://commitments' });
    expect(id).toBe('reminder:r1');
    expect(mockScheduled).toHaveLength(1);
    const req = mockScheduled[0];
    expect(req?.identifier).toBe('reminder:r1');
    expect(req?.content.title).toBe('Teklifi gönder');
    expect(req?.content.body).toBeUndefined();
    expect(req?.content.data).toEqual({ deepLink: 'dijitalasistan://commitments', category: 'reminder', reminderId: 'r1' });
    expect(req?.trigger).toEqual({ type: 'date', date: new Date('2030-09-06T05:00:00.000Z'), channelId: 'reminders' });
    await cancelLocalReminder('r1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenLastCalledWith('reminder:r1');
  });

  it('keeps meeting leads on time but silent during quiet hours, and dedupes', async () => {
    cacheNotificationPreferences(prefs({ lockScreenPrivacy: 'full' }));
    const event = { id: 'evt-1', title: 'Mehmet ile müşteri toplantısı', startAt: '2030-09-05T04:30:00Z', status: 'confirmed' as const };
    expect(await scheduleMeetingLeadNotification(event, 30)).toBe('meeting:evt-1');
    expect(mockScheduled).toHaveLength(1);
    expect(mockScheduled[0]?.content.sound).toBe(false);
    expect(mockScheduled[0]?.content.body).toBe('07:30 toplantına 30 dakika kaldı.');
    expect(mockScheduled[0]?.trigger).toEqual({ type: 'date', date: new Date('2030-09-05T04:00:00.000Z'), channelId: 'meetings' });
    expect(await scheduleMeetingLeadNotification(event, 30)).toBe('meeting:evt-1');
    expect(mockScheduled).toHaveLength(1);
    expect(await scheduleMeetingLeadNotification({ ...event, status: 'cancelled' }, 30)).toBeNull();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenLastCalledWith('meeting:evt-1');
  });

  it('syncs the badge only when the count changes', async () => {
    await syncBadgeCount(3);
    await syncBadgeCount(3);
    await syncBadgeCount(-1);
    expect(Notifications.setBadgeCountAsync).toHaveBeenNthCalledWith(1, 3);
    expect(Notifications.setBadgeCountAsync).toHaveBeenNthCalledWith(2, 0);
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledTimes(2);
  });
});
