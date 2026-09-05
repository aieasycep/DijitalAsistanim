/**
 * expo-notifications integration: Android channels, foreground presentation policy, permission state,
 * Expo push-token registration, local reminders / meeting lead notifications, lock-screen privacy,
 * quiet hours and the app badge (= pending approvals).
 *
 * Rules: the app never prompts for permission on its own (the onboarding screen calls `requestPermission`);
 * every native call is guarded so a missing module (Expo Go, tests, web) never crashes the app.
 * Remote payloads are already privacy-shaped server-side; local scheduling applies the same rules here.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { formatTime, t } from '@da/i18n';
import type { DataSource } from '@da/api-client';
import {
  NOTIFICATION_CATEGORIES,
  type CalendarEvent,
  type Locale,
  type LockScreenPrivacy,
  type NotificationCategory,
  type NotificationPreferences,
  type UserPreferences,
} from '@da/domain';
import { env } from '@/lib/env';
import { captureError } from '@/lib/monitoring';
import { CacheKeys, readCache, removeCache, writeCache } from '@/lib/storage';

// ---------------------------------------------------------------------------
// Constants & cache keys
// ---------------------------------------------------------------------------

export const NOTIFICATION_CHANNEL_IDS = ['briefings', 'critical', 'meetings', 'reminders', 'general'] as const;
export type NotificationChannelId = (typeof NOTIFICATION_CHANNEL_IDS)[number];

export const NOTIFICATION_PREFS_CACHE_KEY = 'cache.notificationPreferences.v1';
export const PUSH_TOKEN_CACHE_KEY = 'push.token.v1';
export const DEVICE_ID_CACHE_KEY = 'device.id.v1';
const MEETING_LEAD_CACHE_KEY = 'notifications.meetingLead.v1';
/** Re-register a cached token after this long so the server keeps `last_seen_at` fresh. */
const TOKEN_REFRESH_MS = 7 * 24 * 60 * 60_000;

const CATEGORY_CHANNEL: Record<NotificationCategory, NotificationChannelId> = {
  morning: 'briefings',
  midday: 'briefings',
  evening: 'briefings',
  weekly: 'briefings',
  critical_email: 'critical',
  deadline: 'critical',
  meeting: 'meetings',
  reminder: 'reminders',
  follow_up: 'general',
  life_event: 'general',
  approval: 'general',
};

export function channelForCategory(category: NotificationCategory | null | undefined): NotificationChannelId {
  return category ? CATEGORY_CHANNEL[category] : 'general';
}

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === 'string' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Preferences (cached copy of NotificationPreferences for synchronous decisions)
// ---------------------------------------------------------------------------

export function getCachedNotificationPreferences(): NotificationPreferences | null {
  try {
    return readCache<NotificationPreferences>(NOTIFICATION_PREFS_CACHE_KEY);
  } catch {
    return null;
  }
}

export function cacheNotificationPreferences(prefs: NotificationPreferences | null): void {
  try {
    if (prefs) writeCache(NOTIFICATION_PREFS_CACHE_KEY, prefs);
    else removeCache(NOTIFICATION_PREFS_CACHE_KEY);
  } catch (e) {
    captureError(e, { where: 'cacheNotificationPreferences' });
  }
}

/** Fetches the server copy and caches it; returns the cached copy when offline. */
export async function refreshNotificationPreferences(ds: DataSource): Promise<NotificationPreferences | null> {
  try {
    const prefs = await ds.profile.getNotificationPreferences();
    cacheNotificationPreferences(prefs);
    return prefs;
  } catch {
    return getCachedNotificationPreferences();
  }
}

export function currentLockScreenPrivacy(): LockScreenPrivacy {
  return getCachedNotificationPreferences()?.lockScreenPrivacy ?? 'full';
}

function userTimezone(): string {
  const prefs = readCache<UserPreferences>(CacheKeys.preferences);
  if (prefs?.timezone) return prefs.timezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul';
  } catch {
    return 'Europe/Istanbul';
  }
}

function userLocale(): Locale {
  return readCache<UserPreferences>(CacheKeys.preferences)?.locale ?? 'tr';
}

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

export type QuietHoursPolicy = 'defer' | 'silent' | 'skip' | 'ignore';
export type QuietHoursPrefs = Pick<NotificationPreferences, 'quietHoursEnabled' | 'quietHoursStart' | 'quietHoursEnd'>;

