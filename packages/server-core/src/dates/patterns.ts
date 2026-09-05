/**
 * Candidate producers. Each regex runs over the index-aligned lowercase text and yields
 * partially resolved candidates; `extract.ts` merges adjacent date+time spans and finalizes.
 */
import { HOUR, MINUTE } from '../util';
import {
  addBusinessDays,
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  isValidDate,
  isoWeekday,
  nextWeekday,
  type LocalDate,
} from './calendar';
import {
  B,
  E,
  EN_NUMBER_ALT,
  MONTH_EN_ALT,
  MONTH_TR_ABBR_ALT,
  MONTH_TR_FULL_ALT,
  SUF,
  TIME_OF_DAY_ALT,
  TR_NUMBER_ALT,
  WEEKDAY_EN_ABBR_ALT,
  WEEKDAY_FULL_ALT,
  adjustHourForTimeOfDay,
  monthIndex,
  parseNumberWord,
  timeOfDay,
  weekdayIndex,
} from './lexicon';
import { flexI } from './turkish';

export interface ClockTime {
  hh: number;
  mm: number;
}

export interface Candidate {
  start: number;
  end: number;
  date: LocalDate | null;
  time: ClockTime | null;
  /** True when the clock time is a default for a time-of-day word and may be overridden by an explicit time. */
  defaultTime: boolean;
  /** The span names a day (absolute or relative) — false for pure clock times. */
  hasExplicitDate: boolean;
  relative: boolean;
  /** The expression itself is a deadline ("EOD", "gün sonuna kadar"). */
  deadlineHint: boolean;
  confidence: number;
  /** Only valid when merged with a preceding day expression ("yarın 10'da"). */
  needsContext: boolean;
  /** Exact instant already known (durations such as "2 saat içinde", ISO strings with zone). */
  exactInstant: string | null;
  priority: number;
  /** Bare weekday without modifier — may be absorbed by an adjacent absolute date. */
  bareWeekday: boolean;
}

export interface ResolveContext {
  today: LocalDate;
  nowHH: number;
  nowMM: number;
  nowMs: number;
}

type Groups = Record<string, string | undefined>;

function base(start: number, end: number, partial: Partial<Candidate>): Candidate {
  return {
    start,
    end,
    date: null,
    time: null,
    defaultTime: false,
    hasExplicitDate: false,
    relative: false,
    deadlineHint: false,
    confidence: 0.6,
    needsContext: false,
    exactInstant: null,
    priority: 1,
    bareWeekday: false,
    ...partial,
  };
}

function scan(lower: string, re: RegExp, out: Candidate[], build: (m: RegExpExecArray, g: Groups) => Candidate | null): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const c = build(m, m.groups ?? {});
    if (c) out.push(c);
  }
}

function parseClock(hhRaw: string | undefined, mmRaw: string | undefined, ap: string | undefined): ClockTime | null {
  if (hhRaw === undefined) return null;
  let hh = Number(hhRaw);
  const mm = mmRaw === undefined ? 0 : Number(mmRaw);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || mm > 59) return null;
  if (ap) {
    if (hh < 1 || hh > 12) return null;
    const pm = ap.startsWith('p');
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  } else if (hh > 23) {
    return null;
  }
  return { hh, mm };
}

/** A month/day without a year: this year, unless it is more than 60 days in the past. */
function resolveMonthDay(day: number, month: number, year: number | null, ctx: ResolveContext): LocalDate | null {
  if (year !== null) return isValidDate(year, month, day) ? { y: year, m: month, d: day } : null;
  const y = ctx.today.y;
  if (!isValidDate(y, month, day)) return null;
  const cand: LocalDate = { y, m: month, d: day };
  if (daysBetween(cand, ctx.today) > 60) {
    return isValidDate(y + 1, month, day) ? { y: y + 1, m: month, d: day } : null;
  }
  return cand;
}

// ---------------------------------------------------------------------------
// Absolute dates
// ---------------------------------------------------------------------------

