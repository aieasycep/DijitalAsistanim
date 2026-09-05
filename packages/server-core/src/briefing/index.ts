/**
 * briefing — morning / midday / evening / weekly briefings: assemble section candidates from real
 * items, compose a deterministic fallback (no AI needed), merge a validated AI narration without
 * letting it invent items, plan the evening carry-over and render the share card text.
 */
import type { Briefing, BriefingAudio, BriefingCounts, BriefingItem, BriefingKind, BriefingSection, CalendarEvent, Commitment, FollowUp, Insight, LifeEvent, Locale, SourceRef, TaskItem, WeeklyMetrics } from '@da/domain';
import { BRIEFING_SECTIONS } from '@da/domain';
import type { BriefingAi } from '@da/validation';
import type { BriefingCandidate } from '../ai/prompts/briefing';
import { durationMinutes, externalAttendees, hasPhysicalLocation, isSchedulable } from '../calendar';
import { MONTHS_EN_TITLE, MONTHS_TR_TITLE, addDays, dateKey, formatClock, localToUtcIso, parseDateKey, turkishLocative, turkishNumberLocative } from '../dates';
import { refreshFollowUpStatus, waitingDays } from '../followups';
import { badgeLabel, formatDayOrDate, greetingFor, hasClockTime, selectTopInsights, sourceLabel, type InsightDraft } from '../insights';
import { DAY, HOUR, localDateKey, localHour } from '../util';

export const WORDS_PER_MINUTE = 150;
export const MAX_AUDIO_CHAPTERS = 6;

export interface BriefingItemDraft extends Omit<BriefingItem, 'id' | 'briefingId'> {
  /** Stable id used as the AI candidate id (`section:entityType:entityId`). */
  candidateId: string;
}

export interface BriefingSectionCandidates {
  section: BriefingSection;
  items: BriefingItemDraft[];
}

export interface BriefingCandidates {
  kind: BriefingKind;
  sections: BriefingSectionCandidates[];
}

export interface BriefingDraft extends Omit<Briefing, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'items'> {
  items: BriefingItemDraft[];
}

type InsightLike = Insight | InsightDraft;

export interface BriefingContext {
  insights: readonly InsightLike[];
  events: readonly CalendarEvent[];
  followUps?: readonly FollowUp[];
  commitments?: readonly Commitment[];
  lifeEvents?: readonly LifeEvent[];
  /** Evening: cards the user completed today. */
  completedToday?: readonly InsightLike[];
  tasksDoneToday?: readonly TaskItem[];
  now: string;
  timezone: string;
  locale?: Locale;
  userName: string;
  counts: { analyzedEmails: number; analyzedCalendars: number; analyzedDays: number };
  /** Midday: cards created or updated after this instant are "changes" (default: 06:00 local today). */
  sinceAt?: string | null;
  weekly?: WeeklyMetrics | null;
  userEmail?: string | null;
}

export const SECTION_ORDER: Record<BriefingKind, readonly BriefingSection[]> = {
  morning: ['priorities', 'schedule', 'waiting_for_you', 'waiting_for_others', 'deadlines', 'personal'],
  midday: ['changes', 'rest_of_day'],
  evening: ['completed', 'carried_over', 'follow_ups', 'first_event_tomorrow'],
  weekly: ['priorities', 'deadlines', 'follow_ups', 'schedule'],
};

const SECTION_TITLES: Record<Locale, Record<BriefingSection, string>> = {
  tr: {
    priorities: 'Bugünün öncelikleri',
    schedule: 'Programın',
    waiting_for_you: 'Senden cevap bekleyenler',
    waiting_for_others: 'Senin cevap beklediklerin',
    deadlines: 'Son tarihler',
    personal: 'Kişisel gelişmeler',
    completed: 'Tamamlananlar',
    carried_over: 'Yarına kalanlar',
    follow_ups: 'Takip edilecekler',
    first_event_tomorrow: 'Yarının ilk etkinliği',
    changes: 'Gelişmeler',
    rest_of_day: 'Günün geri kalanı',
  },
  en: {
    priorities: "Today's priorities",
    schedule: 'Your schedule',
    waiting_for_you: 'Waiting for your reply',
    waiting_for_others: 'Waiting on others',
    deadlines: 'Deadlines',
    personal: 'Personal updates',
    completed: 'Completed',
    carried_over: 'Carried to tomorrow',
    follow_ups: 'To follow up',
    first_event_tomorrow: "Tomorrow's first event",
    changes: 'Developments',
    rest_of_day: 'Rest of the day',
  },
};

