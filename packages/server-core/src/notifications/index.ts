/**
 * notifications — push payload builders, delivery policy and briefing scheduling.
 *
 * Payloads carry ids and deep links only; bodies never include mail content beyond what the
 * category copy in packages/i18n says (a person's name, a subject-free summary). Lock-screen
 * privacy can further reduce a payload to its title or to a generic line. iOS interruption level
 * is always `active` unless the app has the time-sensitive entitlement.
 */
import type {
  BriefingKind,
  BriefingSchedule,
  Importance,
  InsightStatus,
  LifeEventType,
  Locale,
  LockScreenPrivacy,
  NotificationCategory,
  NotificationPreferences,
} from '@da/domain';
import { DeepLinks } from '@da/domain';
import { formatDateLabel, formatDeadlinePhrase } from '../dates';
import { formatTimeSaved } from '../timeSaved';
import { MINUTE, localDateKey, localHHmm, localIsoWeekday, zonedTimeToUtc } from '../util';

// --- Copy (mirrors packages/i18n/src/locales/{tr,en}.json → notifications.*) ----------------------

const COPY = {
  tr: {
    appName: 'Dijital Asistan',
    morning: '☀️ Günaydın. Bugün bilmen gereken {count} şey var.',
    morningZero: '☀️ Günaydın. Bugün sakin bir gün.',
    critical: '{person} senden {deadline} dönüş bekliyor.',
    criticalNoDeadline: '{person} senden dönüş bekliyor.',
    meeting: '{time} toplantına {minutes} dakika kaldı. {count} hazırlık notun var.',
    meetingNoPrep: '{time} toplantına {minutes} dakika kaldı.',
    midday: 'Sabahından beri {count} önemli gelişme oldu.',
    middayNone: 'Sabahından beri önemli bir değişiklik olmadı.',
    evening: 'Bugünden yarına kalan {count} konu var.',
    weekly: 'Haftalık özetin hazır: {important} önemli konu, {saved} kazandın.',
    followUp: '{person} {days} gündür yanıt vermedi.',
    deadline: '{title} · {remaining}',
    shipment: 'Kargon bugün geliyor.',
    flight: 'Yarın {time} uçuşun var. Check-in açık.',
    payment: '{title} son ödeme {date}.',
    approval: 'Onayını bekleyen bir işlem var.',
    generic: "Dijital Asistan'da yeni bir gelişme var.",
    titleOnly: 'Yeni gelişme',
    overdue: 'süresi geçti',
    minutesLeft: '{n} dakika kaldı',
    hoursLeft: '{n} saat kaldı',
    daysLeft: '{n} gün kaldı',
    titles: {
      morning: 'Sabah brifingi',
      midday: 'Öğle nabzı',
      evening: 'Akşam kapanışı',
      weekly: 'Haftalık özet',
      critical_email: 'Önemli mail',
      meeting: 'Toplantı',
      deadline: 'Son tarih',
      follow_up: 'Takip',
      life_event: 'Kişisel gelişme',
      approval: 'Onay bekliyor',
      reminder: 'Hatırlatıcı',
    },
    lifeEventTitles: {
      shipment: 'Kargo',
      flight: 'Uçuş',
      reservation: 'Rezervasyon',
      payment: 'Ödeme',
      subscription: 'Abonelik',
      security: 'Güvenlik',
    },
  },
  en: {
    appName: 'Dijital Asistan',
    morning: '☀️ Good morning. {count} things to know today.',
    morningZero: '☀️ Good morning. A calm day ahead.',
    critical: '{person} expects a reply {deadline}.',
    criticalNoDeadline: '{person} is waiting for your reply.',
    meeting: 'Your {time} meeting starts in {minutes} minutes. {count} prep notes.',
    meetingNoPrep: 'Your {time} meeting starts in {minutes} minutes.',
    midday: '{count} important developments since this morning.',
    middayNone: 'Nothing important has changed since this morning.',
    evening: '{count} items carry over to tomorrow.',
    weekly: 'Your weekly review is ready: {important} important topics, {saved} saved.',
    followUp: "{person} hasn't replied in {days} days.",
    deadline: '{title} · {remaining}',
    shipment: 'Your package arrives today.',
    flight: 'Your flight is tomorrow at {time}. Check-in is open.',
    payment: '{title} is due {date}.',
    approval: 'An action is waiting for your approval.',
    generic: "There's a new update in Dijital Asistan.",
    titleOnly: 'New update',
    overdue: 'overdue',
    minutesLeft: '{n} minutes left',
    hoursLeft: '{n} hours left',
    daysLeft: '{n} days left',
    titles: {
      morning: 'Morning briefing',
      midday: 'Midday pulse',
      evening: 'Evening close',
      weekly: 'Weekly review',
      critical_email: 'Important email',
      meeting: 'Meeting',
      deadline: 'Deadline',
      follow_up: 'Follow-up',
      life_event: 'Personal update',
      approval: 'Approval needed',
      reminder: 'Reminder',
    },
    lifeEventTitles: {
      shipment: 'Delivery',
      flight: 'Flight',
      reservation: 'Reservation',
      payment: 'Payment',
      subscription: 'Subscription',
      security: 'Security',
    },
  },
} as const satisfies Record<Locale, unknown>;

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

