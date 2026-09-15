/**
 * Locale-aware, timezone-safe formatting. Turkish default: 24-hour clock, "5 Eylül Cumartesi".
 * All inputs are ISO UTC strings; the user's IANA timezone is always passed explicitly.
 */
import type { Locale } from '@da/domain';

const LOCALE_TAG: Record<Locale, string> = { tr: 'tr-TR', en: 'en-GB' };

export interface FormatCtx {
  locale: Locale;
  timezone: string;
  /** "now" injection for tests */
  now?: Date;
}

const dtf = (ctx: FormatCtx, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE_TAG[ctx.locale], {
    timeZone: ctx.timezone,
    hourCycle: 'h23',
    ...opts,
  });

export function formatTime(iso: string | Date, ctx: FormatCtx): string {
  return dtf(ctx, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** "5 Eylül Cumartesi" / "Saturday 5 September" */
export function formatDayHeader(iso: string | Date, ctx: FormatCtx): string {
  const d = new Date(iso);
  const day = dtf(ctx, { day: 'numeric', month: 'long' }).format(d);
  const weekday = dtf(ctx, { weekday: 'long' }).format(d);
  return ctx.locale === 'tr' ? `${day} ${weekday}` : `${weekday} ${day}`;
}

/** Kicker: "5 EYLÜL CUMARTESİ" (locale-aware upper-casing, İ handled) */
export function formatDayKicker(iso: string | Date, ctx: FormatCtx): string {
  return formatDayHeader(iso, ctx).toLocaleUpperCase(LOCALE_TAG[ctx.locale]);
}

/** "5 Eyl" / "5 Sep" */
export function formatShortDate(iso: string | Date, ctx: FormatCtx): string {
  return dtf(ctx, { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** "1–7 Eylül" */
export function formatDateRange(startIso: string, endIso: string, ctx: FormatCtx): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameMonth =
    dtf(ctx, { month: 'numeric' }).format(s) === dtf(ctx, { month: 'numeric' }).format(e);
  if (sameMonth) {
    const sd = dtf(ctx, { day: 'numeric' }).format(s);
    const ed = dtf(ctx, { day: 'numeric', month: 'long' }).format(e);
    return `${sd}–${ed}`;
  }
  return `${dtf(ctx, { day: 'numeric', month: 'long' }).format(s)} – ${dtf(ctx, { day: 'numeric', month: 'long' }).format(e)}`;
}

function localDateKey(d: Date, ctx: FormatCtx): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ctx.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** YYYY-MM-DD in the user's timezone */
export function toLocalDateKey(iso: string | Date, ctx: FormatCtx): string {
  return localDateKey(new Date(iso), ctx);
}

export function isToday(iso: string | Date, ctx: FormatCtx): boolean {
  return localDateKey(new Date(iso), ctx) === localDateKey(ctx.now ?? new Date(), ctx);
}

export function isTomorrow(iso: string | Date, ctx: FormatCtx): boolean {
  const now = ctx.now ?? new Date();
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  return localDateKey(new Date(iso), ctx) === localDateKey(tomorrow, ctx);
}

/**
 * Card time label: "08:42" (today) · "Yarın 12:00" · "Dün 15:40" · "2 Eyl" · relative "3 gün".
 */
export function formatRelativeLabel(iso: string | Date, ctx: FormatCtx): string {
  const d = new Date(iso);
  const now = ctx.now ?? new Date();
  const tr = ctx.locale === 'tr';
  if (isToday(d, ctx)) return formatTime(d, ctx);
  if (isTomorrow(d, ctx)) return `${tr ? 'Yarın' : 'Tomorrow'} ${formatTime(d, ctx)}`;
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  if (localDateKey(d, ctx) === localDateKey(yesterday, ctx))
    return `${tr ? 'Dün' : 'Yesterday'} ${formatTime(d, ctx)}`;
  return formatShortDate(d, ctx);
}

/** "3 gün" / "3 saat" / "20 dk" elapsed-or-remaining magnitude (no direction). */
export function formatDuration(minutes: number, locale: Locale): string {
  const tr = locale === 'tr';
  const abs = Math.abs(Math.round(minutes));
  if (abs < 60) return `${abs} ${tr ? 'dk' : 'min'}`;
  if (abs < 60 * 24) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m ? `${h} ${tr ? 'sa' : 'h'} ${m} ${tr ? 'dk' : 'min'}` : `${h} ${tr ? 'sa' : 'h'}`;
  }
  const days = Math.round(abs / (60 * 24));
  return `${days} ${tr ? 'gün' : days === 1 ? 'day' : 'days'}`;
}

/** "3 gündür bekliyor" / "waiting for 3 days" */
export function formatWaiting(sinceIso: string, ctx: FormatCtx): string {
  const now = ctx.now ?? new Date();
  const minutes = (now.getTime() - new Date(sinceIso).getTime()) / 60000;
  const dur = formatDuration(minutes, ctx.locale);
  return ctx.locale === 'tr'
    ? `${dur}dür bekliyor`
        .replace('gündür', 'gündür')
        .replace('sadür', 'saattir')
        .replace('dkdür', 'dakikadır')
    : `waiting for ${dur}`;
}

/** "4 sa kaldı" / "4h left" */
export function formatRemaining(untilIso: string, ctx: FormatCtx): string {
  const now = ctx.now ?? new Date();
  const minutes = (new Date(untilIso).getTime() - now.getTime()) / 60000;
  if (minutes <= 0) return ctx.locale === 'tr' ? 'süresi doldu' : 'overdue';
  return ctx.locale === 'tr'
    ? `${formatDuration(minutes, 'tr')} kaldı`
    : `${formatDuration(minutes, 'en')} left`;
}

/** "2 saat 48 dakika" long form */
export function formatDurationLong(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const tr = locale === 'tr';
  const parts: string[] = [];
  if (h) parts.push(`${h} ${tr ? 'saat' : h === 1 ? 'hour' : 'hours'}`);
  if (m || !h) parts.push(`${m} ${tr ? 'dakika' : m === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

/** "1.842 TL" / "₺1,842.00" */
export function formatMoney(amount: number, currency: string, locale: Locale): string {
  if (locale === 'tr' && currency === 'TRY') {
    return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount)} TL`;
  }
  return new Intl.NumberFormat(LOCALE_TAG[locale], { style: 'currency', currency }).format(amount);
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale]).format(n);
}

/** Greeting by local hour: Günaydın / İyi günler / İyi akşamlar */
export function greetingFor(ctx: FormatCtx): 'morning' | 'day' | 'evening' | 'night' {
  const now = ctx.now ?? new Date();
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ctx.timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

/** Turkish vowel-harmony aware possessive for names in "Mehmet'e", "Ayşe'ye", "Ahmet'in" is out of scope;
 *  we only need dative ("-e/-a") for "X'e gönder". */
export function dativeSuffix(name: string): string {
  const last =
    [...name.toLocaleLowerCase('tr-TR')].reverse().find((c) => 'aeıioöuü'.includes(c)) ?? 'e';
  const back = 'aıou'.includes(last);
  const endsWithVowel = 'aeıioöuü'.includes(name.toLocaleLowerCase('tr-TR').slice(-1));
  return `${name}'${endsWithVowel ? 'y' : ''}${back ? 'a' : 'e'}`;
}