export function sectionTitle(section: BriefingSection, locale: Locale = 'tr'): string {
  return SECTION_TITLES[locale][section];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Ctx {
  now: string;
  nowMs: number;
  timezone: string;
  locale: Locale;
  en: boolean;
  today: string;
  tomorrow: string;
  userEmail: string | null;
  lifeEventById: Map<string, LifeEvent>;
}

function ms(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

function makeCtx(input: BriefingContext): Ctx {
  const locale = input.locale ?? 'tr';
  const today = localDateKey(input.now, input.timezone);
  return {
    now: input.now,
    nowMs: ms(input.now),
    timezone: input.timezone,
    locale,
    en: locale === 'en',
    today,
    tomorrow: dateKey(addDays(parseDateKey(today), 1)),
    userEmail: input.userEmail ?? null,
    lifeEventById: new Map((input.lifeEvents ?? []).map((l) => [l.id, l])),
  };
}

function insightId(i: InsightLike): string | null {
  return 'id' in i ? i.id : null;
}

function isActive(i: InsightLike, ctx: Ctx): boolean {
  if ('deletedAt' in i && i.deletedAt) return false;
  if (i.forDate > ctx.today) return false;
  if (i.status === 'snoozed') return !!i.snoozedUntil && ms(i.snoozedUntil) <= ctx.nowMs;
  return i.status === 'active';
}

function ensurePeriod(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function capitalize(s: string): string {
  const first = s[0] ?? '';
  return first.toLocaleUpperCase('tr-TR') + s.slice(1);
}

/** "14:30'da" — locative clock for "Saat 14:30'da". */
export function clockLocative(iso: string, timezone: string): string {
  const clock = formatClock(iso, timezone);
  const hh = Number(clock.slice(0, 2));
  const mm = Number(clock.slice(3, 5));
  return `${clock}'${turkishNumberLocative(mm !== 0 ? mm : hh)}`;
}

/** "Mehmet Yılmaz'dan" — ablative for "… gelen mail". */
export function turkishAblative(word: string): string {
  const loc = turkishLocative(word);
  return loc ? `${loc}n` : loc;
}

function lifeEventIcon(type: LifeEvent['type']): string {
  switch (type) {
    case 'shipment':
      return 'package_2';
    case 'flight':
      return 'flight';
    case 'payment':
      return 'receipt_long';
    case 'subscription':
      return 'autorenew';
    case 'reservation':
      return 'restaurant';
    case 'security':
      return 'flag';
  }
}

function eventIcon(event: CalendarEvent): string {
  if (/(yemek|restoran|rezervasyon|dinner|lunch|brunch|kahvaltı)/i.test(event.title)) return 'restaurant';
  if (event.meetingUrl && !hasPhysicalLocation(event)) return 'videocam';
  return 'event';
}

function insightIcon(i: InsightLike, ctx: Ctx): string {
  switch (i.entityType) {
    case 'email_thread':
      return i.kind === 'deadline' ? 'flag' : 'mail';
    case 'calendar_event':
      return i.source.url && /meet\.|teams\.|zoom\./i.test(i.source.url) ? 'videocam' : 'event';
    case 'task':
      return 'flag';
    case 'commitment':
      return 'handshake';
    case 'follow_up':
      return 'schedule_send';
    case 'life_event': {
      const le = ctx.lifeEventById.get(i.entityId);
      return le ? lifeEventIcon(le.type) : 'person';
    }
    case 'suggestion':
    case 'conflict':
      return 'event';
  }
}

function eventSource(event: CalendarEvent, ctx: Ctx): SourceRef {
  const primary = externalAttendees(event, { userEmail: ctx.userEmail })[0];
  const person = primary?.name?.trim() || primary?.email || null;
  return {
    type: event.source,
    id: event.id,
    externalId: event.externalEventId,
    label: sourceLabel(event.source, ctx.locale),
    ...(person ? { person } : {}),
    ...(primary?.contactId ? { personId: primary.contactId } : {}),
    timestamp: event.startAt,
    ...(event.meetingUrl ? { url: event.meetingUrl } : {}),
  };
}

function eventPlace(event: CalendarEvent): string | null {
  if (hasPhysicalLocation(event)) return (event.location ?? '').trim();
  if (event.meetingUrl) return 'Online';
  return null;
}

function eventMeta(event: CalendarEvent, ctx: Ctx, opts: { withDay?: boolean } = {}): string {
  const parts: string[] = [];
  if (event.allDay) parts.push(opts.withDay ? formatDayOrDate(event.startAt, { ...fmt(ctx), hasTime: false }) : ctx.en ? 'All day' : 'Tüm gün');
  else {
    parts.push(opts.withDay ? formatDayOrDate(event.startAt, { ...fmt(ctx), hasTime: true }) : formatClock(event.startAt, ctx.timezone));
    parts.push(`${durationMinutes(event)} ${ctx.en ? 'min' : 'dk'}`);
  }
  const place = eventPlace(event);
  if (place) parts.push(place);
  return parts.join(' · ');
}

function fmt(ctx: Ctx): { now: string; timezone: string; locale: Locale } {
  return { now: ctx.now, timezone: ctx.timezone, locale: ctx.locale };
}

function eventVisible(event: CalendarEvent, ctx: Ctx): boolean {
  if (event.deletedAt || event.status === 'cancelled') return false;
  if (event.allDay) return true;
  return isSchedulable(event, { userEmail: ctx.userEmail });
}

function eventsOn(events: readonly CalendarEvent[], date: string, ctx: Ctx): CalendarEvent[] {
  return events
    .filter((e) => eventVisible(e, ctx) && localDateKey(e.startAt, ctx.timezone) === date)
    .sort((a, b) => ms(a.startAt) - ms(b.startAt) || a.id.localeCompare(b.id));
}

function lifeEventMeta(le: LifeEvent, ctx: Ctx): string | null {
  const d = le.details;
  switch (le.type) {
    case 'shipment':
      if (d.deliveryWindow?.start && d.deliveryWindow.end) return `${formatClock(d.deliveryWindow.start, ctx.timezone)}–${formatClock(d.deliveryWindow.end, ctx.timezone)}`;
      return le.eventAt ? formatDayOrDate(le.eventAt, { ...fmt(ctx), hasTime: false }) : null;
    case 'flight':
      return d.departureAt ? formatDayOrDate(d.departureAt, { ...fmt(ctx), hasTime: true }) : le.eventAt ? formatDayOrDate(le.eventAt, fmt(ctx)) : null;
    case 'payment':
      return d.dueAt ? formatDayOrDate(d.dueAt, { ...fmt(ctx), hasTime: false }) : le.eventAt ? formatDayOrDate(le.eventAt, { ...fmt(ctx), hasTime: false }) : null;
    case 'subscription':
      return d.renewsAt ? formatDayOrDate(d.renewsAt, { ...fmt(ctx), hasTime: false }) : null;
    case 'reservation':
      return [d.reservationAt ? formatDayOrDate(d.reservationAt, { ...fmt(ctx), hasTime: true }) : null, d.venue ?? null].filter((x): x is string => !!x).join(' · ') || null;
    case 'security':
      return [d.device, d.location, le.eventAt ? formatClock(le.eventAt, ctx.timezone) : null].filter((x): x is string => !!x).join(' · ') || null;
  }
}

function lifeEventDue(le: LifeEvent): string | null {
  const d = le.details;
  return d.dueAt ?? d.renewsAt ?? d.departureAt ?? d.reservationAt ?? d.deliveryWindow?.start ?? le.eventAt ?? null;
}

// ---------------------------------------------------------------------------
// Item factories
// ---------------------------------------------------------------------------

function draft(section: BriefingSection, icon: string, title: string, meta: string | null, source: SourceRef | null, ref: { insightId?: string | null; entityType: BriefingItem['entityType']; entityId: string }): BriefingItemDraft {
  return {
    candidateId: `${section}:${ref.entityType ?? 'item'}:${ref.entityId}`,
    section,
    position: 0,
    icon,
    title: title.trim(),
    meta,
    source,
    insightId: ref.insightId ?? null,
    entityType: ref.entityType,
    entityId: ref.entityId,
    chapterIndex: null,
    status: 'open',
  };
}

function fromInsight(i: InsightLike, section: BriefingSection, ctx: Ctx, meta?: string | null): BriefingItemDraft {
  const badge = badgeLabel(i.badge, ctx.locale);
  const defaultMeta = i.timeLabel ? `${badge} · ${i.timeLabel}` : badge;
  return draft(section, insightIcon(i, ctx), i.title, meta === undefined ? defaultMeta : meta, i.source, { insightId: insightId(i), entityType: i.entityType, entityId: i.entityId });
}

function fromEvent(event: CalendarEvent, section: BriefingSection, ctx: Ctx, opts: { withDay?: boolean } = {}): BriefingItemDraft {
  return draft(section, eventIcon(event), event.title, eventMeta(event, ctx, opts), eventSource(event, ctx), { entityType: 'calendar_event', entityId: event.id });
}

function fromFollowUp(f: FollowUp, section: BriefingSection, ctx: Ctx): BriefingItemDraft {
  const days = waitingDays(f, ctx.now, ctx.timezone);
  const meta = ctx.en ? `No reply for ${days} ${days === 1 ? 'day' : 'days'}` : `${days} gündür yanıt yok`;
  return draft(section, 'schedule_send', `${f.counterpartName} · ${f.topic}`, meta, f.source, { entityType: 'follow_up', entityId: f.id });
}

function fromCommitment(c: Commitment, section: BriefingSection, ctx: Ctx): BriefingItemDraft {
  const meta = c.dueAt ? formatDayOrDate(c.dueAt, fmt(ctx)) : (c.dueText ?? null);
  return draft(section, 'handshake', c.text, meta, c.source, { entityType: 'commitment', entityId: c.id });
}

function fromLifeEvent(le: LifeEvent, section: BriefingSection, ctx: Ctx): BriefingItemDraft {
  return draft(section, lifeEventIcon(le.type), le.title, lifeEventMeta(le, ctx), le.source, { entityType: 'life_event', entityId: le.id });
}

function fromTask(t: TaskItem, section: BriefingSection, ctx: Ctx): BriefingItemDraft {
  const meta = t.completedAt ? (ctx.en ? `Done · ${formatClock(t.completedAt, ctx.timezone)}` : `Tamamlandı · ${formatClock(t.completedAt, ctx.timezone)}`) : ctx.en ? 'Done' : 'Tamamlandı';
  return draft(section, 'flag', t.title, meta, t.source ?? null, { entityType: 'task', entityId: t.id });
}

function dedupe(items: BriefingItemDraft[]): BriefingItemDraft[] {
  const seen = new Set<string>();
  const out: BriefingItemDraft[] = [];
  for (const it of items) {
    const key = `${it.entityType}:${it.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, position: out.length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Section assembly
// ---------------------------------------------------------------------------

function activeInsights(input: BriefingContext, ctx: Ctx): InsightLike[] {
  return input.insights.filter((i) => isActive(i, ctx));
}

function openFollowUps(input: BriefingContext, ctx: Ctx): FollowUp[] {
  return (input.followUps ?? [])
    .map((f) => refreshFollowUpStatus(f, ctx.now, ctx.timezone))
    .filter((f) => f.status === 'watching' || f.status === 'nudge_due')
    .sort((a, b) => ms(a.sentAt) - ms(b.sentAt));
}

function theyOwe(input: BriefingContext): Commitment[] {
  return (input.commitments ?? []).filter((c) => !c.deletedAt && c.status === 'open' && c.direction === 'other_owes');
}

function liveLifeEvents(input: BriefingContext, ctx: Ctx): LifeEvent[] {
  return (input.lifeEvents ?? [])
    .filter((l) => !l.deletedAt && (l.status === 'upcoming' || l.status === 'today'))
    .filter((l) => {
      const due = lifeEventDue(l);
      return !due || (ms(due) >= ctx.nowMs - DAY && ms(due) <= ctx.nowMs + 7 * DAY);
    })
    .sort((a, b) => ms(lifeEventDue(a) ?? '') - ms(lifeEventDue(b) ?? ''));
}

function waitingMeta(i: InsightLike, ctx: Ctx): string {
  const person = i.source.person ?? null;
  let when: string;
  if (i.dueAt) when = formatDayOrDate(i.dueAt, { ...fmt(ctx), hasTime: hasClockTime(i.dueAt, ctx.timezone) });
  else {
    const hours = Math.max(1, Math.floor((ctx.nowMs - ms(i.source.timestamp)) / HOUR));
    const days = Math.floor(hours / 24);
    when = days >= 1 ? (ctx.en ? `waiting ${days} ${days === 1 ? 'day' : 'days'}` : `${days} gündür bekliyor`) : ctx.en ? `waiting ${hours} h` : `${hours} saattir bekliyor`;
  }
  return person ? `${person} · ${when}` : when;
}

function prioritiesSection(insights: InsightLike[], ctx: Ctx, max: number): BriefingItemDraft[] {
  const top = selectTopInsights(
    insights.filter((i) => i.kind !== 'suggestion'),
    { max },
  );
  return dedupe(top.map((i) => fromInsight(i, 'priorities', ctx)));
}

function deadlinesSection(insights: InsightLike[], lifeEvents: LifeEvent[], ctx: Ctx, section: BriefingSection): BriefingItemDraft[] {
  const timed: { item: BriefingItemDraft; at: number }[] = [];
  const fromInsights = insights.filter((i): i is InsightLike & { dueAt: string } => (i.kind === 'deadline' || i.badge === 'deadline') && !!i.dueAt);
  for (const i of fromInsights) {
    timed.push({ item: fromInsight(i, section, ctx, formatDayOrDate(i.dueAt, { ...fmt(ctx), hasTime: hasClockTime(i.dueAt, ctx.timezone) })), at: ms(i.dueAt) });
  }
  const covered = new Set(fromInsights.map((i) => i.entityId));
  for (const le of lifeEvents) {
    if (le.type !== 'payment' && le.type !== 'subscription') continue;
    if (covered.has(le.id)) continue;
    timed.push({ item: fromLifeEvent(le, section, ctx), at: ms(lifeEventDue(le) ?? '') });
  }
  return dedupe(timed.sort((a, b) => a.at - b.at).map((t) => t.item));
}

function personalSection(lifeEvents: LifeEvent[], ctx: Ctx): BriefingItemDraft[] {
  return dedupe(lifeEvents.filter((l) => l.type !== 'security').map((l) => fromLifeEvent(l, 'personal', ctx)));
}

function waitingForOthersSection(input: BriefingContext, ctx: Ctx, section: BriefingSection): BriefingItemDraft[] {
  const items = openFollowUps(input, ctx).map((f) => fromFollowUp(f, section, ctx));
  for (const c of theyOwe(input)) items.push(fromCommitment(c, section, ctx));
  return dedupe(items);
}

/** Section candidates in the fixed order for the briefing kind; empty sections are omitted. */
export function assembleBriefingCandidates(kind: BriefingKind, input: BriefingContext): BriefingCandidates {
  const ctx = makeCtx(input);
  const insights = activeInsights(input, ctx);
  const lifeEvents = liveLifeEvents(input, ctx);
  const todayEvents = eventsOn(input.events, ctx.today, ctx);
  const sections = new Map<BriefingSection, BriefingItemDraft[]>();

  switch (kind) {
    case 'morning': {
      sections.set('priorities', prioritiesSection(insights, ctx, 5));
      sections.set('schedule', dedupe(todayEvents.map((e) => fromEvent(e, 'schedule', ctx))));
      const waiting = insights
        .filter((i) => i.entityType === 'email_thread' && (i.kind === 'waiting_for_user' || i.badge === 'waiting' || (i.badge === 'urgent' && i.actions.some((a) => a.kind === 'reply'))))
        .sort((a, b) => (ms(a.dueAt) || Number.POSITIVE_INFINITY) - (ms(b.dueAt) || Number.POSITIVE_INFINITY));
      sections.set('waiting_for_you', dedupe(waiting.map((i) => draft('waiting_for_you', 'person', i.title, waitingMeta(i, ctx), i.source, { insightId: insightId(i), entityType: i.entityType, entityId: i.entityId }))));
      sections.set('waiting_for_others', waitingForOthersSection(input, ctx, 'waiting_for_others'));
      sections.set('deadlines', deadlinesSection(insights, lifeEvents, ctx, 'deadlines'));
      sections.set('personal', personalSection(lifeEvents, ctx));
      break;
    }
    case 'midday': {
      const sinceMs = input.sinceAt ? ms(input.sinceAt) : ms(localToUtcIso(parseDateKey(ctx.today), 6, 0, ctx.timezone));
      const since = Number.isNaN(sinceMs) ? ctx.nowMs - 6 * HOUR : sinceMs;
      const changed = insights.filter((i) => {
        if (!('createdAt' in i)) return true;
        return ms(i.createdAt) >= since || ms(i.updatedAt) >= since;
      });
      sections.set('changes', dedupe(selectTopInsights(changed, { max: 6, maxPerPerson: 3 }).map((i) => fromInsight(i, 'changes', ctx))));
      const rest: { item: BriefingItemDraft; at: number }[] = todayEvents.filter((e) => ms(e.endAt) > ctx.nowMs).map((e) => ({ item: fromEvent(e, 'rest_of_day', ctx), at: ms(e.startAt) }));
      for (const i of insights) {
        if (i.dueAt && ms(i.dueAt) > ctx.nowMs && localDateKey(i.dueAt, ctx.timezone) === ctx.today && i.entityType !== 'calendar_event' && i.kind !== 'suggestion') {
          rest.push({ item: fromInsight(i, 'rest_of_day', ctx, formatDayOrDate(i.dueAt, fmt(ctx))), at: ms(i.dueAt) });
        }
      }
      sections.set('rest_of_day', dedupe(rest.sort((a, b) => a.at - b.at).map((r) => r.item)));
      break;
    }
    case 'evening': {
      const completed: BriefingItemDraft[] = (input.completedToday ?? []).map((i) => {
        const at = 'updatedAt' in i ? i.updatedAt : null;
        const meta = at ? (ctx.en ? `Done · ${formatClock(at, ctx.timezone)}` : `Tamamlandı · ${formatClock(at, ctx.timezone)}`) : ctx.en ? 'Done' : 'Tamamlandı';
        return { ...fromInsight(i, 'completed', ctx, meta), status: 'done' as const };
      });
      for (const t of input.tasksDoneToday ?? []) completed.push({ ...fromTask(t, 'completed', ctx), status: 'done' });
      sections.set('completed', dedupe(completed));
      const carry = insights.filter((i) => i.kind === 'priority' || i.kind === 'waiting_for_user' || i.kind === 'deadline' || i.kind === 'commitment' || i.kind === 'security');
      sections.set('carried_over', dedupe(selectTopInsights(carry, { max: 8, maxPerPerson: 3 }).map((i) => fromInsight(i, 'carried_over', ctx))));
      sections.set('follow_ups', waitingForOthersSection(input, ctx, 'follow_ups'));
      const first = eventsOn(input.events, ctx.tomorrow, ctx)[0];
      sections.set('first_event_tomorrow', first ? dedupe([fromEvent(first, 'first_event_tomorrow', ctx, { withDay: true })]) : []);
      break;
    }
    case 'weekly': {
      sections.set('priorities', prioritiesSection(insights, ctx, 5));
      sections.set('deadlines', deadlinesSection(insights, lifeEvents, ctx, 'deadlines'));
      sections.set('follow_ups', waitingForOthersSection(input, ctx, 'follow_ups'));
      const upcoming = input.events
        .filter((e) => eventVisible(e, ctx) && ms(e.startAt) >= ctx.nowMs && ms(e.startAt) <= ctx.nowMs + 7 * DAY)
        .sort((a, b) => ms(a.startAt) - ms(b.startAt))
        .slice(0, 8);
      sections.set('schedule', dedupe(upcoming.map((e) => fromEvent(e, 'schedule', ctx, { withDay: true }))));
      break;
    }
  }

  const ordered: BriefingSectionCandidates[] = [];
  for (const section of SECTION_ORDER[kind]) {
    const items = sections.get(section) ?? [];
    if (items.length > 0) ordered.push({ section, items });
  }
  return { kind, sections: ordered };
}

/** Candidate lines for the AI prompt (ids are the drafts' candidateIds). */
export function toBriefingPromptCandidates(candidates: BriefingCandidates, ctx: { insights?: readonly InsightLike[] } = {}): BriefingCandidate[] {
  const importanceByEntity = new Map<string, Insight['importance']>();
  for (const i of ctx.insights ?? []) importanceByEntity.set(`${i.entityType}:${i.entityId}`, i.importance);
  const out: BriefingCandidate[] = [];
  for (const s of candidates.sections) {
    for (const it of s.items) {
      const key = `${it.entityType ?? ''}:${it.entityId ?? ''}`;
      const importance = importanceByEntity.get(key);
      out.push({
        id: it.candidateId,
        section: it.section,
        title: it.title,
        meta: it.meta ?? null,
        at: it.source?.timestamp ?? null,
        ...(importance ? { importance } : {}),
        source: it.source ? [it.source.label, it.source.person].filter(Boolean).join(' · ') : null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fallback composition (no AI)
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Seconds at 150 words per minute (never below 10 seconds for non-empty text). */
export function estimateReadSeconds(text: string): number {
  const words = wordCount(text);
  if (words === 0) return 0;
  return Math.max(10, Math.round((words / WORDS_PER_MINUTE) * 60));
}

/** Plain narration for TTS: times as "saat 14:00", ranges as "… ile … arası", no symbols. */
export function ttsFriendly(text: string, locale: Locale = 'tr'): string {
  const en = locale === 'en';
  let s = text;
  s = s.replace(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/g, en ? 'from $1 to $2' : '$1 ile $2 arası');
  s = s.replace(/(?<!\d)(\d{1,2}:\d{2})(?!\d)/g, (_m, t: string, offset: number, whole: string) => {
    const before = whole.slice(Math.max(0, offset - 6), offset).toLocaleLowerCase('tr-TR');
    if (/(saat|from|to|at)\s$/.test(before)) return t;
    return en ? `at ${t}` : `saat ${t}`;
  });
  s = s.replace(/%\s?(\d+(?:[.,]\d+)?)/g, en ? '$1 percent' : 'yüzde $1');
  s = s.replace(/(\d+(?:[.,]\d+)?)\s?%/g, en ? '$1 percent' : 'yüzde $1');
  s = s.replace(/\s*[·•]\s*/g, ', ');
  s = s.replace(/\s*→\s*/g, ' - ');
  s = s.replace(/\s*[–—]\s*/g, ', ');
  s = s.replace(/[“”"]/g, '');
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  return s;
}

interface Chapter {
  title: string;
  text: string;
  sections: BriefingSection[];
}

function sectionSentences(section: BriefingSection, items: readonly BriefingItemDraft[], ctx: Ctx): string {
  const en = ctx.en;
  switch (section) {
    case 'schedule':
    case 'rest_of_day':
    case 'first_event_tomorrow': {
      const parts = items.map((it) => {
        const at = it.source?.timestamp;
        if (!at || Number.isNaN(ms(at))) return it.title;
        if (section === 'first_event_tomorrow') return en ? `Tomorrow at ${formatClock(at, ctx.timezone)}: ${it.title}` : `Yarın saat ${clockLocative(at, ctx.timezone)} ${it.title}`;
        return en ? `at ${formatClock(at, ctx.timezone)} ${it.title}` : `saat ${clockLocative(at, ctx.timezone)} ${it.title}`;
      });
      return capitalize(parts.join(', ')) + '.';
    }
    case 'waiting_for_you':
      return items.map((it) => ensurePeriod(it.title)).join(' ');
    case 'waiting_for_others':
    case 'follow_ups':
      return items.map((it) => (it.meta ? `${it.title}: ${it.meta}.` : ensurePeriod(it.title))).join(' ');
    case 'deadlines':
      return items.map((it) => (it.meta ? `${ensurePeriod(it.title).replace(/\.$/, '')}: ${it.meta}.` : ensurePeriod(it.title))).join(' ');
    case 'completed':
      return items.map((it) => ensurePeriod(it.title)).join(' ');
    default:
      return items.map((it) => ensurePeriod(it.title)).join(' ');
  }
}

function buildChapters(kind: BriefingKind, candidates: BriefingCandidates, overview: string, ctx: Ctx): Chapter[] {
  const chapters: Chapter[] = [{ title: ctx.en ? 'Overview' : 'Genel bakış', text: overview, sections: [] }];
  const merged = new Map<string, { title: string; sections: BriefingSection[]; texts: string[] }>();
  for (const s of candidates.sections) {
    const key = kind === 'morning' && (s.section === 'waiting_for_you' || s.section === 'waiting_for_others') ? 'waiting' : s.section;
    const title = key === 'waiting' ? (ctx.en ? 'Waiting for replies' : 'Cevap bekleyenler') : sectionTitle(s.section, ctx.locale);
    const entry = merged.get(key) ?? { title, sections: [], texts: [] };
    entry.sections.push(s.section);
    entry.texts.push(sectionSentences(s.section, s.items, ctx));
    merged.set(key, entry);
  }
  for (const entry of merged.values()) {
    if (chapters.length >= MAX_AUDIO_CHAPTERS) break;
    chapters.push({ title: entry.title, text: entry.texts.join(' '), sections: entry.sections });
  }
  return chapters;
}

function toAudio(chapters: Chapter[], locale: Locale): { audio: BriefingAudio; sectionChapter: Map<BriefingSection, number> } {
  const sectionChapter = new Map<BriefingSection, number>();
  let cursor = 0;
  const out: BriefingAudio['chapters'] = [];
  chapters.forEach((c, index) => {
    const text = ttsFriendly(c.text, locale);
    const durationSec = Math.max(3, Math.round((wordCount(text) / WORDS_PER_MINUTE) * 60));
    out.push({ index, title: c.title, startSec: cursor, durationSec, text });
    for (const s of c.sections) sectionChapter.set(s, index);
    cursor += durationSec;
  });
  return { audio: { provider: 'device_tts', url: null, durationSec: cursor, chapters: out, script: out.map((c) => c.text).join('\n\n') }, sectionChapter };
}

function itemsOf(candidates: BriefingCandidates, section: BriefingSection): BriefingItemDraft[] {
  return candidates.sections.find((s) => s.section === section)?.items ?? [];
}

function countsFor(kind: BriefingKind, candidates: BriefingCandidates, input: BriefingContext, ctx: Ctx, highlight: number): BriefingCounts {
  const insights = activeInsights(input, ctx);
  const importantEmails = insights.filter((i) => i.entityType === 'email_thread' && i.tags.includes('important')).length;
  const events = eventsOn(input.events, kind === 'evening' ? ctx.tomorrow : ctx.today, ctx).length;
  const followUps = openFollowUps(input, ctx).length + theyOwe(input).length;
  const deadlineItems = itemsOf(candidates, 'deadlines');
  const deadlines = deadlineItems.length > 0 ? deadlineItems.length : insights.filter((i) => i.kind === 'deadline' || i.badge === 'deadline').length;
  return { importantEmails, events, followUps, deadlines, total: highlight, analyzedEmails: input.counts.analyzedEmails, analyzedCalendars: input.counts.analyzedCalendars, analyzedDays: input.counts.analyzedDays };
}

function morningNarrative(candidates: BriefingCandidates, input: BriefingContext, ctx: Ctx, counts: BriefingCounts): string {
  const en = ctx.en;
  const sentences: string[] = [];
  const todayEvents = eventsOn(input.events, ctx.today, ctx).filter((e) => e.allDay || ms(e.endAt) > ctx.nowMs);
  const timed = todayEvents.filter((e) => !e.allDay);
  if (timed.length === 0) {
    sentences.push(en ? 'Your calendar is quite calm today.' : 'Bugün takvimin oldukça sakin.');
  } else {
    const beforeNoon = timed.filter((e) => localHour(e.startAt, ctx.timezone) < 12);
    if (beforeNoon.length === 0 && localHour(ctx.now, ctx.timezone) < 12) sentences.push(en ? 'No meetings before noon.' : 'Öğlene kadar toplantın bulunmuyor.');
    const key = timed.find((e) => externalAttendees(e, { userEmail: ctx.userEmail }).length > 0) ?? timed[0];
    if (key) {
      sentences.push(en ? `At ${formatClock(key.startAt, ctx.timezone)} you have ${key.title}.` : `Saat ${clockLocative(key.startAt, ctx.timezone)} ${key.title} var.`);
      const attendeeNames = externalAttendees(key, { userEmail: ctx.userEmail }).map((a) => a.name?.trim().toLocaleLowerCase('tr-TR') ?? '');
      const related = activeInsights(input, ctx).find((i) => i.entityType === 'email_thread' && i.source.person && attendeeNames.includes(i.source.person.trim().toLocaleLowerCase('tr-TR')));
      if (related?.source.person) {
        sentences.push(en ? `Before the meeting it may help to look at the latest email from ${related.source.person}.` : `Toplantı öncesinde ${turkishAblative(related.source.person)} gelen son maile bakman faydalı olabilir.`);
      }
      if (timed.length > 1) sentences.push(en ? `You have ${timed.length} events in total today.` : `Bugün toplam ${timed.length} etkinliğin var.`);
    }
  }
  if (counts.analyzedEmails > 0) {
    sentences.push(
      counts.importantEmails > 0
        ? en
          ? `${counts.importantEmails} of the ${counts.analyzedEmails} emails received need your attention.`
          : `Gelen ${counts.analyzedEmails} mail arasında ${counts.importantEmails} konu dikkat gerektiriyor.`
        : en
          ? `None of the ${counts.analyzedEmails} emails received needs your attention.`
          : `Gelen ${counts.analyzedEmails} mail arasında dikkat gerektiren bir konu yok.`,
    );
  }
  const urgent = itemsOf(candidates, 'priorities').find((it) => /^(Acil|Urgent)/.test(it.meta ?? ''));
  if (urgent) sentences.push(en ? `Most urgent: ${ensurePeriod(urgent.title)}` : `En acili: ${ensurePeriod(urgent.title)}`);
  const personal = itemsOf(candidates, 'personal')[0];
  if (personal && sentences.length < 5) sentences.push(ensurePeriod(personal.title));
  return sentences.slice(0, 5).join(' ');
}

function middayNarrative(candidates: BriefingCandidates, ctx: Ctx): string {
  const en = ctx.en;
  const changes = itemsOf(candidates, 'changes');
  const rest = itemsOf(candidates, 'rest_of_day');
  const sentences: string[] = [];
  if (changes.length === 0) sentences.push(en ? 'Nothing new since this morning.' : 'Sabahtan beri yeni bir gelişme yok.');
  else {
    sentences.push(en ? `${changes.length} new ${changes.length === 1 ? 'development' : 'developments'} since this morning.` : `Sabahtan beri ${changes.length} yeni gelişme var.`);
    for (const it of changes.slice(0, 2)) sentences.push(ensurePeriod(it.title));
  }
  const firstEvent = rest.find((it) => it.entityType === 'calendar_event');
  const eventCount = rest.filter((it) => it.entityType === 'calendar_event').length;
  if (firstEvent?.source?.timestamp) {
    sentences.push(
      en
        ? `${eventCount} ${eventCount === 1 ? 'event' : 'events'} left today; the first is ${firstEvent.title} at ${formatClock(firstEvent.source.timestamp, ctx.timezone)}.`
        : `Günün kalanında ${eventCount} etkinliğin var; ilki saat ${clockLocative(firstEvent.source.timestamp, ctx.timezone)} ${firstEvent.title}.`,
    );
  } else sentences.push(en ? 'No more events today.' : 'Günün kalanında etkinlik yok.');
  return sentences.slice(0, 5).join(' ');
}

function eveningNarrative(candidates: BriefingCandidates, input: BriefingContext, ctx: Ctx): string {
  const en = ctx.en;
  const done = itemsOf(candidates, 'completed');
  const carry = itemsOf(candidates, 'carried_over');
  const sentences: string[] = [];
  if (done.length > 0) sentences.push(en ? `You completed ${done.length} ${done.length === 1 ? 'item' : 'items'} today.` : `Bugün ${done.length} konuyu tamamladın.`);
  if (carry.length === 0) sentences.push(en ? 'Nothing carries over to tomorrow.' : 'Yarına açık konu kalmadı.');
  else {
    sentences.push(en ? `${carry.length} ${carry.length === 1 ? 'item carries' : 'items carry'} over to tomorrow.` : `Yarına ${carry.length} konu kaldı.`);
    const first = carry[0];
    if (first) sentences.push(ensurePeriod(first.title));
  }
  const fu = openFollowUps(input, ctx)[0];
  if (fu) {
    const days = waitingDays(fu, ctx.now, ctx.timezone);
    sentences.push(en ? `${fu.counterpartName} has not replied for ${days} ${days === 1 ? 'day' : 'days'}.` : `${fu.counterpartName} ${days} gündür yanıt vermedi.`);
  }
  const first = itemsOf(candidates, 'first_event_tomorrow')[0];
  if (first?.source?.timestamp) sentences.push(en ? `Tomorrow your first event is ${first.title} at ${formatClock(first.source.timestamp, ctx.timezone)}.` : `Yarın ilk etkinliğin saat ${clockLocative(first.source.timestamp, ctx.timezone)} ${first.title}.`);
  else sentences.push(en ? 'No events on your calendar tomorrow.' : 'Yarın takvimde etkinlik yok.');
  return sentences.slice(0, 5).join(' ');
}

function weeklyNarrative(weekly: WeeklyMetrics | null | undefined, candidates: BriefingCandidates, ctx: Ctx): string {
  const en = ctx.en;
  const sentences: string[] = [];
  if (weekly) {
    sentences.push(en ? `${weekly.analyzedEmails} emails were analyzed this week and ${weekly.importantItems} important topics were surfaced.` : `Bu hafta ${weekly.analyzedEmails} mail analiz edildi, ${weekly.importantItems} önemli konu öne çıkarıldı.`);
    if (weekly.meetings > 0) sentences.push(en ? `Prep notes were ready for ${weekly.meetingsWithPrep} of your ${weekly.meetings} meetings.` : `${weekly.meetings} toplantının ${weekly.meetingsWithPrep} tanesi için hazırlık notu hazırdı.`);
    if (weekly.followUps > 0) sentences.push(en ? `${weekly.followUpsAnswered} of ${weekly.followUps} follow-ups were answered.` : `${weekly.followUps} takibin ${weekly.followUpsAnswered} tanesi cevaplandı.`);
    if (weekly.deadlines > 0) {
      sentences.push(
        weekly.deadlinesMissed === 0
          ? en
            ? `None of the ${weekly.deadlines} deadlines was missed.`
            : `${weekly.deadlines} son tarihin hiçbiri kaçmadı.`
          : en
            ? `${weekly.deadlinesMissed} of ${weekly.deadlines} deadlines were missed.`
            : `${weekly.deadlines} son tarihin ${weekly.deadlinesMissed} tanesi kaçtı.`,
      );
    }
    if (weekly.estimatedTimeSavedMinutes > 0) sentences.push(en ? `You saved about ${formatMinutes(weekly.estimatedTimeSavedMinutes, 'en')}.` : `Yaklaşık ${formatMinutes(weekly.estimatedTimeSavedMinutes, 'tr')} kazandın.`);
  } else {
    const p = itemsOf(candidates, 'priorities');
    sentences.push(p.length > 0 ? (en ? `${p.length} topics stand out this week.` : `Bu hafta ${p.length} konu öne çıkıyor.`) : en ? 'A calm week.' : 'Sakin bir hafta.');
  }
  return sentences.slice(0, 5).join(' ');
}

function weeklyOutlook(weekly: WeeklyMetrics | null | undefined, candidates: BriefingCandidates, ctx: Ctx): string {
  if (weekly?.nextWeek?.trim()) return weekly.nextWeek.trim();
  const events = itemsOf(candidates, 'schedule').length;
  const deadlines = itemsOf(candidates, 'deadlines').length;
  if (ctx.en) return `Next week: ${events} ${events === 1 ? 'event' : 'events'} and ${deadlines} ${deadlines === 1 ? 'deadline' : 'deadlines'} on the horizon.`;
  return `Gelecek hafta ${events} etkinlik ve ${deadlines} son tarih görünüyor.`;
}

/** "2 sa 15 dk" / "2 h 15 min". */
export function formatMinutes(minutes: number, locale: Locale = 'tr'): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const en = locale === 'en';
  if (h === 0) return en ? `${rest} min` : `${rest} dk`;
  if (rest === 0) return en ? `${h} h` : `${h} sa`;
  return en ? `${h} h ${rest} min` : `${h} sa ${rest} dk`;
}

function headlineFor(kind: BriefingKind, n: number, ctx: Ctx): string {
  const en = ctx.en;
  switch (kind) {
    case 'morning':
      return n === 0 ? (en ? 'Everything is under control today.' : 'Bugün her şey kontrol altında.') : en ? `There are ${n} things you need to know today.` : `Bugün bilmen gereken ${n} şey var.`;
    case 'midday':
      return n === 0 ? (en ? 'Everything is going as planned.' : 'Her şey planlandığı gibi.') : en ? `${n} important developments since this morning.` : `Sabahından beri ${n} önemli gelişme oldu.`;
    case 'evening':
      return n === 0 ? (en ? 'Nothing carries over to tomorrow.' : 'Yarına açık konu kalmadı.') : en ? `${n} items carry over to tomorrow.` : `Bugünden yarına ${n} konu kaldı.`;
    case 'weekly':
      return en ? 'How was your week?' : 'Haftan nasıl geçti?';
  }
}

function sublineFor(kind: BriefingKind, counts: BriefingCounts, candidates: BriefingCandidates, weekly: WeeklyMetrics | null | undefined, ctx: Ctx): string {
  const en = ctx.en;
  switch (kind) {
    case 'evening': {
      const done = itemsOf(candidates, 'completed').length;
      const first = itemsOf(candidates, 'first_event_tomorrow')[0];
      const parts = [en ? `${done} done` : `${done} tamamlandı`, en ? `${counts.followUps} follow-ups` : `${counts.followUps} takip`];
      if (first?.source?.timestamp) parts.push(en ? `Tomorrow ${formatClock(first.source.timestamp, ctx.timezone)} ${first.title}` : `Yarın ${formatClock(first.source.timestamp, ctx.timezone)} ${first.title}`);
      return parts.join(' · ');
    }
    case 'weekly':
      if (weekly) return en ? `${weekly.analyzedEmails} emails · ${weekly.importantItems} important · ${weekly.meetings} meetings` : `${weekly.analyzedEmails} mail · ${weekly.importantItems} önemli konu · ${weekly.meetings} toplantı`;
      return en ? `${counts.importantEmails} important emails · ${counts.events} events · ${counts.followUps} follow-ups` : `${counts.importantEmails} önemli mail · ${counts.events} etkinlik · ${counts.followUps} takip`;
    default:
      return en ? `${counts.importantEmails} important emails · ${counts.events} events · ${counts.followUps} follow-ups` : `${counts.importantEmails} önemli mail · ${counts.events} etkinlik · ${counts.followUps} takip`;
  }
}

function moodFor(kind: BriefingKind, counts: BriefingCounts, candidates: BriefingCandidates, ctx: Ctx): string {
  const en = ctx.en;
  switch (kind) {
    case 'morning': {
      const urgent = itemsOf(candidates, 'priorities').filter((it) => /^(Acil|Urgent)/.test(it.meta ?? '')).length;
      if (urgent >= 2) return en ? 'A brisk day; let us start with the urgent ones.' : 'Bugün tempolu bir gün; önce acil olanlara bakalım.';
      if (counts.events === 0) return en ? 'Your calendar is quite calm today.' : 'Bugün takvimin oldukça sakin.';
      if (counts.events <= 2) return en ? 'You have a fairly calm day.' : 'Bugün oldukça sakin bir günün var.';
      if (counts.events <= 4) return en ? 'A balanced day ahead.' : 'Bugün dengeli bir günün var.';
      return en ? 'A busy day ahead.' : 'Bugün yoğun bir günün var.';
    }
    case 'midday':
      return itemsOf(candidates, 'changes').length > 0 ? (en ? 'The day is on track, with a few new developments.' : 'Gün planlandığı gibi ilerliyor, birkaç yeni gelişme var.') : en ? 'Everything is going as planned.' : 'Her şey planlandığı gibi.';
    case 'evening':
      return en ? 'That is all for today. Rest well.' : 'Bugün için bu kadar. İyi dinlenmeler.';
    case 'weekly':
      return en ? `${counts.total} important topics were surfaced this week.` : `Bu hafta ${counts.total} önemli konu öne çıkarıldı.`;
  }
}

/** Deterministic briefing built only from real items — used when the AI is unavailable or rejected. */
export function composeBriefingFallback(kind: BriefingKind, candidates: BriefingCandidates, input: BriefingContext): BriefingDraft {
  const ctx = makeCtx(input);
  const weekly = input.weekly ?? null;
  const highlight =
    kind === 'morning'
      ? itemsOf(candidates, 'priorities').length
      : kind === 'midday'
        ? itemsOf(candidates, 'changes').length
        : kind === 'evening'
          ? itemsOf(candidates, 'carried_over').length
          : (weekly?.importantItems ?? itemsOf(candidates, 'priorities').length);
  const counts = countsFor(kind, candidates, input, ctx, highlight);
  const headline = headlineFor(kind, highlight, ctx);
  const subline = sublineFor(kind, counts, candidates, weekly, ctx);
  const mood = moodFor(kind, counts, candidates, ctx);
  const narrative =
    kind === 'morning' ? morningNarrative(candidates, input, ctx, counts) : kind === 'midday' ? middayNarrative(candidates, ctx) : kind === 'evening' ? eveningNarrative(candidates, input, ctx) : weeklyNarrative(weekly, candidates, ctx);
  const outlook = kind === 'weekly' ? weeklyOutlook(weekly, candidates, ctx) : null;
  const greeting = greetingFor(ctx.now, ctx.timezone, input.userName, ctx.locale).replace(',', '');
  const overview = `${greeting}. ${mood} ${narrative}`.trim();
  const chapters = buildChapters(kind, candidates, overview, ctx);
  const { audio, sectionChapter } = toAudio(chapters, ctx.locale);
  const items: BriefingItemDraft[] = [];
  for (const s of candidates.sections) {
    const chapterIndex = sectionChapter.get(s.section) ?? null;
    s.items.forEach((it, position) => items.push({ ...it, position, chapterIndex }));
  }
  return {
    kind,
    forDate: ctx.today,
    generatedAt: ctx.now,
    headline,
    highlightNumber: highlight,
    subline,
    mood,
    narrative,
    outlook,
    counts,
    items,
    audio,
    estimatedReadSec: estimateReadSeconds(audio.script),
    openedAt: null,
    closedAt: null,
    weekly,
    hasChanges: kind === 'midday' ? highlight > 0 : true,
    version: 1,
  };
}

// ---------------------------------------------------------------------------
// AI merge
// ---------------------------------------------------------------------------

function firstNumber(s: string): number | null {
  const m = /\d+/.exec(s);
  return m ? Number(m[0]) : null;
}

/**
 * Accept the model's narration (headline / mood / narrative / outlook / audio) and its ordering of
 * known items; counts, subline, highlight number and the item set stay deterministic.
 * A headline whose number disagrees with the highlight number is rejected.
 */
export function mergeAiBriefing(fallback: BriefingDraft, ai: BriefingAi, knownItemIds: readonly string[]): BriefingDraft {
  const known = new Set(knownItemIds);
  const headline = ai.headline.trim();
  const headlineNumber = firstNumber(headline);
  const headlineOk = headline.length > 0 && (headlineNumber === null || headlineNumber === fallback.highlightNumber);
  const validSections = new Set<string>(BRIEFING_SECTIONS);
  const bySection = new Map<BriefingSection, BriefingItemDraft[]>();
  for (const it of fallback.items) {
    const list = bySection.get(it.section) ?? [];
    list.push(it);
    bySection.set(it.section, list);
  }
  for (const s of ai.sections) {
    if (!validSections.has(s.section)) continue;
    const section = s.section as BriefingSection;
    const current = bySection.get(section);
    if (!current) continue;
    const wanted: BriefingItemDraft[] = [];
    const used = new Set<string>();
    for (const id of s.itemIds) {
      if (!known.has(id) || used.has(id)) continue;
      const found = current.find((it) => it.candidateId === id);
      if (!found) continue;
      used.add(id);
      wanted.push(found);
    }
    if (wanted.length === 0) continue;
    const remaining = current.filter((it) => !used.has(it.candidateId));
    bySection.set(
      section,
      [...wanted, ...remaining].map((it, position) => ({ ...it, position })),
    );
  }
  const items: BriefingItemDraft[] = [];
  for (const section of SECTION_ORDER[fallback.kind]) {
    for (const it of bySection.get(section) ?? []) items.push(it);
  }
  let audio = fallback.audio ?? null;
  if (ai.audioScript.length > 0) {
    const chapters = ai.audioScript.map((c, index) => ({ index, title: c.title.trim() || `${index + 1}`, text: ttsFriendly(c.text) }));
    let cursor = 0;
    const built: BriefingAudio['chapters'] = chapters.map((c) => {
      const durationSec = Math.max(3, Math.round((wordCount(c.text) / WORDS_PER_MINUTE) * 60));
      const chapter = { ...c, startSec: cursor, durationSec };
      cursor += durationSec;
      return chapter;
    });
    audio = { provider: 'device_tts', url: null, durationSec: cursor, chapters: built, script: built.map((c) => c.text).join('\n\n') };
  }
  const chapterCount = audio?.chapters.length ?? 0;
  const merged: BriefingDraft = {
    ...fallback,
    headline: headlineOk ? headline : fallback.headline,
    mood: ai.mood.trim() || fallback.mood,
    narrative: ai.narrative.trim() || fallback.narrative,
    outlook: ai.outlook?.trim() || fallback.outlook || null,
    items: items.map((it) => ({ ...it, chapterIndex: typeof it.chapterIndex === 'number' && it.chapterIndex < chapterCount ? it.chapterIndex : null })),
    audio,
  };
  merged.estimatedReadSec = estimateReadSeconds(audio?.script ?? merged.narrative);
  return merged;
}

// ---------------------------------------------------------------------------
// Evening carry-over
// ---------------------------------------------------------------------------

export interface CarryOverPlan {
  closedAt: string;
  /** Insight updates to persist: forDate moves to tomorrow, status stays active. */
  carryOver: { insightId: string; entityType: BriefingItem['entityType']; entityId: string | null; forDate: string }[];
  /** Selected ids that are not carry-over candidates of this briefing. */
  ignoredIds: string[];
}

/** "Yarına Taşı": which selected insights move to tomorrow (only items of the carried_over section qualify). */
export function eveningCarryOverPlan(briefing: Pick<BriefingDraft, 'items'>, selectedIds: readonly string[], opts: { tomorrowDateKey: string; now: string }): CarryOverPlan {
  const candidates = new Map<string, BriefingItemDraft>();
  for (const it of briefing.items) {
    if (it.section !== 'carried_over') continue;
    if (it.insightId) candidates.set(it.insightId, it);
    candidates.set(it.candidateId, it);
  }
  const carryOver: CarryOverPlan['carryOver'] = [];
  const ignoredIds: string[] = [];
  const seen = new Set<string>();
  for (const id of selectedIds) {
    const it = candidates.get(id);
    if (!it || !it.insightId || seen.has(it.insightId)) {
      if (!it || !it.insightId) ignoredIds.push(id);
      continue;
    }
    seen.add(it.insightId);
    carryOver.push({ insightId: it.insightId, entityType: it.entityType ?? null, entityId: it.entityId ?? null, forDate: opts.tomorrowDateKey });
  }
  return { closedAt: opts.now, carryOver, ignoredIds };
}

// ---------------------------------------------------------------------------
// Weekly share card (no personal details)
// ---------------------------------------------------------------------------

function rangeLabel(weekStart: string, weekEnd: string, locale: Locale): string {
  const a = parseDateKey(weekStart);
  const b = parseDateKey(weekEnd);
  const months = locale === 'en' ? MONTHS_EN_TITLE : MONTHS_TR_TITLE;
  const ma = months[a.m - 1] ?? '';
  const mb = months[b.m - 1] ?? '';
  if (a.m === b.m && a.y === b.y) return `${a.d}–${b.d} ${ma}`;
  return `${a.d} ${ma} – ${b.d} ${mb}`;
}

/** Share text for "Dijital Haftamı Paylaş": metrics only — never names, subjects or notes. */
export function weeklyShareText(metrics: WeeklyMetrics, opts: { locale?: Locale } = {}): string {
  const locale = opts.locale ?? 'tr';
  const en = locale === 'en';
  const range = rangeLabel(metrics.weekStart, metrics.weekEnd, locale);
  const lines = [en ? `MY DIGITAL WEEK · ${range}` : `DİJİTAL HAFTAM · ${range}`];
  lines.push(en ? `${metrics.analyzedEmails} emails analyzed` : `${metrics.analyzedEmails} mail analiz edildi`);
  lines.push(en ? `${metrics.importantItems} important topics surfaced` : `${metrics.importantItems} önemli konu öne çıkarıldı`);
  lines.push(en ? `${metrics.meetings} meetings · ${metrics.meetingsWithPrep} with prep notes` : `${metrics.meetings} toplantı · ${metrics.meetingsWithPrep} hazırlık notu`);
  lines.push(en ? `${metrics.followUps} follow-ups · ${metrics.followUpsAnswered} answered` : `${metrics.followUps} takip · ${metrics.followUpsAnswered} cevaplandı`);
  lines.push(
    metrics.deadlinesMissed === 0
      ? en
        ? `${metrics.deadlines} deadlines, none missed`
        : `${metrics.deadlines} son tarih, hiçbiri kaçmadı`
      : en
        ? `${metrics.deadlines} deadlines, ${metrics.deadlinesMissed} missed`
        : `${metrics.deadlines} son tarih, ${metrics.deadlinesMissed} tanesi kaçtı`,
  );
  lines.push(en ? `Time saved: ${formatMinutes(metrics.estimatedTimeSavedMinutes, 'en')}` : `Kazandığın zaman: ${formatMinutes(metrics.estimatedTimeSavedMinutes, 'tr')}`);
  lines.push('Dijital Asistan · dijitalasistan.app');
  return lines.join('\n');
}