// --- Payload model ---------------------------------------------------------------------------------

export type IosInterruptionLevel = 'passive' | 'active' | 'time-sensitive';

export interface NotificationPayload {
  category: NotificationCategory;
  locale: Locale;
  title: string;
  body: string;
  deepLink: string;
  /** `${category}:${entityId}:${localDate}` — one push per entity per local day. */
  dedupeKey: string;
  /** Data payload: ids and routes only, never content. */
  data: { category: NotificationCategory; deepLink: string; entityId: string };
  ios: { interruptionLevel: IosInterruptionLevel; threadId: string; relevanceScore: number };
  android: { channelId: string; priority: 'default' | 'high' };
  /** Later pushes for the same entity replace earlier ones on the device. */
  collapseId: string;
}

export interface NotificationContext {
  locale?: Locale;
  timezone: string;
  now: string;
  /** Only when the app carries the iOS time-sensitive entitlement. */
  timeSensitiveEntitlement?: boolean;
}

/** Categories that may use `time-sensitive` when the entitlement exists. */
export const TIME_SENSITIVE_CATEGORIES: readonly NotificationCategory[] = [
  'critical_email',
  'meeting',
  'deadline',
  'reminder',
];

const HIGH_PRIORITY_CATEGORIES: readonly NotificationCategory[] = [
  'critical_email',
  'meeting',
  'deadline',
  'reminder',
  'approval',
];

const RELEVANCE: Record<NotificationCategory, number> = {
  critical_email: 1,
  meeting: 0.9,
  deadline: 0.8,
  approval: 0.7,
  reminder: 0.7,
  life_event: 0.6,
  morning: 0.6,
  follow_up: 0.5,
  evening: 0.5,
  midday: 0.4,
  weekly: 0.3,
};

export function pushDedupeKey(
  category: NotificationCategory,
  entityId: string,
  dateKey: string,
): string {
  return `${category}:${entityId}:${dateKey}`;
}

export function androidChannelId(category: NotificationCategory): string {
  return `da_${category}`;
}

export function iosInterruptionLevel(
  category: NotificationCategory,
  timeSensitiveEntitlement: boolean | undefined,
): IosInterruptionLevel {
  return timeSensitiveEntitlement === true && TIME_SENSITIVE_CATEGORIES.includes(category)
    ? 'time-sensitive'
    : 'active';
}

interface PayloadParts {
  category: NotificationCategory;
  entityId: string;
  title: string;
  body: string;
  deepLink: string;
}

