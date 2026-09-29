/** Turkish date / label helpers used by the demo adapter (hand-rolled so output never depends on ICU data). */
import type { ISODate, ISODateTime } from '@da/domain';
import { daysBetweenKeys, pad2, parseDateKey, type DemoClock } from './clock';

export const MONTHS_LONG = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;
export const MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;
export const WEEKDAYS_LONG = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
] as const;
export const WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

export function monthLong(month: number): string {
  return MONTHS_LONG[month - 1] ?? '';
}
export function monthShort(month: number): string {
  return MONTHS_SHORT[month - 1] ?? '';
}
export function weekdayLong(key: ISODate): string {
  const { year, month, day } = parseDateKey(key);
  return WEEKDAYS_LONG[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
}
export function weekdayShort(key: ISODate): string {
  const { year, month, day } = parseDateKey(key);
  return WEEKDAYS_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? '';
}

/** "5 Eylül Cumartesi" */
export function fullDateLabel(key: ISODate): string {
  const { month, day } = parseDateKey(key);
  return `${day} ${monthLong(month)} ${weekdayLong(key)}`;
}
/** "10 Eyl" */
export function dayMonthShort(key: ISODate): string {
  const { month, day } = parseDateKey(key);
  return `${day} ${monthShort(month)}`;
}
/** "10 Eylül" */
export function dayMonthLong(key: ISODate): string {
  const { month, day } = parseDateKey(key);
  return `${day} ${monthLong(month)}`;
}
/** "7–13 Eylül" or "29 Ağu – 4 Eyl" */
export function rangeLabel(start: ISODate, end: ISODate): string {
  const a = parseDateKey(start);
  const b = parseDateKey(end);
  if (a.month === b.month) return `${a.day}–${b.day} ${monthLong(a.month)}`;
  return `${a.day} ${monthShort(a.month)} – ${b.day} ${monthShort(b.month)}`;
}

/** Relative day word: Bugün / Yarın / Dün / weekday (within a week) / "10 Eyl". */
export function relativeDayLabel(clock: DemoClock, at: ISODateTime | ISODate): string {
  const key = at.length === 10 ? at : clock.dateKey(at);
  const diff = daysBetweenKeys(clock.today(), key);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  if (diff > 1 && diff < 7) return weekdayLong(key);
  return dayMonthShort(key);
}

/** "Yarın 12:00", "Bugün 17:00", "10 Eyl" (no time when the instant is end-of-day). */
export function dueLabel(clock: DemoClock, at: ISODateTime): string {
  const day = relativeDayLabel(clock, at);
  const time = clock.hhmm(at);
  if (time === '23:59' || time === '00:00') return day;
  return `${day} ${time}`;
}

/** Time label as used on Today cards: "08:42" today, "Yarın 12:00", "3 gün" for elapsed. */
export function elapsedDaysLabel(clock: DemoClock, since: ISODateTime): string {
  const days = daysBetweenKeys(clock.dateKey(since), clock.today());
  if (days <= 0) return clock.hhmm(since);
  if (days === 1) return 'Dün';
  return `${days} gün`;
}

export function durationLabel(startAt: ISODateTime, endAt: ISODateTime): string {
  const minutes = Math.max(0, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000));
  if (minutes < 60 || minutes % 60 !== 0) return `${minutes} dk`;
  return `${minutes / 60} saat`;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

/** Turkish thousands formatting: 1842 → "1.842", 229.99 → "229,99". */
export function formatAmount(amount: number): string {
  const [int, frac] = amount.toFixed(amount % 1 === 0 ? 0 : 2).split('.');
  const grouped = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${grouped},${frac}` : grouped;
}

const BACK_VOWELS = /[aıou]/;
const VOWELS = /[aeıioöuü]/i;

/** Turkish dative suffix with apostrophe: Ahmet'e, Burak'a, Ayşe'ye, Selin'e. */
export function dative(name: string): string {
  const base = name.trim();
  const lower = base.toLowerCase();
  const lastVowelMatch = lower.match(/[aeıioöuü](?!.*[aeıioöuü])/);
  const lastVowel = lastVowelMatch ? lastVowelMatch[0] : 'e';
  const back = BACK_VOWELS.test(lastVowel);
  const endsWithVowel = VOWELS.test(lower.slice(-1));
  const suffix = `${endsWithVowel ? 'y' : ''}${back ? 'a' : 'e'}`;
  return `${base}'${suffix}`;
}

/** Turkish ablative: Mehmet'ten, Ahmet'ten, Burak'tan, Selin'den. */
export function ablative(name: string): string {
  const base = name.trim();
  const lower = base.toLowerCase();
  const lastVowelMatch = lower.match(/[aeıioöuü](?!.*[aeıioöuü])/);
  const back = BACK_VOWELS.test(lastVowelMatch ? lastVowelMatch[0] : 'e');
  const hard = /[fstkçşhp]$/.test(lower);
  return `${base}'${hard ? 't' : 'd'}${back ? 'an' : 'en'}`;
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

export function hhmmFromParts(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}