const RE_ISO = new RegExp(
  `${B}(?<y>\\d{4})-(?<m>\\d{2})-(?<d>\\d{2})(?:[t ](?<hh>\\d{2}):(?<mm>\\d{2})(?::\\d{2}(?:\\.\\d+)?)?(?<z>z|[+-]\\d{2}:?\\d{2})?)?${E}`,
  'gu',
);
const RE_NUMERIC = new RegExp(`${B}(?<a>\\d{1,2})(?<sep>[./])(?<b>\\d{1,2})\\k<sep>(?<y>\\d{4})${E}`, 'gu');
const RE_DAY_MONTH_TR = new RegExp(`${B}(?<d>\\d{1,2})\\s+(?<mon>${MONTH_TR_FULL_ALT})\\.?${SUF}(?:\\s+(?<y>\\d{4})${SUF})?${E}`, 'gu');
const RE_DAY_MONTH_TR_ABBR = new RegExp(`${B}(?<d>\\d{1,2})\\s+(?<mon>${MONTH_TR_ABBR_ALT})(?:\\.|(?=\\s+\\d))(?:\\s+(?<y>\\d{4}))?${E}`, 'gu');
const RE_MONTH_GENITIVE_TR = new RegExp(`${B}(?<mon>${MONTH_TR_FULL_ALT})\\s+${flexI('ayının')}\\s+(?<d>\\d{1,2})${SUF}${E}`, 'gu');
const RE_THIS_MONTH_DAY_TR = new RegExp(`${B}(?:(?<mod>bu|gelecek|önümüzdeki)\\s+)?${flexI('ayın')}\\s+(?<d>\\d{1,2})${SUF}${E}`, 'gu');
const RE_MONTH_DAY_EN = new RegExp(`${B}(?<mon>${MONTH_EN_ALT})\\.?\\s+(?<d>\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(?<y>\\d{4}))?${E}`, 'gu');
const RE_DAY_MONTH_EN = new RegExp(`${B}(?<d>\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?<mon>${MONTH_EN_ALT})\\.?(?:,?\\s+(?<y>\\d{4}))?${E}`, 'gu');

function absoluteDates(lower: string, ctx: ResolveContext, out: Candidate[]): void {
  scan(lower, RE_ISO, out, (m, g) => {
    const y = Number(g.y);
    const mo = Number(g.m);
    const d = Number(g.d);
    if (!isValidDate(y, mo, d)) return null;
    const time = parseClock(g.hh, g.mm, undefined);
    let exactInstant: string | null = null;
    if (time && g.z) {
      const utc = Date.UTC(y, mo - 1, d, time.hh, time.mm);
      const z = g.z;
      let offsetMin = 0;
      if (z !== 'z') {
        const sign = z.startsWith('-') ? -1 : 1;
        const digits = z.slice(1).replace(':', '');
        offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
      }
      exactInstant = new Date(utc - offsetMin * MINUTE).toISOString();
    }
    return base(m.index, m.index + m[0].length, {
      date: { y, m: mo, d },
      time,
      hasExplicitDate: true,
      confidence: 0.95,
      exactInstant,
      priority: 6,
    });
  });

  scan(lower, RE_NUMERIC, out, (m, g) => {
    const a = Number(g.a);
    const b = Number(g.b);
    const y = Number(g.y);
    let day = a;
    let month = b;
    if (a <= 12 && b > 12) {
      day = b;
      month = a;
    }
    if (!isValidDate(y, month, day)) return null;
    return base(m.index, m.index + m[0].length, { date: { y, m: month, d: day }, hasExplicitDate: true, confidence: 0.92, priority: 6 });
  });

  const dayMonth = (m: RegExpExecArray, g: Groups, confidence: number): Candidate | null => {
    const month = monthIndex(g.mon ?? '');
    if (month === null) return null;
    const date = resolveMonthDay(Number(g.d), month, g.y ? Number(g.y) : null, ctx);
    if (!date) return null;
    return base(m.index, m.index + m[0].length, { date, hasExplicitDate: true, confidence: g.y ? 0.95 : confidence, priority: 5 });
  };
  scan(lower, RE_DAY_MONTH_TR, out, (m, g) => dayMonth(m, g, 0.88));
  scan(lower, RE_DAY_MONTH_TR_ABBR, out, (m, g) => dayMonth(m, g, 0.8));
  scan(lower, RE_MONTH_GENITIVE_TR, out, (m, g) => dayMonth(m, g, 0.85));
  scan(lower, RE_MONTH_DAY_EN, out, (m, g) => dayMonth(m, g, 0.85));
  scan(lower, RE_DAY_MONTH_EN, out, (m, g) => dayMonth(m, g, 0.85));

  scan(lower, RE_THIS_MONTH_DAY_TR, out, (m, g) => {
    const d = Number(g.d);
    const baseMonth = g.mod && g.mod !== 'bu' ? addMonths(ctx.today, 1) : ctx.today;
    if (!isValidDate(baseMonth.y, baseMonth.m, d)) return null;
    return base(m.index, m.index + m[0].length, {
      date: { y: baseMonth.y, m: baseMonth.m, d },
      hasExplicitDate: true,
      relative: true,
      confidence: 0.75,
      priority: 4,
    });
  });
}

