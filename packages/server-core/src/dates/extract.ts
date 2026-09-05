/**
 * Natural-language date / deadline extraction for Turkish and English with evidence.
 *
 * Pipeline: lowercase (index-aligned) → collect candidates → resolve overlaps (longest wins) →
 * merge adjacent day + clock spans ("yarın 17:00", "Cuma günü saat 14:00'te") → detect deadline cues
 * around the merged span → convert local wall-clock to UTC with the caller's timezone.
 *
 * Pure numbers never produce a date: every candidate needs a calendar word, a separator pattern
 * (05.09.2026) or a clock pattern (17:00). Hour-only forms ("10'da") are kept only when they follow a day.
 */
import { localDateTimeOf, localToUtcIso, sameDate, dateKey, type LocalDate } from './calendar';
import { B, E } from './lexicon';
import { collectCandidates, type Candidate, type ClockTime, type ResolveContext } from './patterns';
import { flexI, lowercasePreservingIndices } from './turkish';
import type { DateKind, ExtractDatesInput, ExtractedDate } from './types';

const MAX_TEXT = 20_000;
const GAP_RE = /^(?:[\s,]|saat|at|on|@)*$/u;

const STRONG_CUES = [
  'son ödeme tarihi',
  'son ödeme günü',
  'son ödeme',
  'son tarih',
  'son tarihi',
  'son gün',
  'son günü',
  'son teslim tarihi',
  'son teslim',
  'son başvuru tarihi',
  'son başvuru',
  'en geç',
  'teslim tarihi',
  'bitiş tarihi',
  'vade tarihi',
  'vadesi',
  'vade',
  'geçerlilik tarihi',
  'ödeme tarihi',
  'deadline',
  'due date',
  'due on',
  'due by',
  'due',
  'no later than',
  'not later than',
  'latest by',
  'expires on',
  'expires',
  'payable by',
];
const WEAK_CUES = ['by', 'before', 'until', 'till', 'ends on', 'closes on'];

function cueAlternation(words: string[]): string {
  return [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => flexI(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('|');
}

const RE_CUE_BEFORE = new RegExp(`${B}(?<cue>${cueAlternation([...STRONG_CUES, ...WEAK_CUES])})\\s*[:\\-–—]?\\s*(?:olan\\s+|olarak\\s+|ise\\s+|is\\s+|the\\s+)?$`, 'u');
const CUE_AFTER_WORDS = flexI(
  "(?:'?(?:ya|ye|a|e|na|ne|ına|ine|sına|sine))?\\s*(?:kadar|dek|değin)|(?:'?(?:dan|den|tan|ten|ndan|nden))?\\s*(?:önce|öncesinde)|at the latest|or earlier|or before|or sooner|son gün(?:ü)?",
);
const RE_CUE_AFTER = new RegExp(`^\\s*(?<cue>${CUE_AFTER_WORDS})${E}`, 'u');
const RE_STRONG_CUE = new RegExp(`(?:${cueAlternation(STRONG_CUES)})`, 'u');

interface Cue {
  text: string;
  strength: 1 | 2;
}

function detectCue(lower: string, start: number, end: number): Cue | null {
  const before = lower.slice(Math.max(0, start - 40), start);
  const mb = RE_CUE_BEFORE.exec(before);
  if (mb?.groups?.cue) {
    const text = mb.groups.cue;
    return { text, strength: RE_STRONG_CUE.test(text) ? 2 : 1 };
  }
  const after = lower.slice(end, end + 24);
  const ma = RE_CUE_AFTER.exec(after);
  if (ma?.groups?.cue) {
    const text = ma.groups.cue.trim();
    return { text, strength: /son gün/u.test(text) ? 2 : 1 };
  }
  return null;
}

/** Longest span wins; ties go to the higher-priority producer. */
function resolveOverlaps(cands: Candidate[]): Candidate[] {
  const sorted = [...cands].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || b.priority - a.priority);
  const out: Candidate[] = [];
  let lastEnd = -1;
  for (const c of sorted) {
    if (c.start < lastEnd) continue;
    out.push(c);
    lastEnd = c.end;
  }
  return out;
}

function isDayish(c: Candidate): boolean {
  return c.hasExplicitDate && c.exactInstant === null;
}

function isClockOnly(c: Candidate): boolean {
  return !c.hasExplicitDate && c.time !== null && c.exactInstant === null;
}

function tryMerge(a: Candidate, b: Candidate): Candidate | null {
  const merged = (date: LocalDate | null, time: ClockTime | null, extra: Partial<Candidate>): Candidate => ({
    ...a,
    start: a.start,
    end: b.end,
    date,
    time,
    defaultTime: false,
    hasExplicitDate: true,
    needsContext: false,
    confidence: Math.min(0.97, Math.max(a.confidence, b.confidence) + 0.05),
    deadlineHint: a.deadlineHint || b.deadlineHint,
    bareWeekday: false,
    ...extra,
  });
  // day + clock: "yarın 17:00", "Cuma günü saat 14:00'te", "next Tuesday 2pm"
  if (isDayish(a) && (a.time === null || a.defaultTime) && isClockOnly(b)) {
    return merged(a.date, b.time, { relative: a.relative });
  }
  // clock + day: "at 2pm on Friday", "14:00'te yarın"
  if (isClockOnly(a) && !a.needsContext && isDayish(b) && (b.time === null || b.defaultTime)) {
    return merged(b.date, a.time, { relative: b.relative, priority: b.priority });
  }
  // absolute date + bare weekday ("12 Eylül Cuma") or weekday + absolute date ("Cuma, 12 Eylül")
  if (isDayish(a) && !a.relative && a.time === null && b.bareWeekday && b.time === null) {
    return merged(a.date, null, { relative: false });
  }
  if (a.bareWeekday && a.time === null && isDayish(b) && !b.relative && b.time === null) {
    return merged(b.date, null, { relative: false, priority: b.priority });
  }
  return null;
}

function mergeAdjacent(cands: Candidate[], lower: string): Candidate[] {
  const out: Candidate[] = [];
  let i = 0;
  while (i < cands.length) {
    let cur = cands[i] as Candidate;
    let j = i + 1;
    while (j < cands.length) {
      const next = cands[j] as Candidate;
      const gap = lower.slice(cur.end, next.start);
      if (!GAP_RE.test(gap)) break;
      const m = tryMerge(cur, next);
      if (!m) break;
      cur = m;
      j += 1;
    }
    if (!cur.needsContext) out.push(cur);
    i = j;
  }
  return out;
}

function makeEvidence(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 48);
  const to = Math.min(text.length, end + 24);
  let snippet = text.slice(from, to).replace(/\s+/g, ' ').trim();
  if (from > 0) snippet = `…${snippet}`;
  if (to < text.length) snippet = `${snippet}…`;
  return snippet.slice(0, 160);
}