function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minute of day for `date` in `timezone` (falls back to the device zone on invalid zones). */
export function minutesOfDay(date: Date, timezone?: string): number {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).formatToParts(date);
      const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
      const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? NaN);
      if (Number.isFinite(hour) && Number.isFinite(minute)) return (hour % 24) * 60 + minute;
    } catch {
      // invalid timezone id → device local time below
    }
  }
  return date.getHours() * 60 + date.getMinutes();
}

/** True when `now` falls inside the user's quiet hours (supports overnight ranges such as 22:00 → 08:00). */
export function isWithinQuietHours(prefs: QuietHoursPrefs | null | undefined, now: Date, timezone?: string): boolean {
  if (!prefs?.quietHoursEnabled) return false;
  const start = parseClock(prefs.quietHoursStart);
  const end = parseClock(prefs.quietHoursEnd);
  if (start === null || end === null || start === end) return false;
  const m = minutesOfDay(now, timezone);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** The next instant quiet hours end, relative to `at` (assumes `at` is within quiet hours). */
export function quietHoursEndAfter(at: Date, prefs: QuietHoursPrefs, timezone?: string): Date {
  const end = parseClock(prefs.quietHoursEnd);
  if (end === null) return at;
  const m = minutesOfDay(at, timezone);
  const delta = (end - m + 24 * 60) % (24 * 60);
  const shifted = new Date(at.getTime() + delta * 60_000);
  shifted.setSeconds(0, 0);
  return shifted;
}

export interface ResolvedDelivery {
  at: Date;
  /** Deliver without sound / banner interruption. */
  silent: boolean;
}

/**
 * Applies the quiet-hours policy to a local delivery time:
 *  - `defer`: move to the end of quiet hours (reminders)
 *  - `silent`: keep the time, drop the sound (meeting lead — a deferred lead is useless)
 *  - `skip`: do not deliver
 *  - `ignore`: quiet hours do not apply
 */
export function resolveQuietHours(at: Date, prefs: QuietHoursPrefs | null | undefined, policy: QuietHoursPolicy, timezone?: string): ResolvedDelivery | null {
  if (policy === 'ignore' || !isWithinQuietHours(prefs, at, timezone) || !prefs) return { at, silent: false };
  switch (policy) {
    case 'defer':
      return { at: quietHoursEndAfter(at, prefs, timezone), silent: false };
    case 'silent':
      return { at, silent: true };
    case 'skip':
      return null;
    default:
      return { at, silent: false };
  }
}

// ---------------------------------------------------------------------------
// Lock-screen privacy
// ---------------------------------------------------------------------------

export interface NotificationText {
  title: string;
  body: string | null;
}

/**
 * Shapes what the lock screen may show:
 *  - `full`: title + body
 *  - `title_only`: title, body stripped
 *  - `generic`: app name + a generic sentence — no user content at all
 */
export function applyLockScreenPrivacy(title: string, body: string | null | undefined, mode: LockScreenPrivacy): NotificationText {
  switch (mode) {
    case 'title_only':
      return { title, body: null };
    case 'generic':
      return { title: t('app.name'), body: t('notifications.generic') };
    default:
      return { title, body: body ?? null };
  }
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

export interface NotificationPayloadMeta {
  category: NotificationCategory | null;
  deepLink: string | null;
  insightKind: string | null;
  badge: string | null;
  dedupeKey: string | null;
}

function asString(value: unknown, max = 2048): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

export function readNotificationMeta(data: Record<string, unknown> | null | undefined): NotificationPayloadMeta {
  const d = data ?? {};
  const category = isNotificationCategory(d.category) ? d.category : null;
  return {
    category,
    deepLink: asString(d.deepLink) ?? asString(d.url) ?? asString(d.link),
    insightKind: asString(d.insightKind, 64) ?? asString(d.kind, 64),
    badge: asString(d.badge, 64),
    dedupeKey: asString(d.dedupeKey, 256),
  };
}

export function getNotificationDeepLink(response: Notifications.NotificationResponse | null | undefined): string | null {
  if (!response) return null;
  return readNotificationMeta(response.notification.request.content.data).deepLink;
}

// ---------------------------------------------------------------------------
// Foreground presentation policy
// ---------------------------------------------------------------------------

const SUPPRESSED: Notifications.NotificationBehavior = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };

/**
 * Decides how a notification is presented while the app is in the foreground.
 * Disabled categories are suppressed entirely; quiet hours mute sound; approvals may update the badge.
 */
export function decideForegroundBehavior(
  data: Record<string, unknown> | null | undefined,
  prefs: NotificationPreferences | null,
  now: Date,
  timezone?: string,
): Notifications.NotificationBehavior {
  const { category } = readNotificationMeta(data);
  if (category && prefs && prefs.categories[category] === false) return SUPPRESSED;
  const quiet = isWithinQuietHours(prefs, now, timezone);
  const channel = channelForCategory(category);
  const isApproval = category === 'approval';
  switch (channel) {
    case 'critical':
    case 'meetings':
    case 'reminders':
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: !quiet, shouldSetBadge: isApproval, priority: Notifications.AndroidNotificationPriority.HIGH };
    case 'briefings':
      return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false, priority: Notifications.AndroidNotificationPriority.DEFAULT };
    default:
      return { shouldShowBanner: !quiet, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: isApproval, priority: Notifications.AndroidNotificationPriority.DEFAULT };
  }
}