// ---------------------------------------------------------------------------
// Relative days, time-of-day words, weekdays, week/month ends
// ---------------------------------------------------------------------------

const RE_RELATIVE_TR = new RegExp(`${B}(?<word>bugün|yarın|öbür gün|dün)${SUF}${E}`, 'gu');
const RE_RELATIVE_EN = new RegExp(`${B}(?<word>today|tomorrow|tonight|(?:the\\s+)?day after tomorrow|yesterday)${E}`, 'gu');
const RE_TOD = new RegExp(
  `${B}(?:(?<pre>bu|yarın|bugün|dün|öbür gün|this|tomorrow|today)\\s+)?(?<tod>${TIME_OF_DAY_ALT})${SUF}(?:\\s+(?:saat\\s+)?(?<hh>\\d{1,2})(?:[:.](?<mm>\\d{2}))?${SUF})?${E}`,
  'gu',
);
const RE_WEEKDAY = new RegExp(
  `${B}(?:(?<mod>gelecek hafta|önümüzdeki hafta|next week|önümüzdeki|gelecek|haftaya|next|this|coming|bu)\\s+)?(?<wd>${WEEKDAY_FULL_ALT})${SUF}(?:\\s+günü(?:'?(?:ne|nde))?)?${E}`,
  'gu',
);
const RE_WEEKDAY_EN_ABBR = new RegExp(
  `${B}(?:(?<mod>next|this|coming)\\s+(?<wd>${WEEKDAY_EN_ABBR_ALT})|(?<wd2>${WEEKDAY_EN_ABBR_ALT})(?=\\.?\\s+(?:\\d|at\\s)))\\.?${E}`,
  'gu',
);
const PERIOD_WORDS = flexI(
  'bu hafta içinde|hafta içinde|bu hafta|this week|haftaya|gelecek hafta|önümüzdeki hafta|next week|hafta sonuna|hafta sonu|haftasonu|this weekend|weekend|bu ay sonuna|ayın sonuna|ay sonuna|ay sonu|end of the month|end of month|eom|yıl sonuna|yıl sonu|end of the year|end of year|gelecek ay|önümüzdeki ay|next month',
);
const RE_PERIOD = new RegExp(`${B}(?<word>${PERIOD_WORDS})${SUF}${E}`, 'gu');

function relativeWord(word: string): number | null {
  const w = word.replace(/ı/g, 'i').replace(/^the\s+/, '');
  switch (w) {
    case 'bugün':
    case 'today':
    case 'tonight':
      return 0;
    case 'yarın':
    case 'yarin':
    case 'tomorrow':
      return 1;
    case 'öbür gün':
    case 'day after tomorrow':
      return 2;
    case 'dün':
    case 'yesterday':
      return -1;
    default:
      return null;
  }
}