function makePayload(parts: PayloadParts, ctx: NotificationContext): NotificationPayload {
  const locale = ctx.locale ?? 'tr';
  const dedupeKey = pushDedupeKey(
    parts.category,
    parts.entityId,
    localDateKey(ctx.now, ctx.timezone),
  );
  return {
    category: parts.category,
    locale,
    title: parts.title,
    body: parts.body,
    deepLink: parts.deepLink,
    dedupeKey,
    data: { category: parts.category, deepLink: parts.deepLink, entityId: parts.entityId },
    ios: {
      interruptionLevel: iosInterruptionLevel(parts.category, ctx.timeSensitiveEntitlement),
      threadId: parts.category,
      relevanceScore: RELEVANCE[parts.category],
    },
    android: {
      channelId: androidChannelId(parts.category),
      priority: HIGH_PRIORITY_CATEGORIES.includes(parts.category) ? 'high' : 'default',
    },
    collapseId: dedupeKey,
  };
}

function copy(ctx: NotificationContext) {
  return COPY[ctx.locale ?? 'tr'];
}

// --- Builders ---------------------------------------------------------------------------------------

export function buildMorningNotification(
  input: { count: number; briefingId?: string | null },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  const count = Math.max(0, Math.round(input.count));
  return makePayload(
    {
      category: 'morning',
      entityId: input.briefingId ?? 'morning',
      title: c.titles.morning,
      body: count === 0 ? c.morningZero : fill(c.morning, { count }),
      deepLink: DeepLinks.briefing('morning', input.briefingId ?? undefined),
    },
    ctx,
  );
}

export function buildMiddayNotification(
  input: { count: number; briefingId?: string | null },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  const count = Math.max(0, Math.round(input.count));
  return makePayload(
    {
      category: 'midday',
      entityId: input.briefingId ?? 'midday',
      title: c.titles.midday,
      body: count === 0 ? c.middayNone : fill(c.midday, { count }),
      deepLink: DeepLinks.briefing('midday', input.briefingId ?? undefined),
    },
    ctx,
  );
}

export function buildEveningNotification(
  input: { count: number; briefingId?: string | null },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  return makePayload(
    {
      category: 'evening',
      entityId: input.briefingId ?? 'evening',
      title: c.titles.evening,
      body: fill(c.evening, { count: Math.max(0, Math.round(input.count)) }),
      deepLink: DeepLinks.briefing('evening', input.briefingId ?? undefined),
    },
    ctx,
  );
}

export function buildWeeklyNotification(
  input: { important: number; timeSavedMinutes: number; briefingId?: string | null },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  return makePayload(
    {
      category: 'weekly',
      entityId: input.briefingId ?? 'weekly',
      title: c.titles.weekly,
      body: fill(c.weekly, {
        important: Math.max(0, Math.round(input.important)),
        saved: formatTimeSaved(input.timeSavedMinutes, ctx.locale ?? 'tr'),
      }),
      deepLink: DeepLinks.briefing('weekly', input.briefingId ?? undefined),
    },
    ctx,
  );
}

export function buildCriticalEmailNotification(
  input: {
    threadId: string;
    person: string;
    deadlineAt?: string | null;
    deadlineHasTime?: boolean;
  },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  const locale = ctx.locale ?? 'tr';
  const body = input.deadlineAt
    ? fill(c.critical, {
        person: input.person,
        deadline: formatDeadlinePhrase(input.deadlineAt, {
          now: ctx.now,
          timezone: ctx.timezone,
          locale,
          hasTime: input.deadlineHasTime ?? true,
        }),
      })
    : fill(c.criticalNoDeadline, { person: input.person });
  return makePayload(
    {
      category: 'critical_email',
      entityId: input.threadId,
      title: c.titles.critical_email,
      body,
      deepLink: DeepLinks.email(input.threadId),
    },
    ctx,
  );
}

export function buildMeetingNotification(
  input: { eventId: string; startAt: string; minutesBefore: number; prepCount: number },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  const vars = {
    time: localHHmm(input.startAt, ctx.timezone),
    minutes: Math.max(0, Math.round(input.minutesBefore)),
    count: Math.max(0, Math.round(input.prepCount)),
  };
  return makePayload(
    {
      category: 'meeting',
      entityId: input.eventId,
      title: c.titles.meeting,
      body: fill(vars.count > 0 ? c.meeting : c.meetingNoPrep, vars),
      deepLink: DeepLinks.meetingPrep(input.eventId),
    },
    ctx,
  );
}