let handlerConfigured = false;

/** Installs the foreground handler once. Safe to call repeatedly. */
export function configureNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) =>
        decideForegroundBehavior(notification.request.content.data, getCachedNotificationPreferences(), new Date(), userTimezone()),
      handleError: (notificationId, error) => captureError(error, { where: 'notificationHandler', notificationId }),
    });
  } catch (e) {
    handlerConfigured = false;
    captureError(e, { where: 'configureNotificationHandler' });
  }
}

// ---------------------------------------------------------------------------
// Android channels
// ---------------------------------------------------------------------------

let channelsReady = false;

function channelInputs(): Record<NotificationChannelId, Notifications.NotificationChannelInput> {
  const { AndroidImportance, AndroidNotificationVisibility } = Notifications;
  const base = { lockscreenVisibility: AndroidNotificationVisibility.PRIVATE, lightColor: '#5B5CE2', enableLights: true } as const;
  return {
    briefings: { ...base, name: t('widgets.brief'), importance: AndroidImportance.DEFAULT, vibrationPattern: null, enableVibrate: false, showBadge: false, sound: 'default' },
    critical: { ...base, name: t('settings.notificationScreen.categories.critical_email'), importance: AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250], enableVibrate: true, showBadge: true, sound: 'default' },
    meetings: { ...base, name: t('settings.notificationScreen.categories.meeting'), importance: AndroidImportance.HIGH, vibrationPattern: [0, 200], enableVibrate: true, showBadge: false, sound: 'default' },
    reminders: { ...base, name: t('settings.notificationScreen.categories.reminder'), importance: AndroidImportance.HIGH, vibrationPattern: [0, 200, 100, 200], enableVibrate: true, showBadge: false, sound: 'default' },
    general: { ...base, name: t('settings.notifications'), importance: AndroidImportance.DEFAULT, vibrationPattern: null, enableVibrate: false, showBadge: true, sound: 'default' },
  };
}

/** Creates/updates the Android notification channels (no-op elsewhere). Idempotent. */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android' || channelsReady) return;
  try {
    const inputs = channelInputs();
    for (const id of NOTIFICATION_CHANNEL_IDS) await Notifications.setNotificationChannelAsync(id, inputs[id]);
    channelsReady = true;
  } catch (e) {
    captureError(e, { where: 'setupNotificationChannels' });
  }
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

function mapPermission(status: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (status.granted) return 'granted';
  if (status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL || status.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL) return 'granted';
  if (status.status === 'undetermined' || status.ios?.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return 'undetermined';
  return 'denied';
}

/** Current permission without prompting. */
export async function getPermissionStatus(): Promise<NotificationPermission> {
  try {
    return mapPermission(await Notifications.getPermissionsAsync());
  } catch (e) {
    captureError(e, { where: 'getPermissionStatus' });
    return 'undetermined';
  }
}

/** Prompts the system dialog (only when still undetermined). Called by the onboarding / settings explainer. */
export async function requestPermission(): Promise<NotificationPermission> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (mapPermission(current) !== 'undetermined') return mapPermission(current);
    const next = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    return mapPermission(next);
  } catch (e) {
    captureError(e, { where: 'requestPermission' });
    return 'undetermined';
  }
}

// ---------------------------------------------------------------------------
// Device id & push token
// ---------------------------------------------------------------------------

/** Stable per-install device id: Android ID / iOS vendor id, else a persisted random UUID. */
export async function getDeviceId(): Promise<string> {
  const cached = readCache<string>(DEVICE_ID_CACHE_KEY);
  if (cached) return cached;
  let id: string | null = null;
  try {
    if (Platform.OS === 'android') id = Application.getAndroidId();
    else if (Platform.OS === 'ios') id = await Application.getIosIdForVendorAsync();
  } catch {
    id = null;
  }
  if (!id) {
    try {
      id = Crypto.randomUUID();
    } catch {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }
  writeCache(DEVICE_ID_CACHE_KEY, id);
  return id;
}

interface CachedPushToken {
  token: string;
  deviceId: string;
  appVersion: string;
  userId: string | null;
  registeredAt: string;
}

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'skipped'; reason: 'unsupported_platform' | 'no_project_id' | 'not_a_device' | 'permission' | 'unchanged' }
  | { status: 'failed'; reason: string };