function relativeDays(lower: string, ctx: ResolveContext, out: Candidate[]): void {
  const build = (m: RegExpExecArray, g: Groups): Candidate | null => {
    const offset = relativeWord(g.word ?? '');
    if (offset === null) return null;
    const isTonight = g.word === 'tonight';
    return base(m.index, m.index + m[0].length, {
      date: addDays(ctx.today, offset),
      time: isTonight ? { hh: 20, mm: 0 } : null,
      defaultTime: isTonight,
      hasExplicitDate: true,
      relative: true,
      confidence: 0.82,
      priority: 3,
    });
  };
  scan(lower, RE_RELATIVE_TR, out, build);
  scan(lower, RE_RELATIVE_EN, out, build);

  scan(lower, RE_TOD, out, (m, g) => {
    const tod = timeOfDay(g.tod ?? '');
    if (!tod) return null;
    const offset = g.pre ? relativeWord(g.pre) ?? 0 : 0;
    let time: ClockTime = { hh: tod.hh, mm: tod.mm };
    let defaultTime = true;
    if (g.hh !== undefined) {
      const parsed = parseClock(g.hh, g.mm, undefined);
      if (!parsed) return null;
      time = { hh: adjustHourForTimeOfDay(tod.category, parsed.hh), mm: parsed.mm };
      defaultTime = false;
    }
    return base(m.index, m.index + m[0].length, {
      date: g.pre ? addDays(ctx.today, offset) : null,
      time,
      defaultTime,
      hasExplicitDate: Boolean(g.pre),
      relative: true,
      confidence: g.pre ? 0.8 : 0.62,
      priority: 4,
    });
  });
}

function weekdayCandidate(m: RegExpExecArray, mod: string | undefined, name: string | undefined, ctx: ResolveContext): Candidate | null {
  const target = weekdayIndex(name ?? '');
  if (target === null) return null;
  const modifier = (mod ?? '').replace(/ı/g, 'i');
  const nextWeek = ['gelecek hafta', 'önümüzdeki hafta', 'next week', 'haftaya', 'next'].includes(modifier);
  const skipToday = ['önümüzdeki', 'gelecek', 'coming'].includes(modifier);
  const date = nextWeekday(ctx.today, target, { nextWeek, skipToday });
  return base(m.index, m.index + m[0].length, {
    date,
    hasExplicitDate: true,
    relative: true,
    confidence: mod ? 0.8 : 0.74,
    priority: 4,
    bareWeekday: !mod,
  });
}

function weekdays(lower: string, ctx: ResolveContext, out: Candidate[]): void {
  scan(lower, RE_WEEKDAY, out, (m, g) => weekdayCandidate(m, g.mod, g.wd, ctx));
  scan(lower, RE_WEEKDAY_EN_ABBR, out, (m, g) => weekdayCandidate(m, g.mod, g.wd ?? g.wd2, ctx));
}

