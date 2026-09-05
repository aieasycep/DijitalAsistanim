/** Human labels for instants: "bugün 17:00", "yarın", "Cuma", "12 Eylül", "9 Eylül'de". */
import type { Locale } from '@da/domain';
import { daysBetween, isoWeekday, localDateOf, localDateTimeOf } from './calendar';
import { MONTHS_EN_TITLE, MONTHS_TR_TITLE, WEEKDAYS_EN_TITLE, WEEKDAYS_TR_TITLE } from './lexicon';
import { pad2, timeWithDative, turkishLocative, turkishNumberLocative } from './turkish';

export interface FormatDateOptions {
  now: string;
  timezone: string;
  locale?: Locale;
  /** Append the clock time ("bugün 17:00"). */
  withTime?: boolean;
}

export function formatClock(iso: string, timezone: string): string {
  const t = localDateTimeOf(iso, timezone);
  return `${pad2(t.hh)}:${pad2(t.mm)}`;
}

/** Day label relative to now: bugün / yarın / weekday (≤ 6 days ahead) / "12 Eylül" (+ year if different). */
export function formatDayLabel(iso: string, opts: FormatDateOptions): string {
  const locale = opts.locale ?? 'tr';
  const today = localDateOf(opts.now, opts.timezone);
  const target = localDateOf(iso, opts.timezone);
  const diff = daysBetween(today, target);
  if (diff === 0) return locale === 'tr' ? 'bugün' : 'today';
  if (diff === 1) return locale === 'tr' ? 'yarın' : 'tomorrow';
  if (diff === -1) return locale === 'tr' ? 'dün' : 'yesterday';
  if (diff > 1 && diff <= 6) {
    const wd = isoWeekday(target) - 1;
    return (locale === 'tr' ? WEEKDAYS_TR_TITLE[wd] : WEEKDAYS_EN_TITLE[wd]) ?? '';
  }
  const month = (locale === 'tr' ? MONTHS_TR_TITLE[target.m - 1] : MONTHS_EN_TITLE[target.m - 1]) ?? '';
  const year = target.y !== today.y ? ` ${target.y}` : '';
  return `${target.d} ${month}${year}`;
}

/** "bugün 17:00", "yarın", "Cuma 14:00", "12 Eylül". */
export function formatDateLabel(iso: string, opts: FormatDateOptions): string {
  const day = formatDayLabel(iso, opts);
  return opts.withTime ? `${day} ${formatClock(iso, opts.timezone)}` : day;
}

/** Locative phrasing for sentences: "9 Eylül'de", "bugün", "yarın" / "on 9 September". Absolute beyond tomorrow. */
export function formatDateLocative(iso: string, opts: FormatDateOptions): string {
  const locale = opts.locale ?? 'tr';
  const today = localDateOf(opts.now, opts.timezone);
  const target = localDateOf(iso, opts.timezone);
  const diff = daysBetween(today, target);
  const time = opts.withTime ? ` ${formatClock(iso, opts.timezone)}` : '';
  if (diff === 0) return (locale === 'tr' ? 'bugün' : 'today') + time;
  if (diff === 1) return (locale === 'tr' ? 'yarın' : 'tomorrow') + time;
  const year = target.y !== today.y ? ` ${target.y}` : '';
  if (locale === 'tr') {
    const month = MONTHS_TR_TITLE[target.m - 1] ?? '';
    if (year) return `${target.d} ${month}${year}'${turkishNumberLocative(target.y)}${time}`;
    return `${turkishLocative(`${target.d} ${month}`)}${time}`;
  }
  return `on ${target.d} ${MONTHS_EN_TITLE[target.m - 1] ?? ''}${year}${time}`;
}

/** "bugün 17:00'ye kadar" / "by today 17:00" — for deadline sentences. */
export function formatDeadlinePhrase(iso: string, opts: FormatDateOptions & { hasTime?: boolean }): string {
  const locale = opts.locale ?? 'tr';
  const day = formatDayLabel(iso, opts);
  const t = localDateTimeOf(iso, opts.timezone);
  const hasTime = opts.hasTime ?? true;
  if (locale === 'tr') {
    if (hasTime) return `${day} ${timeWithDative(t.hh, t.mm)} kadar`;
    return `${day} sonuna kadar`;
  }
  return hasTime ? `by ${day} ${pad2(t.hh)}:${pad2(t.mm)}` : `by end of ${day}`;
}
