/**
 * Widget snapshot model + the bridge to expo-widgets.
 *
 * Widgets never fetch anything: the app builds a `WidgetSnapshot` from the Today feed after every
 * successful load (or the cached copy in the background), persists it in the encrypted cache and pushes a
 * timeline (now → after the next event) to the three widgets. Titles and counts only — never email bodies;
 * with lock-screen privacy `generic` only counts are exposed.
 *
 * Every native call is wrapped: in Expo Go, on web and in tests the registry is simply unavailable.
 */
import { Platform } from 'react-native';
import { formatTime, t } from '@da/i18n';
import { DeepLinks, type BriefingKind, type Insight, type Locale, type LockScreenPrivacy, type TodayFeed, type UserPreferences } from '@da/domain';
import type { Widget, WidgetTimelineEntry, createWidget as createWidgetFn } from 'expo-widgets';
import { env } from '@/lib/env';
import { captureError } from '@/lib/monitoring';
import { CacheKeys, readCache, writeCache } from '@/lib/storage';
import { currentLockScreenPrivacy } from './notifications';
import type { DailyBriefProps, NextImportantProps, TodayPrioritiesProps, WidgetTone } from '../../widgets/types';
import type { NextImportantWidget as NextImportantLayout } from '../../widgets/NextImportant';
import type { TodayPrioritiesWidget as TodayPrioritiesLayout } from '../../widgets/TodayPriorities';
import type { DailyBriefWidget as DailyBriefLayout } from '../../widgets/DailyBrief';

export const WIDGET_NAMES = { nextImportant: 'NextImportant', todayPriorities: 'TodayPriorities', dailyBrief: 'DailyBrief' } as const;

/** Widget props are sized for glanceability; the medium widget shows three rows. */
export const MAX_WIDGET_PRIORITIES = 3;
const MAX_UPCOMING_EVENTS = 3;

export interface WidgetPriority {
  id: string;
  title: string;
  timeLabel: string | null;
  badge: Insight['badge'] | 'none';
  deepLink: string;
}

export interface WidgetNextEvent {
  id: string;
  title: string;
  /** "14:30" */
  time: string;
  startAt: string;
  deepLink: string;
  sub: string | null;
}

export interface WidgetFollowUp {
  title: string;
  sub: string | null;
  deepLink: string;
}

export interface WidgetSnapshot {
  updatedAt: string;
  signedIn: boolean;
  /** `counts`: lock-screen privacy is `generic` — no titles anywhere. */
  privacy: 'full' | 'counts';
  /** Locale used for labels and locale-aware casing (Turkish İ/ı). */
  locale: Locale;
  headline: string;
  /** Number highlighted in the headline (briefing `highlightNumber`) when present. */
  highlight: number | null;
  itemCount: number;
  priorities: WidgetPriority[];
  upcomingEvents: WidgetNextEvent[];
  nextEvent: WidgetNextEvent | null;
  followUp: WidgetFollowUp | null;
  openFollowUps: number;
  pendingApprovals: number;
  briefingKind: BriefingKind | null;
  briefingId: string | null;
  audioDurationMin: number | null;
  generatedAtLabel: string | null;
}

export interface BuildSnapshotOptions {
  signedIn: boolean;
  privacy?: LockScreenPrivacy;
  now?: Date;
  timezone?: string;
  locale?: Locale;
}

// ---------------------------------------------------------------------------
// Deep links (scheme URLs — widgets open the app through the OS)
// ---------------------------------------------------------------------------

export function widgetSchemeUrl(path: string): string {
  return `${env.appScheme}://${path.replace(/^\//, '')}`;
}

/** Route for an insight's backing entity, following the DeepLinks contract. */
export function deepLinkForInsight(insight: Pick<Insight, 'entityType' | 'entityId'>): string {
  switch (insight.entityType) {
    case 'email_thread':
      return widgetSchemeUrl(DeepLinks.email(insight.entityId));
    case 'calendar_event':
      return widgetSchemeUrl(DeepLinks.meetingPrep(insight.entityId));
    case 'follow_up':
      return widgetSchemeUrl(DeepLinks.followUps());
    case 'conflict':
      return widgetSchemeUrl(DeepLinks.conflict(insight.entityId));
    case 'life_event':
      return widgetSchemeUrl(DeepLinks.lifeEvent(insight.entityId));
    case 'commitment':
      return widgetSchemeUrl(DeepLinks.commitments());
    case 'task':
      return widgetSchemeUrl(DeepLinks.plan());
    default:
      return widgetSchemeUrl(DeepLinks.today());
  }
}