/**
 * Registers the Expo push token with the backend. Skips gracefully when the EAS project id is missing,
 * on simulators, without permission, or when the same token was registered recently for the same user.
 */
export async function registerPushToken(ds: DataSource, opts: { userId?: string | null; force?: boolean } = {}): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { status: 'skipped', reason: 'unsupported_platform' };
  if (!env.easProjectId) return { status: 'skipped', reason: 'no_project_id' };
  if (!Device.isDevice) return { status: 'skipped', reason: 'not_a_device' };
  try {
    if ((await getPermissionStatus()) !== 'granted') return { status: 'skipped', reason: 'permission' };
    const deviceId = await getDeviceId();
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: env.easProjectId });
    const userId = opts.userId ?? null;
    const cached = readCache<CachedPushToken>(PUSH_TOKEN_CACHE_KEY);
    const fresh = cached ? Date.now() - Date.parse(cached.registeredAt) < TOKEN_REFRESH_MS : false;
    if (!opts.force && cached && fresh && cached.token === token && cached.deviceId === deviceId && cached.appVersion === env.appVersion && cached.userId === userId) {
      return { status: 'skipped', reason: 'unchanged' };
    }
    await ds.profile.registerPushToken({
      token,
      platform: Platform.OS,
      deviceId,
      deviceName: Device.deviceName ?? undefined,
      appVersion: env.appVersion,
    });
    writeCache<CachedPushToken>(PUSH_TOKEN_CACHE_KEY, { token, deviceId, appVersion: env.appVersion, userId, registeredAt: new Date().toISOString() });
    return { status: 'registered', token };
  } catch (e) {
    captureError(e, { where: 'registerPushToken' });
    return { status: 'failed', reason: e instanceof Error ? e.name : 'unknown' };
  }
}

/** Removes this device's token server-side (call before signing out, while the session is still valid). */
export async function unregisterPushToken(ds: DataSource): Promise<void> {
  const cached = readCache<CachedPushToken>(PUSH_TOKEN_CACHE_KEY);
  try {
    if (cached) await ds.profile.unregisterPushToken(cached.deviceId);
  } catch (e) {
    captureError(e, { where: 'unregisterPushToken' });
  } finally {
    removeCache(PUSH_TOKEN_CACHE_KEY);
  }
}

// ---------------------------------------------------------------------------
// Local scheduling
// ---------------------------------------------------------------------------

export const localReminderIdentifier = (reminderId: string): string => `reminder:${reminderId}`;
export const meetingLeadIdentifier = (eventId: string): string => `meeting:${eventId}`;

export interface LocalReminderInput {
  id: string;
  title: string;
  body?: string | null;
  at: Date | string;
  deepLink: string;
  category?: NotificationCategory;
  quietHours?: QuietHoursPolicy;
}

function buildContent(text: NotificationText, data: Record<string, unknown>, silent: boolean, channel: NotificationChannelId): Notifications.NotificationContentInput {
  const content: Notifications.NotificationContentInput = {
    title: text.title,
    body: text.body ?? undefined,
    data,
    sound: silent ? false : 'default',
    interruptionLevel: silent ? 'passive' : 'active',
  };
  if (Platform.OS === 'android') {
    content.priority = silent ? Notifications.AndroidNotificationPriority.LOW : Notifications.AndroidNotificationPriority.HIGH;
    content.color = '#5B5CE2';
    content.vibrate = silent || channel === 'briefings' ? [] : [0, 200];
  }
  return content;
}

function buildTrigger(at: Date, channelId: NotificationChannelId): Notifications.NotificationTriggerInput {
  if (at.getTime() <= Date.now() + 1000) return Platform.OS === 'android' ? { channelId } : null;
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId };
}

/**
 * Schedules a local reminder (privacy-shaped, quiet-hours aware). Returns the notification identifier
 * or `null` when suppressed / unavailable. Re-scheduling the same id replaces the previous notification.
 */