function periods(lower: string, ctx: ResolveContext, out: Candidate[]): void {
  scan(lower, RE_PERIOD, out, (m, g) => {
    const word = (g.word ?? '').replace(/ı/g, 'i');
    const today = ctx.today;
    const w = isoWeekday(today);
    let date: LocalDate;
    let confidence = 0.6;
    if (['bu hafta içinde', 'hafta içinde', 'bu hafta', 'this week'].includes(word)) {
      date = w <= 5 ? addDays(today, 5 - w) : addDays(today, 7 - w);
    } else if (['haftaya', 'gelecek hafta', 'önümüzdeki hafta', 'next week'].includes(word)) {
      date = addDays(today, 7);
    } else if (['hafta sonuna', 'hafta sonu', 'haftasonu', 'this weekend', 'weekend'].includes(word)) {
      date = w >= 6 ? today : addDays(today, 6 - w);
      confidence = 0.65;
    } else if (['bu ay sonuna', 'ayin sonuna', 'ay sonuna', 'ay sonu', 'end of the month', 'end of month', 'eom'].includes(word)) {
      date = { y: today.y, m: today.m, d: daysInMonth(today.y, today.m) };
      confidence = 0.7;
    } else if (['yil sonuna', 'yil sonu', 'end of the year', 'end of year'].includes(word)) {
      date = { y: today.y, m: 12, d: 31 };
      confidence = 0.7;
    } else if (['gelecek ay', 'önümüzdeki ay', 'next month'].includes(word)) {
      date = addMonths(today, 1);
      confidence = 0.5;
    } else {
      return null;
    }
    return base(m.index, m.index + m[0].length, { date, hasExplicitDate: true, relative: true, confidence, priority: 3 });
  });
}

// ---------------------------------------------------------------------------
// Durations ("3 gün içinde", "in 2 hours") and EOD-style expressions
// ---------------------------------------------------------------------------

const RE_DURATION_TR = new RegExp(
  `${B}(?<n>\\d{1,3}|${TR_NUMBER_ALT})\\s+(?<unit>${flexI('iş günü|işgünü|iş gününe|gün|hafta|saat|dakika|ay')})(?:'?[ea])?\\s+(?<rel>${flexI('içinde|içerisinde|sonra|sonrasında|kadar')})${E}`,
  'gu',
);
const RE_DURATION_EN = new RegExp(
  `${B}(?:in|within|after)\\s+(?<n>\\d{1,3}|${EN_NUMBER_ALT})\\s+(?<unit>business days?|working days?|days?|weeks?|hours?|minutes?|months?)${E}`,
  'gu',
);
const EOD_WORDS = flexI(
  'eod|cob|end of (?:the )?day|close of business|end of business|gün sonuna kadar|gün sonuna dek|gün sonu|gün bitimine kadar|mesai bitimine kadar|mesai sonuna kadar|mesai saati bitimine kadar|mesai bitimi|iş günü sonuna kadar|iş günü sonu',
);
const RE_EOD = new RegExp(`${B}(?<word>${EOD_WORDS})${E}`, 'gu');

function durations(lower: string, ctx: ResolveContext, out: Candidate[]): void {
  const build = (m: RegExpExecArray, g: Groups): Candidate | null => {
    const n = parseNumberWord(g.n ?? '');
    if (n === null || n <= 0) return null;
    const unit = (g.unit ?? '').replace(/ı/g, 'i');
    const span: Partial<Candidate> = { hasExplicitDate: true, relative: true, confidence: 0.72, priority: 4 };
    if (/^(saat|hours?)$/.test(unit)) {
      return base(m.index, m.index + m[0].length, { ...span, exactInstant: new Date(ctx.nowMs + n * HOUR).toISOString(), time: { hh: 0, mm: 0 } });
    }
    if (/^(dakika|minutes?)$/.test(unit)) {
      return base(m.index, m.index + m[0].length, { ...span, exactInstant: new Date(ctx.nowMs + n * MINUTE).toISOString(), time: { hh: 0, mm: 0 } });
    }
    if (/^(iş günü|işgünü|iş gününe|business days?|working days?)$/.test(unit)) {
      return base(m.index, m.index + m[0].length, { ...span, date: addBusinessDays(ctx.today, n) });
    }
    if (/^(hafta|weeks?)$/.test(unit)) return base(m.index, m.index + m[0].length, { ...span, date: addDays(ctx.today, n * 7) });
    if (/^(ay|months?)$/.test(unit)) return base(m.index, m.index + m[0].length, { ...span, date: addMonths(ctx.today, n), confidence: 0.6 });
    return base(m.index, m.index + m[0].length, { ...span, date: addDays(ctx.today, n) });
  };
  scan(lower, RE_DURATION_TR, out, build);
  scan(lower, RE_DURATION_EN, out, build);

  scan(lower, RE_EOD, out, (m) =>
    base(m.index, m.index + m[0].length, {
      date: ctx.today,
      time: { hh: 18, mm: 0 },
      hasExplicitDate: true,
      relative: true,
      deadlineHint: true,
      confidence: 0.8,
      priority: 4,
    }),
  );
}