// ---------------------------------------------------------------------------
// Snapshot builder (pure)
// ---------------------------------------------------------------------------

const LOCALE_TAG: Record<Locale, string> = { tr: 'tr-TR', en: 'en-GB' };

/** Locale-aware casing: `toLocaleUpperCase()` without a tag turns Turkish "İ" into "I". */
export function upper(value: string, locale: Locale): string {
  return value.toLocaleUpperCase(LOCALE_TAG[locale]);
}

export function lower(value: string, locale: Locale): string {
  return value.toLocaleLowerCase(LOCALE_TAG[locale]);
}

function ctx(opts: Partial<BuildSnapshotOptions>): { locale: Locale; timezone: string } {
  const prefs = readCache<UserPreferences>(CacheKeys.preferences);
  let deviceTz = 'Europe/Istanbul';
  try {
    deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || deviceTz;
  } catch {
    // keep default
  }
  return { locale: opts.locale ?? prefs?.locale ?? 'tr', timezone: opts.timezone ?? prefs?.timezone ?? deviceTz };
}

function clock(iso: string, c: { locale: Locale; timezone: string }): string {
  try {
    return formatTime(iso, c);
  } catch {
    return iso.slice(11, 16);
  }
}

const isActive = (i: Insight): boolean => i.status === 'active' && !i.deletedAt;

function priorityLabel(i: Insight, c: { locale: Locale; timezone: string }): string | null {
  if (i.timeLabel) return i.timeLabel;
  if (i.dueAt) return clock(i.dueAt, c);
  return null;
}

function countsOnlyTitle(count: number, locale: Locale): string {
  return `${count} ${lower(t('flow.filters.important'), locale)} ${t('common.items')}`;
}

export function emptySnapshot(signedIn: boolean, now = new Date(), locale: Locale = ctx({}).locale): WidgetSnapshot {
  return {
    updatedAt: now.toISOString(),
    signedIn,
    privacy: 'full',
    locale,
    headline: signedIn ? t('today.headlineZero') : t('widgets.signInHint'),
    highlight: null,
    itemCount: 0,
    priorities: [],
    upcomingEvents: [],
    nextEvent: null,
    followUp: null,
    openFollowUps: 0,
    pendingApprovals: 0,
    briefingKind: null,
    briefingId: null,
    audioDurationMin: null,
    generatedAtLabel: null,
  };
}