/** "3 saat kaldı" / "yarın" style remaining label for deadlines. */
export function remainingLabel(dueAt: string, ctx: NotificationContext): string {
  const c = copy(ctx);
  const diffMin = Math.round((Date.parse(dueAt) - Date.parse(ctx.now)) / MINUTE);
  if (diffMin < 0) return c.overdue;
  if (diffMin < 60) return fill(c.minutesLeft, { n: Math.max(1, diffMin) });
  if (diffMin < 24 * 60) return fill(c.hoursLeft, { n: Math.round(diffMin / 60) });
  return fill(c.daysLeft, { n: Math.round(diffMin / (24 * 60)) });
}

export function buildDeadlineNotification(
  input: { entityId: string; title: string; dueAt: string; deepLink?: string | null },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  return makePayload(
    {
      category: 'deadline',
      entityId: input.entityId,
      title: c.titles.deadline,
      body: fill(c.deadline, { title: input.title, remaining: remainingLabel(input.dueAt, ctx) }),
      deepLink: input.deepLink ?? DeepLinks.today(),
    },
    ctx,
  );
}

export function buildFollowUpNotification(
  input: { followUpId: string; person: string; days: number; threadId?: string | null },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  return makePayload(
    {
      category: 'follow_up',
      entityId: input.followUpId,
      title: c.titles.follow_up,
      body: fill(c.followUp, { person: input.person, days: Math.max(1, Math.round(input.days)) }),
      deepLink: input.threadId ? DeepLinks.email(input.threadId) : DeepLinks.followUps(),
    },
    ctx,
  );
}

export function buildLifeEventNotification(
  input: { lifeEventId: string; type: LifeEventType; title: string; at?: string | null },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  const locale = ctx.locale ?? 'tr';
  let body: string;
  switch (input.type) {
    case 'shipment':
      body = c.shipment;
      break;
    case 'flight':
      body = input.at ? fill(c.flight, { time: localHHmm(input.at, ctx.timezone) }) : input.title;
      break;
    case 'payment':
      body = input.at
        ? fill(c.payment, {
            title: input.title,
            date: formatDateLabel(input.at, { now: ctx.now, timezone: ctx.timezone, locale }),
          })
        : input.title;
      break;
    case 'reservation':
    case 'subscription':
    case 'security':
      body = input.title;
      break;
  }
  return makePayload(
    {
      category: 'life_event',
      entityId: input.lifeEventId,
      title: c.lifeEventTitles[input.type],
      body,
      deepLink: DeepLinks.lifeEvent(input.lifeEventId),
    },
    ctx,
  );
}

export function buildApprovalNotification(
  input: { approvalId: string },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  return makePayload(
    {
      category: 'approval',
      entityId: input.approvalId,
      title: c.titles.approval,
      body: c.approval,
      deepLink: DeepLinks.approval(input.approvalId),
    },
    ctx,
  );
}

export function buildReminderNotification(
  input: { reminderId: string; title: string; deepLink?: string | null },
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  return makePayload(
    {
      category: 'reminder',
      entityId: input.reminderId,
      title: c.titles.reminder,
      body: input.title,
      deepLink: input.deepLink ?? DeepLinks.today(),
    },
    ctx,
  );
}

export function buildGenericNotification(
  category: NotificationCategory,
  entityId: string,
  ctx: NotificationContext,
): NotificationPayload {
  const c = copy(ctx);
  return makePayload(
    { category, entityId, title: c.titles[category], body: c.generic, deepLink: DeepLinks.today() },
    ctx,
  );
}

// --- Lock-screen privacy ------------------------------------------------------------------------------

/**
 * full → unchanged · title_only → category title with a neutral body · generic → app name and a
 * neutral line. Deep links and ids are kept (they carry no content).
 */