// ---------------------------------------------------------------------------
// Clock times
// ---------------------------------------------------------------------------

const RE_TIME_COLON = new RegExp(`${B}(?:saat\\s+)?(?<hh>\\d{1,2}):(?<mm>\\d{2})(?:\\s*(?<ap>am|pm|a\\.m\\.|p\\.m\\.))?${SUF}${E}`, 'gu');
const RE_TIME_SAAT = new RegExp(`${B}saat\\s+(?<hh>\\d{1,2})(?:[.:](?<mm>\\d{2}))?${SUF}${E}`, 'gu');
const RE_TIME_DOT_SUFFIX = new RegExp(`${B}(?<hh>\\d{1,2})\\.(?<mm>\\d{2})'(?:de|da|te|ta|ye|ya|e|a)${E}`, 'gu');
const RE_TIME_AMPM = new RegExp(`${B}(?<hh>\\d{1,2})(?::(?<mm>\\d{2}))?\\s*(?<ap>am|pm|a\\.m\\.|p\\.m\\.)${E}`, 'gu');
const RE_TIME_AT = new RegExp(`${B}at\\s+(?<hh>\\d{1,2})(?::(?<mm>\\d{2}))?(?:\\s*(?<ap>am|pm|a\\.m\\.|p\\.m\\.))?${E}`, 'gu');
const RE_HOUR_CTX = new RegExp(`${B}(?<hh>\\d{1,2})'?(?:de|da|te|ta)${E}`, 'gu');

function clockTimes(lower: string, out: Candidate[]): void {
  const timeCandidate = (m: RegExpExecArray, g: Groups, opts: { confidence: number; needsContext?: boolean; assumeAfternoon?: boolean }): Candidate | null => {
    const parsed = parseClock(g.hh, g.mm, g.ap);
    if (!parsed) return null;
    let time = parsed;
    let confidence = opts.confidence;
    if (opts.assumeAfternoon && !g.ap && g.mm === undefined && parsed.hh >= 1 && parsed.hh <= 6) {
      time = { hh: parsed.hh + 12, mm: 0 };
      confidence -= 0.1;
    }
    return base(m.index, m.index + m[0].length, { time, confidence, needsContext: opts.needsContext ?? false, priority: 2 });
  };
  scan(lower, RE_TIME_COLON, out, (m, g) => timeCandidate(m, g, { confidence: 0.7 }));
  scan(lower, RE_TIME_SAAT, out, (m, g) => timeCandidate(m, g, { confidence: 0.68, assumeAfternoon: true }));
  scan(lower, RE_TIME_DOT_SUFFIX, out, (m, g) => timeCandidate(m, g, { confidence: 0.66 }));
  scan(lower, RE_TIME_AMPM, out, (m, g) => timeCandidate(m, g, { confidence: 0.7 }));
  scan(lower, RE_TIME_AT, out, (m, g) => timeCandidate(m, g, { confidence: 0.6, needsContext: g.mm === undefined && g.ap === undefined, assumeAfternoon: true }));
  scan(lower, RE_HOUR_CTX, out, (m, g) => timeCandidate(m, g, { confidence: 0.6, needsContext: true, assumeAfternoon: true }));
}

export function collectCandidates(lower: string, ctx: ResolveContext): Candidate[] {
  const out: Candidate[] = [];
  absoluteDates(lower, ctx, out);
  relativeDays(lower, ctx, out);
  weekdays(lower, ctx, out);
  periods(lower, ctx, out);
  durations(lower, ctx, out);
  clockTimes(lower, out);
  return out;
}
