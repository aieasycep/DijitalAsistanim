/**
 * insights — turn analysed threads, events, tasks, promises, follow-ups, life events, conflicts and
 * schedule suggestions into Today / Flow cards (Insight drafts), group them into the Today feed,
 * filter the Flow and bucket mail intelligence. Pure functions; ranking is injected from the
 * priority engine so explicit rules, VIPs and learned preferences apply uniformly.
 */
import type {
  Briefing,
  CalendarConflict,
  CalendarEvent,
  Commitment,
  EmailThread,
  FlowFilter,
  FollowUp,
  Importance,
  Insight,
  InsightAction,
  LifeEvent,
  Locale,
  MailIntelligenceCategory,
  MailIntelligenceResponse,
  ScheduleSuggestion,
  SourceRef,
  SourceType,
  TaskItem,
  TodayFeed,
  UUID,
} from '@da/domain';
import { durationMinutes, externalAttendees, hasPhysicalLocation, isSchedulable } from '../calendar';
import { MONTHS_EN_TITLE, MONTHS_TR_TITLE, WEEKDAYS_EN_TITLE, WEEKDAYS_TR_TITLE, daysBetween, formatClock, formatDateLabel, formatDayLabel, isoWeekday, localDateOf } from '../dates';
import { followUpBrief, followUpReason, followUpWaitLabel, refreshFollowUpStatus, stripSubjectPrefixes } from '../followups';
import type { PriorityCandidate, PriorityResult } from '../priority';
import { DAY, HOUR, MINUTE, emailDomain, localDateKey, localHHmm, localHour } from '../util';

export type InsightDraft = Omit<Insight, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type RankOutcome = Pick<PriorityResult, 'score' | 'tier' | 'reasons' | 'muted'>;
export type RankFn = (candidate: PriorityCandidate) => RankOutcome;
export type InsightBadge = Insight['badge'];
export type InsightTag = Insight['tags'][number];

export const DEFAULT_HORIZON_DAYS = 7;
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface BuildInsightsInput {
  threads?: readonly EmailThread[];
  events?: readonly CalendarEvent[];
  tasks?: readonly TaskItem[];
  commitments?: readonly Commitment[];
  followUps?: readonly FollowUp[];
  lifeEvents?: readonly LifeEvent[];
  conflicts?: readonly CalendarConflict[];
  suggestions?: readonly ScheduleSuggestion[];
  now: string;
  timezone: string;
  locale?: Locale;
  rank: RankFn;
  /** The user's own addresses — to find counterparts and their own attendee entry. */
  userEmails?: readonly string[];
  /** Provider per account id (Gmail vs Outlook). Default gmail. */
  accountSourceTypes?: Readonly<Record<UUID, SourceType>>;
  /** Look-ahead for events / deadlines in days (default 7). */
  horizonDays?: number;
}

interface Ctx {
  now: string;
  nowMs: number;
  timezone: string;
  locale: Locale;
  en: boolean;
  rank: RankFn;
  userEmails: Set<string>;
  accountSourceTypes: Readonly<Record<UUID, SourceType>>;
  horizonMs: number;
  forDate: string;
  lifeEventSourceIds: Set<string>;
  events: readonly CalendarEvent[];
}