export async function scheduleLocalReminder(input: LocalReminderInput): Promise<string | null> {
  const prefs = getCachedNotificationPreferences();
  const tz = userTimezone();
  const category = input.category ?? 'reminder';
  const delivery = resolveQuietHours(new Date(input.at), prefs, input.quietHours ?? 'defer', tz);
  if (!delivery || Number.isNaN(delivery.at.getTime())) return null;
  const channel = channelForCategory(category);
  const text = applyLockScreenPrivacy(input.title, input.body, prefs?.lockScreenPrivacy ?? 'full');
  const identifier = localReminderIdentifier(input.id);
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // nothing scheduled under this id yet
  }
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: buildContent(text, { deepLink: input.deepLink, category, reminderId: input.id }, delivery.silent, channel),
      trigger: buildTrigger(delivery.at, channel),
    });
    return identifier;
  } catch (e) {
    captureError(e, { where: 'scheduleLocalReminder' });
    return null;
  }
}

export async function cancelLocalReminder(reminderId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(localReminderIdentifier(reminderId));
  } catch (e) {
    captureError(e, { where: 'cancelLocalReminder' });
  }
}

function clockLabel(iso: string): string {
  try {
    return formatTime(iso, { locale: userLocale(), timezone: userTimezone() });
  } catch {
    return iso.slice(11, 16);
  }
}

type MeetingLeadCache = Record<string, string>;

/**
 * Schedules "{{time}} toplantına {{minutes}} dakika kaldı." before an event. Deduped per event + fire time,
 * cancelled events are removed. Quiet hours make it silent rather than late.
 */
export async function scheduleMeetingLeadNotification(event: Pick<CalendarEvent, 'id' | 'title' | 'startAt' | 'status'>, leadMinutes: number): Promise<string | null> {
  const identifier = meetingLeadIdentifier(event.id);
  const cache = readCache<MeetingLeadCache>(MEETING_LEAD_CACHE_KEY) ?? {};
  const fireAt = new Date(Date.parse(event.startAt) - Math.max(0, leadMinutes) * 60_000);
  if (event.status === 'cancelled' || Number.isNaN(fireAt.getTime()) || fireAt.getTime() <= Date.now()) {
    await cancelMeetingLeadNotification(event.id);
    return null;
  }
  const prefs = getCachedNotificationPreferences();
  const tz = userTimezone();
  const delivery = resolveQuietHours(fireAt, prefs, 'silent', tz);
  if (!delivery) return null;
  const stamp = `${delivery.at.toISOString()}|${delivery.silent ? 's' : 'a'}|${prefs?.lockScreenPrivacy ?? 'full'}`;
  if (cache[event.id] === stamp) return identifier;
  const text = applyLockScreenPrivacy(event.title, t('notifications.meetingNoPrep', { time: clockLabel(event.startAt), minutes: leadMinutes }), prefs?.lockScreenPrivacy ?? 'full');
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // nothing scheduled yet
  }
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: buildContent(text, { deepLink: `${env.appScheme}://meeting/${event.id}/prep`, category: 'meeting', eventId: event.id }, delivery.silent, 'meetings'),
      trigger: buildTrigger(delivery.at, 'meetings'),
    });
    writeCache<MeetingLeadCache>(MEETING_LEAD_CACHE_KEY, { ...cache, [event.id]: stamp });
    return identifier;
  } catch (e) {
    captureError(e, { where: 'scheduleMeetingLeadNotification' });
    return null;
  }
}

export async function cancelMeetingLeadNotification(eventId: string): Promise<void> {
  const cache = readCache<MeetingLeadCache>(MEETING_LEAD_CACHE_KEY);
  if (cache && eventId in cache) {
    const next = { ...cache };
    delete next[eventId];
    writeCache(MEETING_LEAD_CACHE_KEY, next);
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(meetingLeadIdentifier(eventId));
  } catch (e) {
    captureError(e, { where: 'cancelMeetingLeadNotification' });
  }
}

/** Sign-out hygiene: drop every locally scheduled notification and the dedupe cache. */
export async function cancelAllLocalNotifications(): Promise<void> {
  removeCache(MEETING_LEAD_CACHE_KEY);
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
  } catch (e) {
    captureError(e, { where: 'cancelAllLocalNotifications' });
  }
}

// ---------------------------------------------------------------------------
// Badge (= pending approvals)
// ---------------------------------------------------------------------------

let lastBadge: number | null = null;

export async function syncBadgeCount(pendingApprovals: number): Promise<void> {
  const count = Math.max(0, Math.floor(pendingApprovals));
  if (lastBadge === count) return;
  try {
    await Notifications.setBadgeCountAsync(count);
    lastBadge = count;
  } catch (e) {
    captureError(e, { where: 'syncBadgeCount' });
  }
}

export async function clearBadge(): Promise<void> {
  await syncBadgeCount(0);
}
