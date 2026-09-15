/**
 * Small Turkish date/time phrase parser used by capture, assistant write intents and post-meeting notes.
 * Only phrases that are explicitly present in the text are resolved — nothing is invented.
 */
import type { ISODate, ISODateTime } from '@da/domain';
import { addDaysToKey, daysBetweenKeys, parseDateKey, type DemoClock } from '../clock';
import { hhmmFromParts } from '../format';
import { fold } from '../text';

export interface DatePhrase {
  /** Original substring as written by the user. */
  text: string;
  iso: ISODateTime | null;
  kind: 'day' | 'time' | 'datetime' | 'week';
}

export interface ParsedSchedule {
  /** Resolved instant (day + time or defaults) — null when no phrase was found. */
  iso: ISODateTime | null;
  /** Local date key when a day phrase was found. */
  dateKey: ISODate | null;
  /** HH:mm when an explicit time (or daypart) was found. */
  time: string | null;
  /** Human text of the matched phrases ("yarın", "Perşembe 15:00"). */
  text: string | null;
  phrases: DatePhrase[];
}

const WEEKDAYS: Array<{ word: string; index: number }> = [
  { word: 'pazartesi', index: 1 },
  { word: 'cumartesi', index: 6 },
  { word: 'carsamba', index: 3 },
  { word: 'persembe', index: 4 },
  { word: 'pazar', index: 0 },
  { word: 'sali', index: 2 },
  { word: 'cuma', index: 5 },
];

const MONTHS: string[] = [
  'ocak',
  'subat',
  'mart',
  'nisan',
  'mayis',
  'haziran',
  'temmuz',
  'agustos',
  'eylul',
  'ekim',
  'kasim',
  'aralik',
];

const DAYPARTS: Array<{ pattern: RegExp; time: string }> = [
  { pattern: /\bogleden sonra\b/, time: '14:00' },
  { pattern: /\baksam(i|leyin|ustu)?\b/, time: '19:00' },
  { pattern: /\bsabah(i|leyin)?\b/, time: '09:10' },
  { pattern: /\bogle(n|ne|ye|de)?\b/, time: '12:00' },
];

export function parseSchedule(
  text: string,
  clock: DemoClock,
  opts: { defaultTime?: string; preferFuture?: boolean } = {},
): ParsedSchedule {
  const folded = fold(text);
  const today = clock.today();
  const phrases: DatePhrase[] = [];
  let dateKey: ISODate | null = null;
  let time: string | null = null;
  let weekPhrase = false;

  const mark = (match: RegExpMatchArray, kind: DatePhrase['kind']): void => {
    const start = match.index ?? 0;
    phrases.push({ text: text.slice(start, start + match[0].length), iso: null, kind });
  };

  // Explicit "12 Eylül" style dates first (they win over relative words).
  const absolute = folded.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join('|')})\\b`));
  if (absolute) {
    const day = Number(absolute[1]);
    const month = MONTHS.indexOf(absolute[2] ?? '') + 1;
    const { year } = parseDateKey(today);
    let key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (opts.preferFuture !== false && daysBetweenKeys(today, key) < -30)
      key = `${year + 1}-${key.slice(5)}`;
    dateKey = key;
    mark(absolute, 'day');
  }

  if (!dateKey) {
    const relative: Array<{ pattern: RegExp; offset: number }> = [
      { pattern: /\bbugun\b/, offset: 0 },
      { pattern: /\byarin\b/, offset: 1 },
      { pattern: /\b(obur|ertesi) gun\b/, offset: 2 },
    ];
    for (const r of relative) {
      const m = folded.match(r.pattern);
      if (m) {
        dateKey = addDaysToKey(today, r.offset);
        mark(m, 'day');
        break;
      }
    }
  }

  if (!dateKey) {
    for (const w of WEEKDAYS) {
      const m = folded.match(
        new RegExp(`\\b${w.word}(ya|ye|'ya|'ye|'e|'a|si|gunu|aksami|sabahi)?\\b`),
      );
      if (m) {
        const todayIndex = new Date(
          Date.UTC(
            parseDateKey(today).year,
            parseDateKey(today).month - 1,
            parseDateKey(today).day,
          ),
        ).getUTCDay();
        const ahead = (w.index - todayIndex + 7) % 7;
        dateKey = addDaysToKey(today, ahead);
        mark(m, 'day');
        break;
      }
    }
  }

  if (!dateKey) {
    const week = folded.match(/\b(haftaya|gelecek hafta|onumuzdeki hafta)\b/);
    if (week) {
      dateKey = addDaysToKey(today, 7);
      weekPhrase = true;
      mark(week, 'week');
    } else {
      const thisWeek = folded.match(/\b(bu hafta|hafta icinde|hafta sonuna kadar)\b/);
      if (thisWeek) {
        const { year, month, day } = parseDateKey(today);
        const todayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        const toFriday = (5 - todayIndex + 7) % 7;
        dateKey = addDaysToKey(today, toFriday);
        weekPhrase = true;
        mark(thisWeek, 'week');
      }
    }
  }

  const explicitTime =
    folded.match(/\b(\d{1,2})[:.](\d{2})\b/) ?? folded.match(/\bsaat (\d{1,2})\b/);
  if (explicitTime) {
    const hour = Number(explicitTime[1]);
    const minute = explicitTime[2] === undefined ? 0 : Number(explicitTime[2]);
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      time = hhmmFromParts(hour, minute);
      mark(explicitTime, 'time');
    }
  }
  if (!time) {
    for (const part of DAYPARTS) {
      const m = folded.match(part.pattern);
      if (m) {
        time = part.time;
        mark(m, 'time');
        break;
      }
    }
  }

  let iso: ISODateTime | null = null;
  if (dateKey && time) iso = clock.atIso(dateKey, time);
  else if (dateKey) iso = clock.atIso(dateKey, opts.defaultTime ?? '18:00');
  else if (time) {
    const todayAt = clock.at(today, time);
    iso =
      todayAt.getTime() > clock.now().getTime()
        ? todayAt.toISOString()
        : clock.atIso(addDaysToKey(today, 1), time);
    dateKey = clock.dateKey(iso);
  }

  for (const p of phrases) {
    if (p.kind === 'time') p.iso = iso;
    else
      p.iso = dateKey
        ? p.kind === 'week'
          ? iso
          : time
            ? iso
            : clock.atIso(dateKey, opts.defaultTime ?? '18:00')
        : null;
  }

  const textLabel = phrases.length ? phrases.map((p) => p.text).join(' ') : null;
  return { iso, dateKey: weekPhrase ? dateKey : dateKey, time, text: textLabel, phrases };
}

/** Removes the matched schedule phrases from a sentence (used to derive titles from free text). */
export function stripPhrases(text: string, phrases: DatePhrase[]): string {
  let out = text;
  for (const p of phrases) out = out.replace(p.text, ' ');
  return out.replace(/\s+/g, ' ').trim();
}