/** Builds the widget snapshot from a Today feed. Pure apart from reading cached locale/timezone. */
export function buildWidgetSnapshot(today: TodayFeed | null, opts: BuildSnapshotOptions): WidgetSnapshot {
  const now = opts.now ?? new Date();
  if (!opts.signedIn || !today) return emptySnapshot(opts.signedIn, now, opts.locale);
  const c = ctx(opts);
  const counts = opts.privacy === 'generic';

  const activePriorities = today.priorities.filter(isActive);
  const activeMeetings = today.meetings.filter(isActive);
  const activeDeadlines = today.deadlines.filter(isActive);
  const activeLife = today.lifeEvents.filter(isActive);
  const briefing = today.briefing ?? null;
  const itemCount = briefing?.highlightNumber ?? activePriorities.length + activeMeetings.length + activeDeadlines.length + activeLife.length;

  const priorities: WidgetPriority[] = activePriorities.slice(0, MAX_WIDGET_PRIORITIES).map((i, index) => ({
    id: i.id,
    title: counts ? countsOnlyTitle(index + 1, c.locale) : i.title,
    timeLabel: priorityLabel(i, c),
    badge: i.badge,
    deepLink: counts ? widgetSchemeUrl(DeepLinks.today()) : deepLinkForInsight(i),
  }));

  const upcomingEvents: WidgetNextEvent[] = activeMeetings
    .filter((i) => i.entityType === 'calendar_event' && i.dueAt && Date.parse(i.dueAt) > now.getTime())
    .sort((a, b) => Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? ''))
    .slice(0, MAX_UPCOMING_EVENTS)
    .map((i) => ({
      id: i.entityId,
      title: counts ? t('widgets.nextEvent') : i.title,
      time: clock(i.dueAt ?? '', c),
      startAt: i.dueAt ?? now.toISOString(),
      deepLink: counts ? widgetSchemeUrl(DeepLinks.plan()) : deepLinkForInsight(i),
      sub: counts ? null : (i.subtitle ?? null),
    }));

  const followUpInsights = [...activePriorities, ...activeDeadlines].filter((i) => i.kind === 'follow_up' || i.badge === 'follow_up');
  const openFollowUps = briefing?.counts.followUps ?? followUpInsights.length;
  const first = followUpInsights[0];
  const followUp: WidgetFollowUp | null =
    openFollowUps > 0
      ? {
          title: counts || !first ? `${openFollowUps} ${lower(t('widgets.openFollowUps'), c.locale)}` : first.title,
          sub: counts || !first ? null : (first.subtitle ?? first.timeLabel ?? null),
          deepLink: widgetSchemeUrl(DeepLinks.followUps()),
        }
      : null;

  const headline = briefing?.headline ?? (itemCount > 0 ? t('today.headline', { count: itemCount }) : t('today.headlineZero'));
  const highlight = briefing ? briefing.highlightNumber : itemCount > 0 ? itemCount : null;
  const audioSec = briefing?.audio?.durationSec ?? briefing?.estimatedReadSec ?? null;

  return {
    updatedAt: now.toISOString(),
    signedIn: true,
    privacy: counts ? 'counts' : 'full',
    locale: c.locale,
    headline,
    highlight: highlight !== null && headline.includes(String(highlight)) ? highlight : null,
    itemCount,
    priorities,
    upcomingEvents,
    nextEvent: upcomingEvents[0] ?? null,
    followUp,
    openFollowUps,
    pendingApprovals: today.pendingApprovals,
    briefingKind: briefing?.kind ?? null,
    briefingId: briefing?.id ?? null,
    audioDurationMin: audioSec ? Math.max(1, Math.ceil(audioSec / 60)) : null,
    generatedAtLabel: briefing ? clock(briefing.generatedAt, c) : null,
  };
}

// ---------------------------------------------------------------------------
// Snapshot → widget props (all labels resolved here)
// ---------------------------------------------------------------------------

function toneOf(badge: WidgetPriority['badge']): WidgetTone {
  switch (badge) {
    case 'urgent':
    case 'security':
      return 'critical';
    case 'deadline':
    case 'waiting':
      return 'warning';
    case 'follow_up':
    case 'commitment':
    case 'personal':
      return 'accent';
    default:
      return 'neutral';
  }
}

function badgeLabel(badge: WidgetPriority['badge']): string | null {
  return badge === 'none' ? null : t(`badges.${badge}`);
}

function todayUrl(): string {
  return widgetSchemeUrl(DeepLinks.today());
}

export function snapshotToNextImportantProps(s: WidgetSnapshot): NextImportantProps {
  const top = s.priorities[0] ?? null;
  const first = top?.timeLabel ?? s.nextEvent?.time ?? null;
  const countLabel = countsOnlyTitle(s.itemCount, s.locale);
  const inlineLabel = s.itemCount === 0 ? t('widgets.allClear') : first ? `${countLabel} · ${first}` : countLabel;
  const kicker = upper(t('widgets.nextImportant'), s.locale);
  return {
    signedIn: s.signedIn,
    kicker,
    item: top
      ? {
          title: top.title,
          badgeLabel: s.privacy === 'counts' ? null : badgeLabel(top.badge),
          tone: toneOf(top.badge),
          meta: top.timeLabel ?? (s.generatedAtLabel ? `${t('widgets.brief')} · ${s.generatedAtLabel}` : t('common.today')),
          deepLink: top.deepLink,
        }
      : null,
    count: s.itemCount,
    inlineLabel,
    circularLabel: upper(t('flow.filters.important'), s.locale),
    rectangular: s.nextEvent
      ? { kicker: `${kicker} · ${s.nextEvent.time}`, title: s.nextEvent.title, sub: s.nextEvent.sub, deepLink: s.nextEvent.deepLink }
      : top
        ? { kicker, title: top.title, sub: top.timeLabel, deepLink: top.deepLink }
        : null,
    emptyTitle: t('widgets.allClear'),
    signedOutTitle: t('widgets.signInHint'),
    todayUrl: todayUrl(),
  };
}