function defaultTime(date: LocalDate, today: LocalDate, isDeadline: boolean): ClockTime {
  if (isDeadline || sameDate(date, today)) return { hh: 18, mm: 0 };
  return { hh: 9, mm: 0 };
}

export function extractDates(input: ExtractDatesInput): ExtractedDate[] {
  const text = input.text.length > MAX_TEXT ? input.text.slice(0, MAX_TEXT) : input.text;
  if (!text.trim()) return [];
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(nowMs)) return [];
  const local = localDateTimeOf(input.now, input.timezone);
  const ctx: ResolveContext = { today: local.date, nowHH: local.hh, nowMM: local.mm, nowMs };
  const lower = lowercasePreservingIndices(text);

  const candidates = mergeAdjacent(resolveOverlaps(collectCandidates(lower, ctx)), lower);
  const results: ExtractedDate[] = [];
  for (const c of candidates) {
    const cue = detectCue(lower, c.start, c.end);
    const isDeadline = c.deadlineHint || cue !== null;
    let iso: string;
    let localDate: string;
    let hasTime: boolean;
    if (c.exactInstant) {
      iso = c.exactInstant;
      localDate = dateKey(localDateTimeOf(iso, input.timezone).date);
      hasTime = true;
    } else {
      const date = c.date ?? ctx.today;
      hasTime = c.time !== null;
      const time = c.time ?? defaultTime(date, ctx.today, isDeadline);
      iso = localToUtcIso(date, time.hh, time.mm, input.timezone);
      localDate = dateKey(date);
    }
    if (Number.isNaN(Date.parse(iso))) continue;

    let kind: DateKind;
    if (isDeadline) kind = 'deadline';
    else if (!c.hasExplicitDate) kind = 'time';
    else if (c.relative) kind = 'relative';
    else kind = 'date';

    let confidence = c.confidence;
    if (cue) confidence += cue.strength === 2 ? 0.1 : 0.06;
    if (c.deadlineHint) confidence += 0.04;
    confidence = Math.round(Math.min(0.98, Math.max(0.05, confidence)) * 100) / 100;

    const item: ExtractedDate = {
      iso,
      text: text.slice(c.start, c.end),
      kind,
      confidence,
      evidence: makeEvidence(text, c.start, c.end),
      hasTime,
      localDate,
      start: c.start,
      end: c.end,
    };
    if (cue) item.cue = cue.text;
    else if (c.deadlineHint) item.cue = item.text.toLocaleLowerCase('tr-TR');
    results.push(item);
  }
  return results;
}

/**
 * The single most likely deadline: only spans marked by a deadline cue ("kadar", "son ödeme tarihi",
 * "deadline", "by", "before" …) qualify — a plain date mention is never promoted to a deadline.
 */
export function deadlineFromText(input: ExtractDatesInput): ExtractedDate | null {
  const dates = extractDates(input).filter((d) => d.kind === 'deadline');
  if (dates.length === 0) return null;
  const strength = (d: ExtractedDate): number => (d.cue && RE_STRONG_CUE.test(d.cue) ? 2 : 1);
  const sorted = [...dates].sort(
    (a, b) => strength(b) - strength(a) || b.confidence - a.confidence || Number(b.hasTime) - Number(a.hasTime) || Date.parse(a.iso) - Date.parse(b.iso),
  );
  return sorted[0] ?? null;
}

/** True when the text carries any deadline vocabulary (used as a cheap triage signal). */
export function hasDeadlineVocabulary(text: string): boolean {
  const lower = lowercasePreservingIndices(text);
  return RE_STRONG_CUE.test(lower) || /(?<![\p{L}])kadar(?![\p{L}])/u.test(lower);
}