function ms(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

function lower(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function capitalize(s: string): string {
  const first = s[0] ?? '';
  return first.toLocaleUpperCase('tr-TR') + s.slice(1);
}

const TIER_RANK: Record<Importance, number> = { low: 0, normal: 1, high: 2, critical: 3 };

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<Locale, Record<SourceType, string>> = {
  tr: {
    gmail: 'Gmail',
    outlook: 'Outlook',
    google_calendar: 'Google Takvim',
    microsoft_calendar: 'Microsoft Takvim',
    apple_calendar: 'Apple Takvim',
    device_calendar: 'Cihaz Takvimi',
    google_tasks: 'Google Tasks',
    microsoft_todo: 'Microsoft To Do',
    apple_reminders: 'Apple Anımsatıcılar',
    android_notification: 'Bildirim',
    capture: 'Yakalama',
    assistant: 'Asistan',
    meeting_note: 'Toplantı notu',
    user: 'Sen',
  },
  en: {
    gmail: 'Gmail',
    outlook: 'Outlook',
    google_calendar: 'Google Calendar',
    microsoft_calendar: 'Microsoft Calendar',
    apple_calendar: 'Apple Calendar',
    device_calendar: 'Device Calendar',
    google_tasks: 'Google Tasks',
    microsoft_todo: 'Microsoft To Do',
    apple_reminders: 'Apple Reminders',
    android_notification: 'Notification',
    capture: 'Capture',
    assistant: 'Assistant',
    meeting_note: 'Meeting note',
    user: 'You',
  },
};

export function sourceLabel(type: SourceType, locale: Locale = 'tr'): string {
  return SOURCE_LABELS[locale][type];
}

/** Source label for a life event: carrier bucket "Kargo", the airline for flights, else the provider label. */
export function lifeEventSourceLabel(lifeEvent: Pick<LifeEvent, 'type' | 'details' | 'source'>, locale: Locale = 'tr'): string {
  const en = locale === 'en';
  switch (lifeEvent.type) {
    case 'shipment':
      return en ? 'Shipping' : 'Kargo';
    case 'flight':
      return lifeEvent.details.airline?.trim() || (en ? 'Flight' : 'Uçuş');
    case 'reservation':
      return en ? 'Reservation' : 'Rezervasyon';
    default:
      return sourceLabel(lifeEvent.source.type, locale);
  }
}

const BADGE_LABELS: Record<Locale, Record<InsightBadge, string>> = {
  tr: { urgent: 'Acil', deadline: 'Son tarih', meeting: 'Toplantı', follow_up: 'Takip', personal: 'Kişisel', commitment: 'Taahhüt', calendar: 'Takvim', security: 'Güvenlik', waiting: 'Bekliyor' },
  en: { urgent: 'Urgent', deadline: 'Deadline', meeting: 'Meeting', follow_up: 'Follow-up', personal: 'Personal', commitment: 'Commitment', calendar: 'Calendar', security: 'Security', waiting: 'Waiting' },
};

export function badgeLabel(badge: InsightBadge, locale: Locale = 'tr'): string {
  return BADGE_LABELS[locale][badge];
}

const MONTH_ABBR: Record<Locale, readonly string[]> = {
  tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export interface TimeLabelOptions {
  now: string;
  timezone: string;
  locale?: Locale;
  /** False when the instant is a whole-day value (clock hidden). Default: detected (23:59 / 00:00 count as no time). */
  hasTime?: boolean;
}

/** True unless the local clock is 00:00 or 23:59 (whole-day deadlines). */
export function hasClockTime(iso: string, timezone: string): boolean {
  const hhmm = localHHmm(iso, timezone);
  return hhmm !== '00:00' && hhmm !== '23:59';
}

/** "08:42" today · "Yarın 12:00" · "Dün 15:40" · "2 Eyl" (+ time when relevant). */
export function timeLabel(iso: string, opts: TimeLabelOptions): string {
  const locale = opts.locale ?? 'tr';
  const en = locale === 'en';
  const today = localDateOf(opts.now, opts.timezone);
  const target = localDateOf(iso, opts.timezone);
  const diff = daysBetween(today, target);
  const hasTime = opts.hasTime ?? hasClockTime(iso, opts.timezone);
  const clock = formatClock(iso, opts.timezone);
  if (diff === 0) return hasTime ? clock : en ? 'Today' : 'Bugün';
  if (diff === 1) return hasTime ? `${en ? 'Tomorrow' : 'Yarın'} ${clock}` : en ? 'Tomorrow' : 'Yarın';
  if (diff === -1) return hasTime ? `${en ? 'Yesterday' : 'Dün'} ${clock}` : en ? 'Yesterday' : 'Dün';
  const month = MONTH_ABBR[locale][target.m - 1] ?? '';
  return en ? `${target.d} ${month}` : `${target.d} ${month}`;
}

/** "Bugün 17:00" · "Yarın 09:15" · "10 Eylül" — relative for today/tomorrow, absolute otherwise (clock only when meaningful). */
export function formatDayOrDate(iso: string, opts: TimeLabelOptions): string {
  const locale = opts.locale ?? 'tr';
  const en = locale === 'en';
  const today = localDateOf(opts.now, opts.timezone);
  const target = localDateOf(iso, opts.timezone);
  const diff = daysBetween(today, target);
  const hasTime = opts.hasTime ?? hasClockTime(iso, opts.timezone);
  const clock = hasTime ? ` ${formatClock(iso, opts.timezone)}` : '';
  if (diff === 0) return `${en ? 'Today' : 'Bugün'}${clock}`;
  if (diff === 1) return `${en ? 'Tomorrow' : 'Yarın'}${clock}`;
  if (diff === -1) return `${en ? 'Yesterday' : 'Dün'}${clock}`;
  const month = (en ? MONTHS_EN_TITLE : MONTHS_TR_TITLE)[target.m - 1] ?? '';
  const year = target.y !== today.y ? ` ${target.y}` : '';
  return `${target.d} ${month}${year}${clock}`;
}

/** "5 Eylül Cumartesi" / "Saturday 5 September". */
export function dateLabel(iso: string, timezone: string, locale: Locale = 'tr'): string {
  const d = localDateOf(iso, timezone);
  const wd = isoWeekday(d) - 1;
  if (locale === 'en') return `${WEEKDAYS_EN_TITLE[wd] ?? ''} ${d.d} ${MONTHS_EN_TITLE[d.m - 1] ?? ''}`;
  return `${d.d} ${MONTHS_TR_TITLE[d.m - 1] ?? ''} ${WEEKDAYS_TR_TITLE[wd] ?? ''}`;
}

/** "Günaydın, Yunus" (< 12) · "İyi günler, Yunus" (< 18) · "İyi akşamlar, Yunus". */
export function greetingFor(now: string, timezone: string, userName: string, locale: Locale = 'tr'): string {
  const hour = localHour(now, timezone);
  const name = userName.trim();
  const en = locale === 'en';
  const word = hour < 12 ? (en ? 'Good morning' : 'Günaydın') : hour < 18 ? (en ? 'Good afternoon' : 'İyi günler') : en ? 'Good evening' : 'İyi akşamlar';
  return name ? `${word}, ${name}` : word;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ActionKey =
  | 'reply'
  | 'remind'
  | 'remindMorning'
  | 'remindTomorrow'
  | 'prepare'
  | 'addToCalendar'
  | 'followUp'
  | 'track'
  | 'checkIn'
  | 'alarm'
  | 'openBill'
  | 'review'
  | 'openSource'
  | 'plan'
  | 'postpone'
  | 'later'
  | 'seeOptions'
  | 'ignore'
  | 'complete'
  | 'askInMeeting'
  | 'viewSource';

const ACTION_LABELS: Record<Locale, Record<ActionKey, string>> = {
  tr: {
    reply: 'Yanıtla',
    remind: 'Hatırlat',
    remindMorning: 'Sabah Hatırlat',
    remindTomorrow: 'Yarın Hatırlat',
    prepare: 'Hazırlan',
    addToCalendar: 'Takvime Ekle',
    followUp: 'Takip Mesajı Hazırla',
    track: 'Takip Et',
    checkIn: 'Check-in',
    alarm: 'Alarm Kur',
    openBill: 'Faturayı Aç',
    review: 'İncele',
    openSource: 'Kaynağı Aç',
    plan: 'Planla',
    postpone: 'Ertele',
    later: 'Başka zaman',
    seeOptions: 'Seçenekleri Gör',
    ignore: 'Yoksay',
    complete: 'Tamamlandı',
    askInMeeting: 'Toplantıda Sor',
    viewSource: 'Kaynağı Gör',
  },
  en: {
    reply: 'Reply',
    remind: 'Remind me',
    remindMorning: 'Remind in the morning',
    remindTomorrow: 'Remind tomorrow',
    prepare: 'Prepare',
    addToCalendar: 'Add to calendar',
    followUp: 'Draft follow-up',
    track: 'Track',
    checkIn: 'Check-in',
    alarm: 'Set alarm',
    openBill: 'Open bill',
    review: 'Review',
    openSource: 'Open source',
    plan: 'Schedule',
    postpone: 'Postpone',
    later: 'Another time',
    seeOptions: 'See options',
    ignore: 'Ignore',
    complete: 'Done',
    askInMeeting: 'Ask in meeting',
    viewSource: 'View source',
  },
};

const ACTION_KIND: Record<ActionKey, InsightAction['kind']> = {
  reply: 'reply',
  remind: 'remind',
  remindMorning: 'remind',
  remindTomorrow: 'remind',
  prepare: 'prepare',
  addToCalendar: 'add_to_calendar',
  followUp: 'follow_up',
  track: 'track',
  checkIn: 'check_in',
  alarm: 'alarm',
  openBill: 'open_link',
  review: 'open_link',
  openSource: 'open_original',
  plan: 'plan',
  postpone: 'postpone',
  later: 'snooze',
  seeOptions: 'see_options',
  ignore: 'snooze',
  complete: 'complete',
  askInMeeting: 'ask_in_meeting',
  viewSource: 'view_source',
};

function act(locale: Locale, key: ActionKey, primary: boolean, payload?: Record<string, unknown>): InsightAction {
  return { id: key, label: ACTION_LABELS[locale][key], kind: ACTION_KIND[key], primary, ...(payload ? { payload } : {}) };
}

// ---------------------------------------------------------------------------
// Draft assembly
// ---------------------------------------------------------------------------

interface DraftSeed {
  kind: Insight['kind'];
  badge: InsightBadge;
  title: string;
  subtitle: string | null;
  reason: string | null;
  timeLabel: string | null;
  dueAt: string | null;
  source: SourceRef;
  actions: InsightAction[];
  entityType: Insight['entityType'];
  entityId: string;
  tags: InsightTag[];
  confidence: number;
  candidate: PriorityCandidate;
}

function finish(seed: DraftSeed, ranked: RankOutcome, ctx: Ctx): InsightDraft {
  const tags = new Set<InsightTag>(seed.tags);
  if (TIER_RANK[ranked.tier] >= TIER_RANK.high || seed.badge === 'urgent' || seed.badge === 'security' || seed.badge === 'deadline') tags.add('important');
  const confidence = Math.max(0, Math.min(1, seed.confidence));
  return {
    kind: seed.kind,
    badge: seed.badge,
    title: seed.title,
    subtitle: seed.subtitle,
    reason: seed.reason ?? ranked.reasons[0] ?? null,
    importance: ranked.tier,
    priorityScore: ranked.score,
    priorityReasons: ranked.reasons,
    timeLabel: seed.timeLabel,
    dueAt: seed.dueAt,
    status: 'active',
    snoozedUntil: null,
    source: seed.source,
    actions: seed.actions.slice(0, 2),
    entityType: seed.entityType,
    entityId: seed.entityId,
    tags: [...tags],
    forDate: ctx.forDate,
    confidence,
    isLowConfidence: confidence < LOW_CONFIDENCE_THRESHOLD,
    dedupeKey: `${seed.kind}:${seed.entityType}:${seed.entityId}`,
  };
}

function withinHorizon(iso: string | null | undefined, ctx: Ctx, opts: { pastDays?: number } = {}): boolean {
  const t = ms(iso);
  if (Number.isNaN(t)) return false;
  const past = (opts.pastDays ?? 0) * DAY;
  return t >= ctx.nowMs - past && t <= ctx.nowMs + ctx.horizonMs;
}

function isToday(iso: string | null | undefined, ctx: Ctx): boolean {
  return !!iso && !Number.isNaN(ms(iso)) && localDateKey(iso, ctx.timezone) === ctx.forDate;
}

function fmt(ctx: Ctx): { now: string; timezone: string; locale: Locale } {
  return { now: ctx.now, timezone: ctx.timezone, locale: ctx.locale };
}

function tl(iso: string, ctx: Ctx, hasTime?: boolean): string {
  return timeLabel(iso, { ...fmt(ctx), hasTime });
}

// --- email threads --------------------------------------------------------------------------

const LIFE_CATEGORIES = new Set(['shipment', 'travel', 'payment', 'subscription']);

function counterpart(thread: EmailThread, ctx: Ctx): EmailThread['participants'][number] | null {
  for (const p of thread.participants) {
    if (ctx.userEmails.has(lower(p.email))) continue;
    return p;
  }
  return thread.participants[0] ?? null;
}

function relatedMeeting(senderEmail: string, ctx: Ctx): CalendarEvent | null {
  if (!senderEmail) return null;
  for (const e of ctx.events) {
    if (!isSchedulable(e)) continue;
    const start = ms(e.startAt);
    if (start < ctx.nowMs - HOUR || start > ctx.nowMs + 72 * HOUR) continue;
    if (e.attendees.some((a) => lower(a.email) === senderEmail)) return e;
  }
  return null;
}

function threadSeed(thread: EmailThread, ctx: Ctx): DraftSeed | null {
  if (thread.deletedAt || thread.userDismissed || thread.userMarkedDone || thread.triage === 'skip') return null;
  if (thread.lastFromUser) return null;
  const analysis = thread.analysis ?? null;
  const importance = analysis?.importance ?? thread.importance;
  const category = analysis?.category ?? thread.category;
  if (category === 'promotion') return null;
  if (LIFE_CATEGORIES.has(category) && ctx.lifeEventSourceIds.has(thread.id)) return null;
  const requiresUserAction = analysis?.requiresUserAction ?? (category === 'action_required' || category === 'waiting_for_user');
  const deadlineAt = analysis?.deadline && !Number.isNaN(ms(analysis.deadline)) ? analysis.deadline : null;
  const isSecurity = category === 'security';
  const include = isSecurity || !!deadlineAt || requiresUserAction || category === 'action_required' || category === 'waiting_for_user' || category === 'meeting' || importance === 'critical' || LIFE_CATEGORIES.has(category);
  if (!include) return null;

  const sender = counterpart(thread, ctx);
  const senderEmail = lower(sender?.email);
  const senderName = sender?.name?.trim() || sender?.email || (ctx.en ? 'Unknown sender' : 'Bilinmeyen gönderici');
  const labels = thread.labels.map((l) => l.toLowerCase());
  const isNewsletter = labels.some((l) => l.includes('newsletter') || l.includes('bülten') || l.includes('bulten'));
  const meeting = relatedMeeting(senderEmail, ctx);
  const confidence = analysis?.confidence ?? (thread.triage === 'rules' ? 0.7 : 0.5);
  const hasTime = deadlineAt ? hasClockTime(deadlineAt, ctx.timezone) : true;
  const candidate: PriorityCandidate = {
    id: thread.id,
    kind: 'email',
    category,
    importance,
    deadlineAt,
    deadlineHasTime: hasTime,
    senderEmail: senderEmail || null,
    senderDomain: senderEmail ? emailDomain(senderEmail) : null,
    senderName,
    contactId: null,
    threadId: thread.id,
    requiresUserAction,
    isUserCommitment: false,
    relatedMeetingAt: meeting?.startAt ?? null,
    isPromotion: false,
    isNewsletter,
    confidence,
    ageHours: Math.max(0, (ctx.nowMs - ms(thread.lastMessageAt)) / HOUR),
    text: `${thread.subject} ${thread.snippet}`,
  };

  const dueToday = !!deadlineAt && isToday(deadlineAt, ctx);
  const overdue = !!deadlineAt && ms(deadlineAt) < ctx.nowMs;
  let kind: Insight['kind'] = 'priority';
  let badge: InsightBadge;
  if (isSecurity) {
    kind = 'security';
    badge = 'security';
  } else if (LIFE_CATEGORIES.has(category)) {
    kind = 'life_event';
    badge = 'personal';
  } else if (importance === 'critical' || (requiresUserAction && (category === 'action_required' || category === 'waiting_for_user') && (dueToday || overdue))) {
    kind = category === 'waiting_for_user' ? 'waiting_for_user' : category === 'deadline' ? 'deadline' : 'priority';
    badge = 'urgent';
  } else if (category === 'deadline' || (deadlineAt && !requiresUserAction)) {
    kind = 'deadline';
    badge = 'deadline';
  } else if (category === 'meeting') {
    kind = 'meeting';
    badge = 'meeting';
  } else if (category === 'waiting_for_user') {
    kind = 'waiting_for_user';
    badge = 'waiting';
  } else if (deadlineAt) {
    kind = 'deadline';
    badge = 'deadline';
  } else {
    kind = 'priority';
    badge = 'waiting';
  }

  const subject = stripSubjectPrefixes(thread.subject);
  const summary = analysis?.summary?.trim();
  const title = summary || (isSecurity ? (ctx.en ? `Security alert: ${subject}` : `Güvenlik uyarısı: ${subject}`) : `${senderName}: ${subject}`);
  let subtitle: string | null = null;
  if (deadlineAt && category !== 'deadline') {
    subtitle = ctx.en ? `Due: ${formatDateLabel(deadlineAt, { ...fmt(ctx), withTime: hasTime })}` : `Son tarih: ${formatDateLabel(deadlineAt, { ...fmt(ctx), withTime: hasTime })}`;
  } else if (requiresUserAction && !deadlineAt) {
    const days = Math.floor(candidate.ageHours / 24);
    if (days >= 1) subtitle = ctx.en ? `Waiting ${days} ${days === 1 ? 'day' : 'days'}` : `${days} gündür bekliyor`;
  }
  const sourceType = ctx.accountSourceTypes[thread.accountId] ?? 'gmail';
  const actions: InsightAction[] = [];
  const isWaiting = badge === 'waiting' || kind === 'waiting_for_user';
  if (isSecurity) actions.push(act(ctx.locale, 'openSource', true));
  else if (kind === 'deadline') actions.push(act(ctx.locale, 'addToCalendar', true, { deadlineAt }));
  else if (LIFE_CATEGORIES.has(category)) actions.push(...lifeCategoryActions(category, ctx));
  else if (isWaiting) actions.push(act(ctx.locale, 'reply', true), act(ctx.locale, 'remindMorning', false, { option: 'tomorrow_morning' }));
  else actions.push(act(ctx.locale, 'reply', true), act(ctx.locale, 'remind', false));

  const tags: InsightTag[] = ['mail'];
  if (isSecurity || LIFE_CATEGORIES.has(category)) tags.push('personal');
  // Deadline cards show the deadline; an urgent mail due today shows when it arrived ("08:42");
  // a later deadline ("Yarın 12:00") is more useful than the arrival time.
  const label = kind === 'deadline' && deadlineAt ? tl(deadlineAt, ctx, hasTime) : deadlineAt && !dueToday && !overdue ? tl(deadlineAt, ctx, hasTime) : tl(thread.lastMessageAt, ctx);
  return {
    kind,
    badge,
    title,
    subtitle,
    reason: analysis?.reasonImportant?.trim() || null,
    timeLabel: label,
    dueAt: deadlineAt,
    source: {
      type: sourceType,
      id: thread.id,
      externalId: thread.externalThreadId,
      label: sourceLabel(sourceType, ctx.locale),
      person: senderName,
      timestamp: thread.lastMessageAt,
    },
    actions,
    entityType: 'email_thread',
    entityId: thread.id,
    tags,
    confidence,
    candidate,
  };
}

function lifeCategoryActions(category: string, ctx: Ctx): InsightAction[] {
  switch (category) {
    case 'shipment':
      return [act(ctx.locale, 'track', true)];
    case 'travel':
      return [act(ctx.locale, 'checkIn', true), act(ctx.locale, 'alarm', false)];
    case 'payment':
      return [act(ctx.locale, 'openBill', true), act(ctx.locale, 'remind', false)];
    case 'subscription':
      return [act(ctx.locale, 'review', true)];
    default:
      return [act(ctx.locale, 'viewSource', true)];
  }
}

// --- calendar events --------------------------------------------------------------------------

function eventSeed(event: CalendarEvent, ctx: Ctx): DraftSeed | null {
  if (!isSchedulable(event, { userEmail: [...ctx.userEmails][0] ?? null }) && !event.allDay) return null;
  if (event.deletedAt || event.status === 'cancelled') return null;
  const start = ms(event.startAt);
  const end = ms(event.endAt);
  if (Number.isNaN(start) || end < ctx.nowMs - 15 * MINUTE) return null;
  if (start > ctx.nowMs + ctx.horizonMs) return null;
  const people = externalAttendees(event, { userEmail: [...ctx.userEmails][0] ?? null });
  const primary = people[0] ?? null;
  const primaryName = primary?.name?.trim() || primary?.email || null;
  const online = !!event.meetingUrl && !hasPhysicalLocation(event);
  const dur = durationMinutes(event);
  const place = hasPhysicalLocation(event) ? (event.location ?? '').trim() : online ? 'Online' : null;
  const subtitleParts = [event.allDay ? (ctx.en ? 'All day' : 'Tüm gün') : `${dur} ${ctx.en ? 'min' : 'dk'}`];
  if (place) subtitleParts.push(place);
  if (people.length > 1) subtitleParts.push(ctx.en ? `${people.length} attendees` : `${people.length} katılımcı`);
  const clock = formatClock(event.startAt, ctx.timezone);
  const title = isToday(event.startAt, ctx) && !event.allDay ? `${clock} ${event.title}` : event.title;
  const candidate: PriorityCandidate = {
    id: event.id,
    kind: 'event',
    category: 'meeting',
    importance: people.length > 0 ? 'high' : 'normal',
    deadlineAt: null,
    senderEmail: primary?.email ?? null,
    senderDomain: primary?.email ? emailDomain(primary.email) : null,
    senderName: primaryName,
    contactId: primary?.contactId ?? null,
    threadId: null,
    requiresUserAction: false,
    isUserCommitment: false,
    relatedMeetingAt: event.startAt,
    isPromotion: false,
    isNewsletter: false,
    confidence: event.status === 'tentative' ? 0.8 : 0.99,
    ageHours: 0,
    text: event.title,
  };
  return {
    kind: 'meeting',
    badge: 'meeting',
    title,
    subtitle: subtitleParts.join(' · '),
    reason: null,
    timeLabel: event.allDay ? tl(event.startAt, ctx, false) : tl(event.startAt, ctx, true),
    dueAt: event.startAt,
    source: {
      type: event.source,
      id: event.id,
      externalId: event.externalEventId,
      label: sourceLabel(event.source, ctx.locale),
      ...(primaryName ? { person: primaryName } : {}),
      ...(primary?.contactId ? { personId: primary.contactId } : {}),
      timestamp: event.startAt,
      ...(event.meetingUrl ? { url: event.meetingUrl } : {}),
    },
    actions: people.length > 0 ? [act(ctx.locale, 'prepare', true)] : [act(ctx.locale, 'remind', true)],
    entityType: 'calendar_event',
    entityId: event.id,
    tags: ['calendar'],
    confidence: candidate.confidence,
    candidate,
  };
}

// --- tasks --------------------------------------------------------------------------------------

function taskSeed(task: TaskItem, ctx: Ctx): DraftSeed | null {
  if (task.deletedAt || task.status !== 'open' || !task.dueAt) return null;
  if (!withinHorizon(task.dueAt, ctx, { pastDays: 7 })) return null;
  const hasTime = hasClockTime(task.dueAt, ctx.timezone);
  const candidate: PriorityCandidate = {
    id: task.id,
    kind: 'task',
    category: 'deadline',
    importance: task.priority,
    deadlineAt: task.dueAt,
    deadlineHasTime: hasTime,
    contactId: null,
    threadId: null,
    requiresUserAction: true,
    isUserCommitment: false,
    isPromotion: false,
    isNewsletter: false,
    confidence: 1,
    ageHours: Math.max(0, (ctx.nowMs - ms(task.createdAt)) / HOUR),
    text: task.title,
  };
  const phrase = formatDateLabel(task.dueAt, { ...fmt(ctx), withTime: hasTime });
  return {
    kind: 'deadline',
    badge: task.priority === 'critical' && isToday(task.dueAt, ctx) ? 'urgent' : 'deadline',
    title: task.title,
    subtitle: ctx.en ? `Due: ${phrase}` : `Son tarih: ${phrase}`,
    reason: null,
    timeLabel: tl(task.dueAt, ctx, hasTime),
    dueAt: task.dueAt,
    source: task.source ?? { type: 'user', id: task.id, label: sourceLabel('user', ctx.locale), timestamp: task.createdAt },
    actions: [act(ctx.locale, 'plan', true, { taskId: task.id }), act(ctx.locale, 'complete', false, { taskId: task.id })],
    entityType: 'task',
    entityId: task.id,
    tags: [],
    confidence: 1,
    candidate,
  };
}

// --- commitments -------------------------------------------------------------------------------

function commitmentSeed(c: Commitment, ctx: Ctx): DraftSeed | null {
  if (c.deletedAt || c.status !== 'open') return null;
  if (c.dueAt && !withinHorizon(c.dueAt, ctx, { pastDays: 14 })) return null;
  const userOwes = c.direction === 'user_owes';
  const hasTime = c.dueAt ? hasClockTime(c.dueAt, ctx.timezone) : true;
  const candidate: PriorityCandidate = {
    id: c.id,
    kind: 'commitment',
    category: userOwes ? 'action_required' : 'waiting_for_other',
    importance: 'normal',
    deadlineAt: c.dueAt ?? null,
    deadlineHasTime: hasTime,
    senderName: c.counterpartName ?? null,
    contactId: c.counterpartContactId ?? null,
    threadId: c.source.type === 'gmail' || c.source.type === 'outlook' ? c.source.id : null,
    requiresUserAction: userOwes,
    isUserCommitment: userOwes,
    relatedMeetingAt: null,
    isPromotion: false,
    isNewsletter: false,
    confidence: c.confidence,
    ageHours: Math.max(0, (ctx.nowMs - ms(c.source.timestamp)) / HOUR),
    text: c.text,
  };
  const quote = c.quote?.trim();
  let subtitle: string | null = null;
  if (quote) {
    if (userOwes) subtitle = c.source.type === 'meeting_note' ? (ctx.en ? `After the meeting you said “${quote}”.` : `Toplantı sonrası “${quote}” dedin.`) : ctx.en ? `You said “${quote}”.` : `“${quote}” demiştin.`;
    else subtitle = c.counterpartName ? (ctx.en ? `${c.counterpartName} said “${quote}”.` : `${c.counterpartName} “${quote}” dedi.`) : `“${quote}”`;
  } else if (c.dueText) {
    subtitle = ctx.en ? `Promised for ${c.dueText}` : `Söz verilen zaman: ${c.dueText}`;
  }
  const actions = userOwes
    ? [act(ctx.locale, 'plan', true, { commitmentId: c.id }), act(ctx.locale, 'postpone', false, { commitmentId: c.id })]
    : [act(ctx.locale, 'remind', true, { commitmentId: c.id }), c.relatedEventId ? act(ctx.locale, 'askInMeeting', false, { eventId: c.relatedEventId }) : act(ctx.locale, 'viewSource', false)];
  return {
    kind: userOwes ? 'commitment' : 'follow_up',
    badge: userOwes ? 'commitment' : 'follow_up',
    title: c.text,
    subtitle,
    reason: null,
    timeLabel: c.dueAt ? tl(c.dueAt, ctx, hasTime) : (c.dueText ?? null),
    dueAt: c.dueAt ?? null,
    source: c.source,
    actions,
    entityType: 'commitment',
    entityId: c.id,
    tags: ['follow_up'],
    confidence: c.confidence,
    candidate,
  };
}

// --- follow-ups --------------------------------------------------------------------------------

function followUpSeed(f: FollowUp, ctx: Ctx): DraftSeed | null {
  const fresh = refreshFollowUpStatus(f, ctx.now);
  if (fresh.status !== 'nudge_due') return null;
  const candidate: PriorityCandidate = {
    id: f.id,
    kind: 'follow_up',
    category: 'waiting_for_other',
    importance: 'normal',
    deadlineAt: null,
    senderName: f.counterpartName,
    contactId: f.contactId ?? null,
    threadId: f.threadId,
    requiresUserAction: false,
    isUserCommitment: false,
    relatedMeetingAt: null,
    isPromotion: false,
    isNewsletter: false,
    confidence: 0.9,
    ageHours: Math.max(0, (ctx.nowMs - ms(f.sentAt)) / HOUR),
    text: f.topic,
  };
  return {
    kind: 'follow_up',
    badge: 'follow_up',
    title: followUpBrief(f, fmt(ctx)),
    subtitle: `${f.counterpartName} · ${f.topic}`,
    reason: followUpReason(f, fmt(ctx)),
    timeLabel: followUpWaitLabel(f, fmt(ctx)),
    dueAt: null,
    source: f.source,
    actions: [act(ctx.locale, 'followUp', true, { followUpId: f.id, threadId: f.threadId }), act(ctx.locale, 'remindTomorrow', false, { option: 'tomorrow_morning' })],
    entityType: 'follow_up',
    entityId: f.id,
    tags: ['follow_up', 'mail'],
    confidence: 0.9,
    candidate,
  };
}

// --- life events -------------------------------------------------------------------------------

function money(amount: number | null | undefined, currency: string | null | undefined, locale: Locale): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const cur = currency === 'TRY' || !currency ? 'TL' : currency;
  const formatted = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  return `${formatted} ${cur}`;
}

function lifeEventSubtitle(le: LifeEvent, ctx: Ctx): string | null {
  const d = le.details;
  const parts: string[] = [];
  switch (le.type) {
    case 'shipment':
      if (d.deliveryWindow?.start && d.deliveryWindow.end) parts.push(`${formatClock(d.deliveryWindow.start, ctx.timezone)}–${formatClock(d.deliveryWindow.end, ctx.timezone)}`);
      if (d.carrier) parts.push(d.carrier);
      break;
    case 'flight':
      if (d.from && d.to) parts.push(`${d.from} → ${d.to}`);
      if (d.departureAt) parts.push(formatClock(d.departureAt, ctx.timezone));
      if (d.checkInUrl) parts.push(ctx.en ? 'Check-in open' : 'Check-in açık');
      break;
    case 'reservation':
      if (d.venue) parts.push(d.venue);
      if (d.reservationAt) parts.push(formatClock(d.reservationAt, ctx.timezone));
      if (typeof d.partySize === 'number') parts.push(ctx.en ? `${d.partySize} people` : `${d.partySize} kişi`);
      break;
    case 'payment': {
      const amt = money(d.amount, d.currency, ctx.locale);
      if (amt) parts.push(amt);
      if (d.dueAt) parts.push(ctx.en ? `Due ${formatDayOrDate(d.dueAt, { ...fmt(ctx), hasTime: false })}` : `Son ödeme ${formatDayOrDate(d.dueAt, { ...fmt(ctx), hasTime: false })}`);
      break;
    }
    case 'subscription': {
      if (d.renewsAt) parts.push(ctx.en ? `Renews ${formatDayOrDate(d.renewsAt, { ...fmt(ctx), hasTime: false })}` : `${formatDayOrDate(d.renewsAt, { ...fmt(ctx), hasTime: false })} yenileniyor`);
      const amt = money(d.amount, d.currency, ctx.locale);
      if (amt) parts.push(amt);
      break;
    }
    case 'security':
      if (d.device) parts.push(d.device);
      if (d.location) parts.push(d.location);
      if (le.eventAt) parts.push(formatClock(le.eventAt, ctx.timezone));
      break;
  }
  return parts.length ? parts.join(' · ') : null;
}

function lifeEventActions(le: LifeEvent, ctx: Ctx): InsightAction[] {
  const d = le.details;
  switch (le.type) {
    case 'shipment':
      return [act(ctx.locale, 'track', true, d.trackingUrl ? { url: d.trackingUrl } : undefined)];
    case 'flight':
      return [act(ctx.locale, 'checkIn', true, d.checkInUrl ? { url: d.checkInUrl } : undefined), act(ctx.locale, 'alarm', false, d.departureAt ? { at: d.departureAt } : undefined)];
    case 'payment':
      return [act(ctx.locale, 'openBill', true, d.paymentUrl ? { url: d.paymentUrl } : undefined), act(ctx.locale, 'remind', false)];
    case 'subscription':
      return [act(ctx.locale, 'review', true, le.source.url ? { url: le.source.url } : undefined)];
    case 'security':
      return [act(ctx.locale, 'openSource', true, le.source.url ? { url: le.source.url } : undefined)];
    case 'reservation':
      return [act(ctx.locale, 'viewSource', true), act(ctx.locale, 'remind', false)];
  }
}

function lifeEventSeed(le: LifeEvent, ctx: Ctx): DraftSeed | null {
  if (le.deletedAt || (le.status !== 'upcoming' && le.status !== 'today')) return null;
  if (le.eventAt && !withinHorizon(le.eventAt, ctx, { pastDays: 1 })) return null;
  const d = le.details;
  const isSecurity = le.type === 'security';
  const categoryByType: Record<LifeEvent['type'], PriorityCandidate['category']> = {
    shipment: 'shipment',
    flight: 'travel',
    reservation: 'information',
    payment: 'payment',
    subscription: 'subscription',
    security: 'security',
  };
  const deadlineAt = le.type === 'payment' ? (d.dueAt ?? le.eventAt ?? null) : le.type === 'subscription' ? (d.renewsAt ?? le.eventAt ?? null) : null;
  const candidate: PriorityCandidate = {
    id: le.id,
    kind: 'life_event',
    category: categoryByType[le.type],
    importance: isSecurity ? 'high' : 'normal',
    deadlineAt,
    deadlineHasTime: false,
    contactId: null,
    threadId: null,
    requiresUserAction: isSecurity || le.type === 'payment',
    isUserCommitment: false,
    relatedMeetingAt: null,
    isPromotion: false,
    isNewsletter: false,
    confidence: le.confidence,
    ageHours: Math.max(0, (ctx.nowMs - ms(le.source.timestamp)) / HOUR),
    text: le.title,
  };
  const label = lifeEventSourceLabel(le, ctx.locale);
  const timeAt = le.eventAt ?? deadlineAt;
  // Delivery windows, due dates and renewals are day-level facts; flights, reservations and sign-ins have a clock.
  const hasTime = le.type === 'payment' || le.type === 'subscription' || le.type === 'shipment' ? false : undefined;
  const tags: InsightTag[] = ['personal'];
  if (isSecurity) tags.push('mail');
  return {
    kind: isSecurity ? 'security' : 'life_event',
    badge: isSecurity ? 'security' : 'personal',
    title: le.title,
    subtitle: lifeEventSubtitle(le, ctx),
    reason: isSecurity ? (ctx.en ? 'Security alerts are always surfaced.' : 'Güvenlik uyarıları her zaman öne çıkarılır.') : null,
    timeLabel: timeAt ? tl(timeAt, ctx, hasTime) : null,
    dueAt: timeAt ?? null,
    source: { ...le.source, label },
    actions: lifeEventActions(le, ctx),
    entityType: 'life_event',
    entityId: le.id,
    tags,
    confidence: le.confidence,
    candidate,
  };
}

// --- suggestions & conflicts ---------------------------------------------------------------------

function suggestionSeed(s: ScheduleSuggestion, ctx: Ctx): DraftSeed | null {
  if (ms(s.proposedStartAt) < ctx.nowMs - 15 * MINUTE) return null;
  const candidate: PriorityCandidate = {
    id: s.id,
    kind: 'event',
    category: 'meeting',
    importance: 'normal',
    deadlineAt: null,
    contactId: null,
    threadId: null,
    requiresUserAction: false,
    isUserCommitment: false,
    relatedMeetingAt: null,
    isPromotion: false,
    isNewsletter: false,
    confidence: 0.8,
    ageHours: 0,
    text: s.title,
  };
  const payload: Record<string, unknown> = { suggestionId: s.id, kind: s.kind, startAt: s.proposedStartAt, endAt: s.proposedEndAt };
  if (s.targetTaskId) payload['taskId'] = s.targetTaskId;
  if (s.targetEventId) payload['eventId'] = s.targetEventId;
  return {
    kind: 'suggestion',
    badge: 'calendar',
    title: s.title,
    subtitle: s.detail,
    reason: s.reason,
    timeLabel: capitalize(formatDayLabel(s.proposedStartAt, fmt(ctx))),
    dueAt: s.proposedStartAt,
    source: { type: 'assistant', id: s.id, label: ctx.en ? 'Calendar intelligence' : 'Takvim zekâsı', timestamp: ctx.now },
    actions: [act(ctx.locale, 'plan', true, payload), act(ctx.locale, 'later', false, { suggestionId: s.id })],
    entityType: 'suggestion',
    entityId: s.id,
    tags: ['calendar'],
    confidence: 0.8,
    candidate,
  };
}

function conflictSeed(c: CalendarConflict, ctx: Ctx): DraftSeed | null {
  if (c.status !== 'open') return null;
  const a = ms(c.eventA.startAt) <= ms(c.eventB.startAt) ? c.eventA : c.eventB;
  const b = a === c.eventA ? c.eventB : c.eventA;
  if (ms(a.endAt) < ctx.nowMs && ms(b.endAt) < ctx.nowMs) return null;
  const candidate: PriorityCandidate = {
    id: c.id,
    kind: 'event',
    category: 'meeting',
    importance: 'high',
    deadlineAt: null,
    contactId: null,
    threadId: null,
    requiresUserAction: true,
    isUserCommitment: false,
    relatedMeetingAt: a.startAt,
    isPromotion: false,
    isNewsletter: false,
    confidence: 0.99,
    ageHours: 0,
    text: `${a.title} ${b.title}`,
  };
  const rangeA = `${formatClock(a.startAt, ctx.timezone)}–${formatClock(a.endAt, ctx.timezone)}`;
  const rangeB = `${formatClock(b.startAt, ctx.timezone)}–${formatClock(b.endAt, ctx.timezone)}`;
  const dayPrefix = isToday(a.startAt, ctx) ? '' : `${capitalize(formatDayLabel(a.startAt, fmt(ctx)))} `;
  return {
    kind: 'conflict',
    badge: 'calendar',
    title: ctx.en ? `${a.title} overlaps with ${b.title}.` : `${a.title} ile ${b.title} çakışıyor.`,
    subtitle: ctx.en ? `${dayPrefix}${rangeA} and ${rangeB} overlap.` : `${dayPrefix}${rangeA} ve ${rangeB} çakışıyor.`,
    reason: ctx.en ? `${c.overlapMinutes} min overlap` : `${c.overlapMinutes} dk çakışma`,
    timeLabel: tl(a.startAt, ctx, true),
    dueAt: a.startAt,
    source: { type: a.source, id: c.id, label: sourceLabel(a.source, ctx.locale), timestamp: a.startAt },
    actions: [act(ctx.locale, 'seeOptions', true, { conflictId: c.id }), act(ctx.locale, 'ignore', false, { conflictId: c.id })],
    entityType: 'conflict',
    entityId: c.id,
    tags: ['calendar'],
    confidence: 0.99,
    candidate,
  };
}

// ---------------------------------------------------------------------------
// buildInsights
// ---------------------------------------------------------------------------

function compareDrafts(a: InsightDraft, b: InsightDraft): number {
  const tier = TIER_RANK[b.importance] - TIER_RANK[a.importance];
  if (tier !== 0) return tier;
  if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
  const da = a.dueAt ? ms(a.dueAt) : Number.POSITIVE_INFINITY;
  const db = b.dueAt ? ms(b.dueAt) : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return a.dedupeKey.localeCompare(b.dedupeKey);
}

/** Insight drafts (no ids / userId) for everything that deserves a card. Muted and low-tier items are dropped. */
export function buildInsights(input: BuildInsightsInput): InsightDraft[] {
  const locale = input.locale ?? 'tr';
  const nowMs = ms(input.now);
  const ctx: Ctx = {
    now: input.now,
    nowMs,
    timezone: input.timezone,
    locale,
    en: locale === 'en',
    rank: input.rank,
    userEmails: new Set((input.userEmails ?? []).map(lower).filter(Boolean)),
    accountSourceTypes: input.accountSourceTypes ?? {},
    horizonMs: (input.horizonDays ?? DEFAULT_HORIZON_DAYS) * DAY,
    forDate: localDateKey(input.now, input.timezone),
    lifeEventSourceIds: new Set((input.lifeEvents ?? []).filter((l) => !l.deletedAt && l.status !== 'dismissed').map((l) => l.source.id)),
    events: input.events ?? [],
  };
  const seeds: DraftSeed[] = [];
  for (const t of input.threads ?? []) {
    const s = threadSeed(t, ctx);
    if (s) seeds.push(s);
  }
  for (const e of input.events ?? []) {
    const s = eventSeed(e, ctx);
    if (s) seeds.push(s);
  }
  for (const t of input.tasks ?? []) {
    const s = taskSeed(t, ctx);
    if (s) seeds.push(s);
  }
  for (const c of input.commitments ?? []) {
    const s = commitmentSeed(c, ctx);
    if (s) seeds.push(s);
  }
  for (const f of input.followUps ?? []) {
    const s = followUpSeed(f, ctx);
    if (s) seeds.push(s);
  }
  for (const l of input.lifeEvents ?? []) {
    const s = lifeEventSeed(l, ctx);
    if (s) seeds.push(s);
  }
  for (const s of input.suggestions ?? []) {
    const d = suggestionSeed(s, ctx);
    if (d) seeds.push(d);
  }
  for (const c of input.conflicts ?? []) {
    const s = conflictSeed(c, ctx);
    if (s) seeds.push(s);
  }
  const out: InsightDraft[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const ranked = ctx.rank(seed.candidate);
    if (ranked.muted) continue;
    if (ranked.tier === 'low' && seed.kind !== 'security') continue;
    const draft = finish(seed, ranked, ctx);
    if (seen.has(draft.dedupeKey)) continue;
    seen.add(draft.dedupeKey);
    out.push(draft);
  }
  return out.sort(compareDrafts);
}

// ---------------------------------------------------------------------------
// Today feed
// ---------------------------------------------------------------------------

export interface SelectTopInsightsOptions {
  max?: number;
  /** Max cards per person (source person / personId), default 2. */
  maxPerPerson?: number;
  /** Max cards per backing entity, default 1. */
  maxPerEntity?: number;
}

type InsightLike = Insight | InsightDraft;

function personKeyOf(i: InsightLike): string | null {
  const key = i.source.personId ?? i.source.person ?? null;
  return key ? key.trim().toLowerCase() : null;
}

function entityKeyOf(i: InsightLike): string {
  return `${i.entityType}:${i.entityId}`;
}

/** Ranked top-N with diversity: at most one card per entity and two per person (relaxed when the list would stay short). */
export function selectTopInsights<T extends InsightLike>(insights: readonly T[], opts: SelectTopInsightsOptions = {}): T[] {
  const max = opts.max ?? 5;
  const maxPerPerson = opts.maxPerPerson ?? 2;
  const maxPerEntity = opts.maxPerEntity ?? 1;
  const sorted = [...insights].sort(compareDrafts);
  const selected: T[] = [];
  const chosen = new Set<T>();
  const entityCount = new Map<string, number>();
  const personCount = new Map<string, number>();
  const take = (i: T, respectPerson: boolean): void => {
    if (selected.length >= max || chosen.has(i)) return;
    const entity = entityKeyOf(i);
    const person = personKeyOf(i);
    if ((entityCount.get(entity) ?? 0) >= maxPerEntity) return;
    if (respectPerson && person && (personCount.get(person) ?? 0) >= maxPerPerson) return;
    selected.push(i);
    chosen.add(i);
    entityCount.set(entity, (entityCount.get(entity) ?? 0) + 1);
    if (person) personCount.set(person, (personCount.get(person) ?? 0) + 1);
  };
  for (const i of sorted) take(i, true);
  if (selected.length < max) for (const i of sorted) take(i, false);
  return selected.sort(compareDrafts);
}

export interface TodayFeedOptions {
  now: string;
  timezone: string;
  locale?: Locale;
  userName: string;
  pendingApprovals?: number;
  briefing?: Briefing | null;
  lastAnalyzedAt?: string | null;
  offline?: boolean;
  /** Priority cards, default 5. */
  maxPriorities?: number;
}

function isLive(i: Insight, nowMs: number): boolean {
  if (i.deletedAt) return false;
  if (i.status === 'snoozed') return !!i.snoozedUntil && ms(i.snoozedUntil) <= nowMs;
  return i.status === 'active';
}

/** Today tab: greeting, date, diversified priorities and the meeting / deadline / personal groups (no duplicates). */
export function groupTodayFeed(insights: readonly Insight[], opts: TodayFeedOptions): TodayFeed {
  const locale = opts.locale ?? 'tr';
  const nowMs = ms(opts.now);
  const today = localDateKey(opts.now, opts.timezone);
  const live = insights.filter((i) => isLive(i, nowMs) && i.forDate <= today);
  const priorities = selectTopInsights(
    live.filter((i) => i.kind !== 'suggestion'),
    { max: opts.maxPriorities ?? 5 },
  );
  const used = new Set(priorities.map((i) => i.dedupeKey));
  const rest = live.filter((i) => !used.has(i.dedupeKey));
  const byDue = (a: Insight, b: Insight): number => (a.dueAt ? ms(a.dueAt) : Number.POSITIVE_INFINITY) - (b.dueAt ? ms(b.dueAt) : Number.POSITIVE_INFINITY);
  const meetings = rest.filter((i) => i.kind === 'meeting' && i.dueAt && localDateKey(i.dueAt, opts.timezone) === today).sort(byDue);
  const deadlines = rest.filter((i) => i.kind === 'deadline' || i.badge === 'deadline').sort(byDue);
  const lifeEvents = rest.filter((i) => i.kind === 'life_event').sort(byDue);
  return {
    greeting: greetingFor(opts.now, opts.timezone, opts.userName, locale),
    dateLabel: dateLabel(opts.now, opts.timezone, locale),
    briefing: opts.briefing ?? null,
    priorities,
    meetings,
    deadlines,
    lifeEvents,
    pendingApprovals: opts.pendingApprovals ?? 0,
    isEvening: localHour(opts.now, opts.timezone) >= 18,
    lastAnalyzedAt: opts.lastAnalyzedAt ?? null,
    offline: opts.offline ?? false,
  };
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

const FILTER_TAG: Record<Exclude<FlowFilter, 'all'>, InsightTag> = { important: 'important', mail: 'mail', calendar: 'calendar', follow_up: 'follow_up', personal: 'personal' };

/** Flow tab filter: active cards carrying the filter's tag, highest priority first, then newest source. */
export function flowFilter(insights: readonly Insight[], filter: FlowFilter, opts: { now?: string } = {}): Insight[] {
  const nowMs = opts.now ? ms(opts.now) : Date.now();
  const tag = filter === 'all' ? null : FILTER_TAG[filter];
  return insights
    .filter((i) => isLive(i, nowMs))
    .filter((i) => !tag || i.tags.includes(tag))
    .sort((a, b) => {
      const d = compareDrafts(a, b);
      if (d !== 0) return d;
      return ms(b.source.timestamp) - ms(a.source.timestamp);
    });
}

// ---------------------------------------------------------------------------
// Mail intelligence
// ---------------------------------------------------------------------------

export interface MailIntelligenceOptions {
  now: string;
  timezone: string;
}

function emptyBuckets(): MailIntelligenceResponse['categories'] {
  const make = (): { count: number; threads: EmailThread[] } => ({ count: 0, threads: [] });
  return { important: make(), waiting_for_user: make(), waiting_for_other: make(), has_deadline: make(), information: make(), low_priority: make() };
}

/** Mail Summary card: today's total, how many need attention and the six buckets (a thread may sit in several). */
export function mailIntelligenceBuckets(threads: readonly EmailThread[], opts: MailIntelligenceOptions): MailIntelligenceResponse {
  const today = localDateKey(opts.now, opts.timezone);
  const categories = emptyBuckets();
  const live = threads.filter((t) => !t.deletedAt && !t.userDismissed).sort((a, b) => b.priorityScore - a.priorityScore || ms(b.lastMessageAt) - ms(a.lastMessageAt));
  const attention = new Set<string>();
  let totalToday = 0;
  for (const t of live) {
    if (localDateKey(t.lastMessageAt, opts.timezone) === today) totalToday += 1;
    const a = t.analysis ?? null;
    const importance = a?.importance ?? t.importance;
    const category = a?.category ?? t.category;
    const requiresUserAction = a?.requiresUserAction ?? (category === 'action_required' || category === 'waiting_for_user');
    const isPromo = category === 'promotion';
    const buckets: MailIntelligenceCategory[] = [];
    if (!isPromo && (importance === 'high' || importance === 'critical' || category === 'security')) buckets.push('important');
    if (!t.lastFromUser && (category === 'waiting_for_user' || (requiresUserAction && !isPromo))) buckets.push('waiting_for_user');
    if (t.lastFromUser || category === 'waiting_for_other') buckets.push('waiting_for_other');
    if (a?.deadline || category === 'deadline') buckets.push('has_deadline');
    if (isPromo || importance === 'low') buckets.push('low_priority');
    if (buckets.length === 0) buckets.push('information');
    for (const b of buckets) {
      categories[b].count += 1;
      categories[b].threads.push(t);
    }
    if (buckets.includes('important') || buckets.includes('waiting_for_user') || buckets.includes('has_deadline')) attention.add(t.id);
  }
  return { totalToday, needsAttention: attention.size, categories };
}