export function snapshotToTodayPrioritiesProps(s: WidgetSnapshot): TodayPrioritiesProps {
  return {
    signedIn: s.signedIn,
    header: upper(t('widgets.priorities', { count: s.priorities.length }), s.locale),
    timeLabel: s.generatedAtLabel,
    rows: s.priorities.map((p) => ({ id: p.id, title: p.title, time: p.timeLabel, tone: toneOf(p.badge), deepLink: p.deepLink })),
    emptyTitle: t('widgets.allClear'),
    signedOutTitle: t('widgets.signInHint'),
    todayUrl: todayUrl(),
  };
}

function splitHeadline(headline: string, highlight: number | null): { before: string; highlight: string | null; after: string } {
  if (highlight === null) return { before: headline, highlight: null, after: '' };
  const token = String(highlight);
  const idx = headline.indexOf(token);
  if (idx === -1) return { before: headline, highlight: null, after: '' };
  return { before: headline.slice(0, idx), highlight: token, after: headline.slice(idx + token.length) };
}

function briefKicker(kind: BriefingKind | null, locale: Locale): string {
  switch (kind) {
    case 'midday':
      return t('briefing.middayKicker');
    case 'evening':
      return t('today.eveningReady');
    case 'weekly':
      return upper(t('briefing.weeklySubtitle'), locale);
    default:
      return upper(t('widgets.brief'), locale);
  }
}

export function snapshotToDailyBriefProps(s: WidgetSnapshot): DailyBriefProps {
  const parts = splitHeadline(s.headline, s.highlight);
  const briefingPath = s.briefingKind ? DeepLinks.briefing(s.briefingKind, s.briefingId ?? undefined) : DeepLinks.today();
  const [h = '', m = ''] = (s.nextEvent?.time ?? '').split(':');
  return {
    signedIn: s.signedIn,
    briefKicker: briefKicker(s.briefingKind, s.locale),
    headlineBefore: parts.before,
    highlight: parts.highlight,
    headlineAfter: parts.after,
    listenLabel: s.audioDurationMin && s.briefingKind ? t('today.listen', { minutes: s.audioDurationMin }) : null,
    briefingUrl: widgetSchemeUrl(s.briefingKind ? `${briefingPath}${briefingPath.includes('?') ? '&' : '?'}autoplay=1` : briefingPath),
    nextEventKicker: upper(t('widgets.nextEvent'), s.locale),
    nextEvent: s.nextEvent ? { hour: h, minute: m, title: s.nextEvent.title, sub: s.nextEvent.sub, deepLink: s.nextEvent.deepLink } : null,
    noEventLabel: t('empty.meetings'),
    followUpKicker: upper(t('widgets.openFollowUps'), s.locale),
    followUp: s.followUp ? { title: s.followUp.title, sub: s.followUp.sub, deepLink: s.followUp.deepLink } : null,
    emptyTitle: t('widgets.allClear'),
    signedOutTitle: t('widgets.signInHint'),
    todayUrl: todayUrl(),
  };
}

// ---------------------------------------------------------------------------
// Timeline: one entry now, then one right after each upcoming event starts (the "next event" rolls over)
// ---------------------------------------------------------------------------

export interface SnapshotTimelineEntry {
  date: Date;
  snapshot: WidgetSnapshot;
}