export function applyLockScreenPrivacy(
  payload: NotificationPayload,
  mode: LockScreenPrivacy,
): NotificationPayload {
  const c = COPY[payload.locale];
  switch (mode) {
    case 'full':
      return { ...payload };
    case 'title_only':
      return { ...payload, title: c.titles[payload.category], body: c.titleOnly };
    case 'generic':
      return { ...payload, title: c.appName, body: c.generic };
  }
}

// --- Quiet hours -------------------------------------------------------------------------------------

export interface QuietHoursConfig {
  enabled: boolean;
  /** "22:00" */
  start: string;
  /** "08:00" */
  end: string;
}

function hhmmToMinutes(hhmm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function localMinutes(iso: string, timezone: string): number | null {
  return hhmmToMinutes(localHHmm(iso, timezone));
}

/** Overnight-safe: 22:00–08:00 covers 23:30 and 07:59; 12:00–14:00 covers only midday. */
export function isQuietHours(nowIso: string, quiet: QuietHoursConfig, timezone: string): boolean {
  if (!quiet.enabled) return false;
  const start = hhmmToMinutes(quiet.start);
  const end = hhmmToMinutes(quiet.end);
  const t = localMinutes(nowIso, timezone);
  if (start === null || end === null || t === null || start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** When `nowIso` is inside quiet hours, the instant they end; otherwise `nowIso` itself. */
export function nextQuietHoursEnd(
  nowIso: string,
  quiet: QuietHoursConfig,
  timezone: string,
): string {
  if (!isQuietHours(nowIso, quiet, timezone)) return nowIso;
  const t = localMinutes(nowIso, timezone) ?? 0;
  const end = hhmmToMinutes(quiet.end) ?? 0;
  const today = localDateKey(nowIso, timezone);
  const endToday = zonedTimeToUtc(today, quiet.end, timezone);
  if (t < end) return endToday;
  const tomorrow = localDateKey(
    new Date(Date.parse(nowIso) + 24 * 60 * MINUTE).toISOString(),
    timezone,
  );
  return zonedTimeToUtc(tomorrow, quiet.end, timezone);
}

// --- Delivery policy -----------------------------------------------------------------------------------

export type NotificationPrefsInput = Pick<
  NotificationPreferences,
  'categories' | 'onlyWhenImportant' | 'quietHoursEnabled' | 'quietHoursStart' | 'quietHoursEnd'
> &
  Partial<Pick<NotificationPreferences, 'systemPermissionGranted'>>;

export interface ShouldSendInput {
  category: NotificationCategory;
  prefs: NotificationPrefsInput;
  importance?: Importance | null;
  entitlement: { isPro: boolean };
  now: string;
  timezone: string;
  /** Overrides everything except the category toggle and the system permission. */
  isCritical?: boolean;
}

export type SuppressReason =
  'system_permission' | 'category_off' | 'pro_required' | 'only_important' | 'quiet_hours';

export type SendDecision =
  { send: true } | { send: false; reason: SuppressReason; deferUntil?: string };

export const PRO_ONLY_CATEGORIES: readonly NotificationCategory[] = ['midday', 'evening', 'weekly'];

/** Event-driven categories that "only when important" applies to (scheduled briefings, approvals and the user's own reminders are exempt). */
export const IMPORTANCE_GATED_CATEGORIES: readonly NotificationCategory[] = [
  'critical_email',
  'meeting',
  'deadline',
  'follow_up',
  'life_event',
];

/**
 * Decide whether a push may go out now. Order: system permission → category toggle → Pro gating →
 * "only when important" → quiet hours. Quiet-hour suppression carries `deferUntil` so scheduled
 * briefings can be delivered when the window ends instead of being lost.
 */
export function shouldSend(input: ShouldSendInput): SendDecision {
  const { prefs, category } = input;
  const critical = input.isCritical === true || input.importance === 'critical';
  if (prefs.systemPermissionGranted === false) return { send: false, reason: 'system_permission' };
  if (prefs.categories[category] === false) return { send: false, reason: 'category_off' };
  if (PRO_ONLY_CATEGORIES.includes(category) && !input.entitlement.isPro)
    return { send: false, reason: 'pro_required' };
  if (prefs.onlyWhenImportant && IMPORTANCE_GATED_CATEGORIES.includes(category)) {
    const important = critical || input.importance === 'high';
    if (!important) return { send: false, reason: 'only_important' };
  }
  const quiet: QuietHoursConfig = {
    enabled: prefs.quietHoursEnabled,
    start: prefs.quietHoursStart,
    end: prefs.quietHoursEnd,
  };
  if (!critical && isQuietHours(input.now, quiet, input.timezone)) {
    return {
      send: false,
      reason: 'quiet_hours',
      deferUntil: nextQuietHoursEnd(input.now, quiet, input.timezone),
    };
  }
  return { send: true };
}

// --- Midday delta ------------------------------------------------------------------------------------------

export interface MiddayDelta {
  changed: { added: string[]; resolved: string[] };
  hasChanges: boolean;
}

/**
 * What changed since the morning briefing: insights that appeared (active now, unknown this
 * morning) and morning insights that are no longer active (completed, dismissed, snoozed, expired
 * or gone).
 */
export function computeMiddayDelta(
  morningInsightIds: readonly string[],
  currentInsights: readonly { id: string; status: InsightStatus }[],
): MiddayDelta {
  const morning = new Set(morningInsightIds);
  const activeNow = new Set(currentInsights.filter((i) => i.status === 'active').map((i) => i.id));
  const added = [...activeNow].filter((id) => !morning.has(id));
  const resolved = [...morning].filter((id) => !activeNow.has(id));
  return { changed: { added, resolved }, hasChanges: added.length > 0 || resolved.length > 0 };
}

// --- Briefing schedule ---------------------------------------------------------------------------------------

export interface DueBriefingsInput {
  schedule: BriefingSchedule;
  timezone: string;
  now: string;
  /** Local date keys (YYYY-MM-DD) of the last send per kind. */
  lastSent: Partial<Record<BriefingKind, string | null>>;
  /** Minutes after the scheduled time during which the send is still considered due (default 15). */
  toleranceMin?: number;
}

/**
 * Which briefings the cron should send right now. Quiet days silence everything; weekends silence
 * the daily briefings unless `weekendEnabled`; the weekly review fires on `weeklyDay` regardless of
 * the weekend switch. Each kind is sent at most once per local day.
 */
export function dueBriefings(input: DueBriefingsInput): BriefingKind[] {
  const { schedule, timezone } = input;
  const tolerance = Math.max(0, input.toleranceMin ?? 15) * MINUTE;
  const nowMs = Date.parse(input.now);
  const today = localDateKey(input.now, timezone);
  const weekday = localIsoWeekday(input.now, timezone);
  if (schedule.quietDays.includes(weekday)) return [];

  const dueAt = (time: string): boolean => {
    if (hhmmToMinutes(time) === null) return false;
    const at = Date.parse(zonedTimeToUtc(today, time, timezone));
    return nowMs >= at && nowMs <= at + tolerance;
  };
  const notSentToday = (kind: BriefingKind): boolean => input.lastSent[kind] !== today;

  const out: BriefingKind[] = [];
  const dailyAllowed = weekday < 6 || schedule.weekendEnabled;
  if (dailyAllowed) {
    if (dueAt(schedule.morningTime) && notSentToday('morning')) out.push('morning');
    if (schedule.middayEnabled && dueAt(schedule.middayTime) && notSentToday('midday'))
      out.push('midday');
    if (schedule.eveningEnabled && dueAt(schedule.eveningTime) && notSentToday('evening'))
      out.push('evening');
  }
  const weeklyIsoDay = schedule.weeklyDay === 0 ? 7 : schedule.weeklyDay;
  if (
    schedule.weeklyEnabled &&
    weekday === weeklyIsoDay &&
    dueAt(schedule.weeklyTime) &&
    notSentToday('weekly')
  )
    out.push('weekly');
  return out;
}
