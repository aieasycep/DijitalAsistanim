/** Month / weekday / time-of-day vocabulary (Turkish + English) and regex building blocks. */
import { escapeRegex, flexI } from './turkish';

/** Word boundary that also works for non-ASCII letters (ş, ı, ğ …). */
export const B = '(?<![\\p{L}\\p{N}])';
export const E = '(?![\\p{L}\\p{N}])';

/** Optional Turkish case suffix glued to a date word: Eylül'e, Cuma'ya, yarına, Eylülde … */
export const SUF = flexI(
  "(?:'?(?:nden|ndan|nde|nda|den|dan|ten|tan|de|da|te|ta|ye|ya|ne|na|ni|nı|nu|nü|yi|yı|yu|yü|nin|nın|nun|nün|si|sı|su|sü|ki|kü|in|ın|un|ün|e|a|i|ı|u|ü))?",
);

export const MONTHS_TR = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'] as const;
export const MONTHS_TR_TITLE = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;
export const MONTHS_TR_ABBR = ['oca', 'şub', 'mar', 'nis', 'may', 'haz', 'tem', 'ağu', 'eyl', 'eki', 'kas', 'ara'] as const;
export const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const;
export const MONTHS_EN_TITLE = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const MONTHS_EN_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

export const WEEKDAYS_TR = ['pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi', 'pazar'] as const;
export const WEEKDAYS_TR_TITLE = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;
export const WEEKDAYS_EN = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export const WEEKDAYS_EN_TITLE = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const WEEKDAYS_TR_SAFE_ABBR = ['pzt', 'çar', 'cmt'] as const;
export const WEEKDAYS_EN_ABBR = ['mon', 'tues', 'tue', 'wed', 'thurs', 'thur', 'thu', 'fri', 'sat', 'sun'] as const;

/** Build an alternation of literal words, longest first, with ı/i made interchangeable. */
export function alternation(words: readonly string[]): string {
  return [...words]
    .sort((a, b) => b.length - a.length)
    .map((x) => flexI(escapeRegex(x)))
    .join('|');
}

function normalizeKey(s: string): string {
  return s.replace(/ı/g, 'i').replace(/\.$/, '').trim();
}

const MONTH_INDEX: Record<string, number> = {};
for (const list of [MONTHS_TR, MONTHS_TR_ABBR, MONTHS_EN, MONTHS_EN_ABBR]) {
  list.forEach((name, i) => {
    MONTH_INDEX[normalizeKey(name)] = i + 1;
  });
}
MONTH_INDEX['sept'] = 9;

const WEEKDAY_INDEX: Record<string, number> = {};
for (const list of [WEEKDAYS_TR, WEEKDAYS_EN]) {
  list.forEach((name, i) => {
    WEEKDAY_INDEX[normalizeKey(name)] = i + 1;
  });
}
WEEKDAY_INDEX['pzt'] = 1;
WEEKDAY_INDEX['çar'] = 3;
WEEKDAY_INDEX['cmt'] = 6;
WEEKDAY_INDEX['mon'] = 1;
WEEKDAY_INDEX['tue'] = 2;
WEEKDAY_INDEX['tues'] = 2;
WEEKDAY_INDEX['wed'] = 3;
WEEKDAY_INDEX['thu'] = 4;
WEEKDAY_INDEX['thur'] = 4;
WEEKDAY_INDEX['thurs'] = 4;
WEEKDAY_INDEX['fri'] = 5;
WEEKDAY_INDEX['sat'] = 6;
WEEKDAY_INDEX['sun'] = 7;

/** 1-12 or null */
export function monthIndex(name: string): number | null {
  return MONTH_INDEX[normalizeKey(name)] ?? null;
}

/** 1 (Mon) – 7 (Sun) or null */
export function weekdayIndex(name: string): number | null {
  return WEEKDAY_INDEX[normalizeKey(name)] ?? null;
}

export const MONTH_TR_FULL_ALT = alternation(MONTHS_TR);
export const MONTH_TR_ABBR_ALT = alternation(MONTHS_TR_ABBR);
export const MONTH_EN_ALT = alternation([...MONTHS_EN, ...MONTHS_EN_ABBR, 'sept']);
export const WEEKDAY_FULL_ALT = alternation([...WEEKDAYS_TR, ...WEEKDAYS_TR_SAFE_ABBR, ...WEEKDAYS_EN]);
export const WEEKDAY_EN_ABBR_ALT = alternation(WEEKDAYS_EN_ABBR);

export type TimeOfDayCategory = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

export interface TimeOfDayEntry {
  category: TimeOfDayCategory;
  hh: number;
  mm: number;
}

/** Default clock times for time-of-day words: sabah 09:00, öğlen 12:00, akşam 19:00. */
export const TIME_OF_DAY: Record<string, TimeOfDayEntry> = {
  sabah: { category: 'morning', hh: 9, mm: 0 },
  sabahleyin: { category: 'morning', hh: 9, mm: 0 },
  morning: { category: 'morning', hh: 9, mm: 0 },
  öğlen: { category: 'noon', hh: 12, mm: 0 },
  öğle: { category: 'noon', hh: 12, mm: 0 },
  noon: { category: 'noon', hh: 12, mm: 0 },
  'öğleden sonra': { category: 'afternoon', hh: 14, mm: 0 },
  afternoon: { category: 'afternoon', hh: 14, mm: 0 },
  akşam: { category: 'evening', hh: 19, mm: 0 },
  akşamüstü: { category: 'evening', hh: 17, mm: 0 },
  'akşam üstü': { category: 'evening', hh: 17, mm: 0 },
  evening: { category: 'evening', hh: 19, mm: 0 },
  gece: { category: 'night', hh: 21, mm: 0 },
  night: { category: 'night', hh: 21, mm: 0 },
  tonight: { category: 'night', hh: 20, mm: 0 },
};

export const TIME_OF_DAY_ALT = alternation(Object.keys(TIME_OF_DAY).filter((k) => k !== 'tonight'));

export function timeOfDay(word: string): TimeOfDayEntry | null {
  const key = word.replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
  for (const [k, v] of Object.entries(TIME_OF_DAY)) {
    if (k.replace(/ı/g, 'i') === key) return v;
  }
  return null;
}

/** "akşam 8" → 20, "sabah 9" → 9, "öğleden sonra 3" → 15, "gece 1" → 1. */
export function adjustHourForTimeOfDay(category: TimeOfDayCategory, hh: number): number {
  switch (category) {
    case 'morning':
      return hh;
    case 'noon':
      return hh < 6 ? hh + 12 : hh;
    case 'afternoon':
    case 'evening':
      return hh < 12 ? hh + 12 : hh;
    case 'night':
      return hh >= 6 && hh < 12 ? hh + 12 : hh;
  }
}

const TR_NUMBER_WORDS: Record<string, number> = {
  bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, 'on beş': 15, yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60,
};
const EN_NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
};

export const TR_NUMBER_ALT = alternation(Object.keys(TR_NUMBER_WORDS));
export const EN_NUMBER_ALT = alternation(Object.keys(EN_NUMBER_WORDS));

export function parseNumberWord(s: string): number | null {
  const t = s.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const key = t.replace(/ı/g, 'i');
  for (const [k, v] of Object.entries({ ...TR_NUMBER_WORDS, ...EN_NUMBER_WORDS })) {
    if (k.replace(/ı/g, 'i') === key) return v;
  }
  return null;
}