export function buildSnapshotTimeline(snapshot: WidgetSnapshot, now = new Date()): SnapshotTimelineEntry[] {
  const entries: SnapshotTimelineEntry[] = [{ date: now, snapshot }];
  snapshot.upcomingEvents.forEach((event, index) => {
    const rollover = new Date(Date.parse(event.startAt) + 60_000);
    if (Number.isNaN(rollover.getTime()) || rollover <= now) return;
    const remaining = snapshot.upcomingEvents.slice(index + 1);
    entries.push({ date: rollover, snapshot: { ...snapshot, upcomingEvents: remaining, nextEvent: remaining[0] ?? null } });
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Registry (lazy — expo-widgets and @expo/ui are absent in Expo Go / tests / web)
// ---------------------------------------------------------------------------

interface WidgetHandles {
  nextImportant: Widget<NextImportantProps>;
  todayPriorities: Widget<TodayPrioritiesProps>;
  dailyBrief: Widget<DailyBriefProps>;
}

let handles: WidgetHandles | null | undefined;

function getWidgetHandles(): WidgetHandles | null {
  if (handles !== undefined) return handles;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    handles = null;
    return handles;
  }
  try {
    const widgets = require('expo-widgets') as { createWidget: typeof createWidgetFn };
    const next = require('../../widgets/NextImportant') as { NextImportantWidget: typeof NextImportantLayout };
    const today = require('../../widgets/TodayPriorities') as { TodayPrioritiesWidget: typeof TodayPrioritiesLayout };
    const brief = require('../../widgets/DailyBrief') as { DailyBriefWidget: typeof DailyBriefLayout };
    handles = {
      nextImportant: widgets.createWidget<NextImportantProps>(WIDGET_NAMES.nextImportant, next.NextImportantWidget),
      todayPriorities: widgets.createWidget<TodayPrioritiesProps>(WIDGET_NAMES.todayPriorities, today.TodayPrioritiesWidget),
      dailyBrief: widgets.createWidget<DailyBriefProps>(WIDGET_NAMES.dailyBrief, brief.DailyBriefWidget),
    };
  } catch {
    // Native widget module unavailable (Expo Go, web, tests) — widgets stay dormant.
    handles = null;
  }
  return handles;
}

export function areWidgetsAvailable(): boolean {
  return getWidgetHandles() !== null;
}

function toEntries<P extends object>(timeline: SnapshotTimelineEntry[], map: (s: WidgetSnapshot) => P): WidgetTimelineEntry<P>[] {
  return timeline.map((e) => ({ date: e.date, props: map(e.snapshot) }));
}

/** Pushes a snapshot timeline to every widget. Never throws. */
export function pushSnapshotToWidgets(snapshot: WidgetSnapshot, now = new Date()): boolean {
  const w = getWidgetHandles();
  if (!w) return false;
  const timeline = buildSnapshotTimeline(snapshot, now);
  let ok = true;
  const push = <P extends object>(widget: Widget<P>, map: (s: WidgetSnapshot) => P, name: string) => {
    try {
      widget.updateTimeline(toEntries(timeline, map));
    } catch (e) {
      ok = false;
      captureError(e, { where: 'pushSnapshotToWidgets', widget: name });
    }
  };
  push(w.nextImportant, snapshotToNextImportantProps, WIDGET_NAMES.nextImportant);
  push(w.todayPriorities, snapshotToTodayPrioritiesProps, WIDGET_NAMES.todayPriorities);
  push(w.dailyBrief, snapshotToDailyBriefProps, WIDGET_NAMES.dailyBrief);
  return ok;
}

export function readWidgetSnapshot(): WidgetSnapshot | null {
  try {
    return readCache<WidgetSnapshot>(CacheKeys.widgetSnapshot);
  } catch {
    return null;
  }
}

function persistSnapshot(snapshot: WidgetSnapshot): void {
  try {
    writeCache(CacheKeys.widgetSnapshot, snapshot);
  } catch (e) {
    captureError(e, { where: 'persistWidgetSnapshot' });
  }
}

/** Builds, persists and pushes the snapshot for a Today feed (privacy from cached notification prefs). */
export async function syncWidgetsFromToday(today: TodayFeed, signedIn: boolean, opts: Omit<BuildSnapshotOptions, 'signedIn'> = {}): Promise<WidgetSnapshot> {
  const snapshot = buildWidgetSnapshot(today, { signedIn, privacy: opts.privacy ?? currentLockScreenPrivacy(), now: opts.now, timezone: opts.timezone, locale: opts.locale });
  persistSnapshot(snapshot);
  pushSnapshotToWidgets(snapshot, opts.now);
  return snapshot;
}

/** Pushes the signed-out state ("Giriş yapınca burada özet görünür."). */
export async function syncWidgetsSignedOut(): Promise<WidgetSnapshot> {
  const snapshot = emptySnapshot(false);
  persistSnapshot(snapshot);
  pushSnapshotToWidgets(snapshot);
  return snapshot;
}

/** Re-syncs from the cached Today feed (foreground / background task without network). */
export async function syncWidgetsFromCache(signedIn: boolean): Promise<WidgetSnapshot | null> {
  if (!signedIn) return syncWidgetsSignedOut();
  const cached = readCache<TodayFeed>(CacheKeys.todaySnapshot);
  if (!cached) return null;
  return syncWidgetsFromToday(cached, true);
}
