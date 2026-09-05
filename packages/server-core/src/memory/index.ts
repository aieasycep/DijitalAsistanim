/**
 * memory — what the assistant is allowed to remember and how it must cite it: memory chunks
 * (summary + key points + a short excerpt, never a blind email dump), full-text query building
 * for Turkish, context trimming by token budget, grounding checks for answers, source refs and
 * search result mapping. Pure functions; embeddings and storage live elsewhere.
 */
import type { CalendarEvent, Capture, Commitment, Contact, EmailAnalysis, EmailThread, LifeEvent, Locale, MemoryChunk, PostMeetingNote, SearchResult, SourceRef, SourceType, TaskItem, UUID } from '@da/domain';
import { MONTHS_TR_TITLE, formatClock, localDateOf, monthIndex } from '../dates';
import { stripSubjectPrefixes } from '../followups';
import { sourceLabel } from '../insights';
import { DAY, estimateTokens, normalizeText, stripQuotedHistory, truncate } from '../util';

export const EXCERPT_MAX_CHARS = 600;
export const CITATION_MAX_CHARS = 280;

export type MemoryChunkDraft = Omit<MemoryChunk, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

export type MemorySource =
  | { kind: 'email_thread'; entity: EmailThread; analysis?: EmailAnalysis | null; bodyText?: string | null; sourceType?: SourceType; contactId?: UUID | null }
  | { kind: 'calendar_event'; entity: CalendarEvent }
  | { kind: 'commitment'; entity: Commitment }
  | { kind: 'capture'; entity: Capture }
  | { kind: 'meeting_note'; entity: PostMeetingNote; eventTitle?: string | null; personName?: string | null; contactId?: UUID | null; eventAt?: string | null };

export interface BuildMemoryChunksInput {
  source: MemorySource;
  timezone: string;
  locale?: Locale;
  /** The user's own addresses (to pick the counterpart of a thread). */
  userEmails?: readonly string[];
  /** When set, chunks expire this many days after they occurred. */
  retentionDays?: number | null;
}

function ms(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

function lower(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function excerptOf(text: string | null | undefined, max = EXCERPT_MAX_CHARS): string {
  const clean = normalizeText(stripQuotedHistory(text ?? '')).replace(/\s*\n\s*/g, ' ').trim();
  return clean ? truncate(clean, max) : '';
}

function joinLines(lines: (string | null | undefined)[]): string {
  return lines.map((l) => l?.trim() ?? '').filter(Boolean).join('\n');
}

function dateSentence(iso: string, timezone: string, locale: Locale, withTime = true): string {
  const d = localDateOf(iso, timezone);
  const month = MONTHS_TR_TITLE[d.m - 1] ?? '';
  const date = locale === 'en' ? new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : `${d.d} ${month} ${d.y}`;
  return withTime ? `${date} ${formatClock(iso, timezone)}` : date;
}

function finishChunk(partial: Omit<MemoryChunkDraft, 'tokenCount' | 'hasEmbedding' | 'expiresAt'>, retentionDays: number | null | undefined): MemoryChunkDraft {
  const expiresAt = retentionDays && retentionDays > 0 ? new Date(ms(partial.occurredAt) + retentionDays * DAY).toISOString() : null;
  return { ...partial, tokenCount: estimateTokens(partial.content), hasEmbedding: false, expiresAt };
}

function emailChunk(input: BuildMemoryChunksInput, src: Extract<MemorySource, { kind: 'email_thread' }>): MemoryChunkDraft[] {
  const thread = src.entity;
  const analysis = src.analysis ?? thread.analysis ?? null;
  if (thread.deletedAt) return [];
  const category = analysis?.category ?? thread.category;
  const importance = analysis?.importance ?? thread.importance;
  if (category === 'promotion') return [];
  const labels = thread.labels.map((l) => l.toLowerCase());
  if (labels.some((l) => l.includes('promotion') || l.includes('newsletter') || l.includes('bülten') || l.includes('bulten'))) return [];
  const actionable = (analysis?.requiresUserAction ?? false) || !!analysis?.deadline || !!analysis?.lifeEvent || (analysis?.commitments.length ?? 0) > 0;
  if (importance === 'low' && !actionable) return [];
  const locale = input.locale ?? 'tr';
  const userEmails = new Set((input.userEmails ?? []).map(lower));
  const counterpart = thread.participants.find((p) => !userEmails.has(lower(p.email))) ?? thread.participants[0] ?? null;
  const personName = counterpart?.name?.trim() || counterpart?.email || null;
  const keyPoints = analysis?.keyPoints.filter((k) => k.trim()) ?? [];
  const excerpt = excerptOf(src.bodyText ?? thread.snippet);
  const content = joinLines([
    analysis?.summary ?? null,
    keyPoints.length ? `${locale === 'en' ? 'Key points' : 'Öne çıkanlar'}: ${keyPoints.join('; ')}` : null,
    analysis?.deadlineText ? `${locale === 'en' ? 'Deadline' : 'Son tarih'}: ${analysis.deadlineText}` : null,
    excerpt && excerpt !== analysis?.summary ? excerpt : null,
  ]);
  if (!content) return [];
  const sourceType = src.sourceType ?? 'gmail';
  const source: SourceRef = {
    type: sourceType,
    id: thread.id,
    externalId: thread.externalThreadId,
    label: sourceLabel(sourceType, locale),
    ...(personName ? { person: personName } : {}),
    ...(src.contactId ? { personId: src.contactId } : {}),
    timestamp: thread.lastMessageAt,
    excerpt: truncate(analysis?.summary ?? excerpt, CITATION_MAX_CHARS),
  };
  return [
    finishChunk(
      {
        sourceType,
        sourceId: thread.id,
        source,
        content,
        topic: analysis?.lifeEvent?.title ?? stripSubjectPrefixes(thread.subject),
        personName,
        contactId: src.contactId ?? null,
        occurredAt: thread.lastMessageAt,
      },
      input.retentionDays,
    ),
  ];
}

function eventChunk(input: BuildMemoryChunksInput, event: CalendarEvent): MemoryChunkDraft[] {
  if (event.deletedAt || event.status === 'cancelled') return [];
  const locale = input.locale ?? 'tr';
  const en = locale === 'en';
  const attendees = event.attendees.map((a) => a.name?.trim() || a.email || '').filter(Boolean);
  const primary = event.attendees.find((a) => !(a.isOrganizer && event.organizerIsUser));
  const personName = primary?.name?.trim() || primary?.email || null;
  const when = event.allDay ? dateSentence(event.startAt, input.timezone, locale, false) : `${dateSentence(event.startAt, input.timezone, locale)}–${formatClock(event.endAt, input.timezone)}`;
  const content = joinLines([
    event.title,
    `${en ? 'When' : 'Ne zaman'}: ${when}`,
    event.location ? `${en ? 'Where' : 'Nerede'}: ${event.location}` : null,
    attendees.length ? `${en ? 'Attendees' : 'Katılımcılar'}: ${attendees.join(', ')}` : null,
    excerptOf(event.description) || null,
  ]);
  const source: SourceRef = {
    type: event.source,
    id: event.id,
    externalId: event.externalEventId,
    label: sourceLabel(event.source, locale),
    ...(personName ? { person: personName } : {}),
    ...(primary?.contactId ? { personId: primary.contactId } : {}),
    timestamp: event.startAt,
    ...(event.meetingUrl ? { url: event.meetingUrl } : {}),
    excerpt: truncate(`${event.title} · ${when}`, CITATION_MAX_CHARS),
  };
  return [finishChunk({ sourceType: event.source, sourceId: event.id, source, content, topic: event.title, personName, contactId: primary?.contactId ?? null, occurredAt: event.startAt }, input.retentionDays)];
}

function commitmentChunk(input: BuildMemoryChunksInput, c: Commitment): MemoryChunkDraft[] {
  if (c.deletedAt || c.status === 'cancelled') return [];
  const locale = input.locale ?? 'tr';
  const en = locale === 'en';
  const who = c.direction === 'user_owes' ? (en ? 'Your promise' : 'Verdiğin söz') : c.counterpartName ? (en ? `${c.counterpartName}'s promise` : `${c.counterpartName} sözü`) : en ? 'Their promise' : 'Karşı tarafın sözü';
  const content = joinLines([
    `${who}: ${c.text}`,
    c.quote ? `“${c.quote}”` : null,
    c.dueAt ? `${en ? 'Due' : 'Son tarih'}: ${dateSentence(c.dueAt, input.timezone, locale)}${c.dueText ? ` (${c.dueText})` : ''}` : c.dueText ? `${en ? 'Due' : 'Son tarih'}: ${c.dueText}` : null,
  ]);
  return [
    finishChunk(
      {
        sourceType: c.source.type,
        sourceId: c.id,
        source: { ...c.source, excerpt: truncate(c.quote ?? c.text, CITATION_MAX_CHARS) },
        content,
        topic: c.text,
        personName: c.counterpartName ?? null,
        contactId: c.counterpartContactId ?? null,
        occurredAt: c.source.timestamp,
      },
      input.retentionDays,
    ),
  ];
}

function captureChunk(input: BuildMemoryChunksInput, cap: Capture): MemoryChunkDraft[] {
  if (cap.deletedAt || cap.status === 'failed') return [];
  const locale = input.locale ?? 'tr';
  const a = cap.analysis ?? null;
  const excerpt = excerptOf(cap.extractedText ?? cap.originalText);
  const content = joinLines([a?.summary ?? null, a?.keyPoints.length ? `${locale === 'en' ? 'Key points' : 'Öne çıkanlar'}: ${a.keyPoints.join('; ')}` : null, excerpt && excerpt !== a?.summary ? excerpt : null]);
  if (!content) return [];
  const personName = a?.person?.name?.trim() || null;
  const source: SourceRef = { type: 'capture', id: cap.id, label: sourceLabel('capture', locale), ...(personName ? { person: personName } : {}), timestamp: cap.createdAt, ...(cap.url ? { url: cap.url } : {}), excerpt: truncate(a?.summary ?? excerpt, CITATION_MAX_CHARS) };
  return [finishChunk({ sourceType: 'capture', sourceId: cap.id, source, content, topic: a?.title ?? null, personName, contactId: null, occurredAt: cap.createdAt }, input.retentionDays)];
}

function noteChunk(input: BuildMemoryChunksInput, src: Extract<MemorySource, { kind: 'meeting_note' }>): MemoryChunkDraft[] {
  const note = src.entity;
  const locale = input.locale ?? 'tr';
  const text = excerptOf(note.text);
  if (!text) return [];
  const content = joinLines([src.eventTitle ? `${locale === 'en' ? 'Meeting' : 'Toplantı'}: ${src.eventTitle}` : null, text]);
  const occurredAt = src.eventAt ?? note.createdAt;
  const source: SourceRef = { type: 'meeting_note', id: note.id, label: sourceLabel('meeting_note', locale), ...(src.personName ? { person: src.personName } : {}), ...(src.contactId ? { personId: src.contactId } : {}), timestamp: occurredAt, excerpt: truncate(text, CITATION_MAX_CHARS) };
  return [finishChunk({ sourceType: 'meeting_note', sourceId: note.id, source, content, topic: src.eventTitle ?? (locale === 'en' ? 'Meeting note' : 'Toplantı notu'), personName: src.personName ?? null, contactId: src.contactId ?? null, occurredAt }, input.retentionDays)];
}

/** Memory chunk drafts for one source; empty when the source is noise (promotions, newsletters, low & inert). */
export function buildMemoryChunks(input: BuildMemoryChunksInput): MemoryChunkDraft[] {
  switch (input.source.kind) {
    case 'email_thread':
      return emailChunk(input, input.source);
    case 'calendar_event':
      return eventChunk(input, input.source.entity);
    case 'commitment':
      return commitmentChunk(input, input.source.entity);
    case 'capture':
      return captureChunk(input, input.source.entity);
    case 'meeting_note':
      return noteChunk(input, input.source);
  }
}

// ---------------------------------------------------------------------------
// Full-text query
// ---------------------------------------------------------------------------

export const TURKISH_STOPWORDS: ReadonlySet<string> = new Set([
  'acaba', 'ama', 'ancak', 'artık', 'bana', 'bazı', 'belki', 'ben', 'beni', 'benim', 'beri', 'bile', 'bir', 'biraz', 'biri', 'birkaç', 'birşey', 'biz', 'bize', 'bizi', 'bizim', 'böyle', 'bu', 'buna', 'bunda', 'bundan', 'bunu', 'bunun', 'burada', 'çok', 'çünkü', 'da', 'daha', 'de', 'defa', 'diye', 'değil', 'en', 'gibi', 'göre', 'hangi', 'hatta', 'hem', 'hep', 'hepsi', 'her', 'hiç', 'için', 'ile', 'ise', 'işte', 'kadar', 'kez', 'ki', 'kim', 'kime', 'kimi', 'mı', 'mi', 'mu', 'mü', 'nasıl', 'ne', 'neden', 'nerede', 'nereye', 'niçin', 'niye', 'o', 'olan', 'olarak', 'oldu', 'olduğu', 'olur', 'ona', 'onda', 'ondan', 'onlar', 'onların', 'onu', 'onun', 'öyle', 'sana', 'sen', 'seni', 'senin', 'siz', 'size', 'sizi', 'sizin', 'şey', 'şu', 'şuna', 'şunu', 'tüm', 'var', 've', 'veya', 'ya', 'yani', 'yok', 'zaten',
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what', 'when', 'where', 'which', 'who', 'with', 'you', 'your',
]);

const TR_QUESTION_SUFFIX = /^(mıydı|miydi|muydu|müydü|mı|mi|mu|mü)$/;

function cleanToken(raw: string): string {
  let t = raw.replace(/[’‘`´]/g, "'").toLocaleLowerCase('tr-TR');
  // "Mehmet'in" → "mehmet" (drop the suffix after an apostrophe)
  const apostrophe = t.indexOf("'");
  if (apostrophe > 0) t = t.slice(0, apostrophe);
  t = t.replace(/[^\p{L}\p{N}]+/gu, '');
  return t;
}

/**
 * websearch_to_tsquery-compatible query: quoted phrases kept (quotes balanced), `-word` negations
 * kept, "OR"/"veya" mapped to OR, Turkish/English stopwords and question particles dropped.
 * Returns '' when nothing searchable remains.
 */
export function buildFtsQuery(userQuery: string): string {
  let q = userQuery.normalize('NFC').replace(/[“”„]/g, '"').trim();
  if (!q) return '';
  if ((q.match(/"/g) ?? []).length % 2 === 1) q = `${q}"`;
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    if (m[1] !== undefined) {
      const words = m[1]
        .split(/\s+/)
        .map(cleanToken)
        .filter((w) => w && !TURKISH_STOPWORDS.has(w) && !TR_QUESTION_SUFFIX.test(w));
      if (words.length === 1) out.push(words[0] ?? '');
      else if (words.length > 1) out.push(`"${words.join(' ')}"`);
      continue;
    }
    const raw = m[2] ?? '';
    const negated = raw.startsWith('-') && raw.length > 1;
    const bare = negated ? raw.slice(1) : raw;
    const lowered = bare.toLocaleLowerCase('tr-TR');
    if (lowered === 'or' || lowered === 'veya' || lowered === 'yada') {
      if (out.length > 0 && out[out.length - 1] !== 'or') out.push('or');
      continue;
    }
    const token = cleanToken(bare);
    if (!token) continue;
    if (TURKISH_STOPWORDS.has(token) || TR_QUESTION_SUFFIX.test(token)) continue;
    if (token.length < 2 && !/^\d$/.test(token)) continue;
    out.push(negated ? `-${token}` : token);
  }
  while (out[0] === 'or') out.shift();
  while (out[out.length - 1] === 'or') out.pop();
  if (out.every((t) => t.startsWith('-'))) return '';
  return out.join(' ');
}

// ---------------------------------------------------------------------------
// Context trimming
// ---------------------------------------------------------------------------

export type ScoredChunk = MemoryChunk & { score?: number };

export interface TrimContextOptions {
  maxTokens: number;
  /** Recency reference; default: the newest chunk. */
  now?: string;
  /** Weight of retrieval score vs recency (0..1), default 0.7. */
  scoreWeight?: number;
}

function recencyScore(occurredAt: string, nowMs: number): number {
  const ageDays = Math.max(0, (nowMs - ms(occurredAt)) / DAY);
  return 1 / (1 + ageDays / 30);
}

/** Order chunks by retrieval score blended with recency and keep as many as fit the token budget. */
export function rankAndTrimContext<T extends ScoredChunk>(chunks: readonly T[], opts: TrimContextOptions): T[] {
  const nowMs = opts.now ? ms(opts.now) : Math.max(...chunks.map((c) => ms(c.occurredAt)).filter((x) => !Number.isNaN(x)), 0);
  const w = Math.max(0, Math.min(1, opts.scoreWeight ?? 0.7));
  const seen = new Set<string>();
  const ranked = chunks
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .map((c) => ({ c, s: (typeof c.score === 'number' ? Math.max(0, Math.min(1, c.score)) : 0.5) * w + recencyScore(c.occurredAt, nowMs) * (1 - w) }))
    .sort((a, b) => b.s - a.s || ms(b.c.occurredAt) - ms(a.c.occurredAt) || a.c.id.localeCompare(b.c.id));
  const out: T[] = [];
  let used = 0;
  for (const { c } of ranked) {
    const tokens = c.tokenCount > 0 ? c.tokenCount : estimateTokens(c.content);
    if (used + tokens > opts.maxTokens) continue;
    out.push(c);
    used += tokens;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

export interface GroundingResult {
  uncertain: boolean;
  /** Facts (numbers, dates, times, amounts, codes) in the answer that no cited chunk contains. */
  unsupportedFacts: string[];
}

const MONTH_WORDS = 'ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik|oca|şub|mar|nis|may|haz|tem|ağu|eyl|eki|kas|ara|january|february|march|april|june|july|august|september|october|november|december|jan|feb|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const RE_TIME = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g;
const RE_DATE_TR = new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,2})\\s+(${MONTH_WORDS})(?:\\s+(\\d{4}))?(?![\\p{L}\\p{N}])`, 'giu');
const RE_DATE_EN = new RegExp(`(?<![\\p{L}\\p{N}])(${MONTH_WORDS})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?(?![\\p{L}\\p{N}])`, 'giu');
const RE_DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const RE_DATE_NUM = /(?<![\d.])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d.])/g;
const RE_AMOUNT = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(tl|₺|try|usd|eur|gbp|\$|€|£)(?![\p{L}])/giu;
const RE_PERCENT = /%\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?%/g;
const RE_CODE = /\b([A-Z]{2}\d{3,4})\b/g;
const RE_PNR = /\bPNR\s*:?\s*([A-Z0-9]{5,6})\b/gi;
const RE_NUMBER = /(?<![\p{L}\d.,])(\d+(?:[.,]\d+)*)(?![\p{L}\d])/gu;

export interface ExtractedFact {
  /** As written in the text. */
  text: string;
  kind: 'time' | 'date' | 'amount' | 'code' | 'number';
  /** Canonical comparison key ("1842", "229.99", "10-9", "09:15", "TK2412"). */
  key: string;
}

/** "1.842" → "1842", "1.842,00" → "1842", "229,99" → "229.99", "1,842.50" → "1842.5". */
export function canonicalNumber(s: string): string {
  const raw = s.trim();
  if (!raw) return '';
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  let intPart = raw;
  let fracPart = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const sep = Math.max(lastDot, lastComma);
    intPart = raw.slice(0, sep);
    fracPart = raw.slice(sep + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = Math.max(lastDot, lastComma);
    const tail = raw.slice(sep + 1);
    const multiple = (raw.match(/[.,]/g) ?? []).length > 1;
    if (tail.length === 3 || multiple) intPart = raw;
    else {
      intPart = raw.slice(0, sep);
      fracPart = tail;
    }
  }
  const digits = intPart.replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
  const frac = fracPart.replace(/\D+/g, '').replace(/0+$/, '');
  return frac ? `${digits}.${frac}` : digits;
}

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, '');
}

function dateKey(day: string, month: string, year?: string): string {
  const m = /^\d+$/.test(month) ? Number(month) : monthIndex(month);
  if (!m || m < 1 || m > 12) return '';
  return `${Number(day)}-${m}${year ? `-${year.length === 2 ? `20${year}` : year}` : ''}`;
}

function collect(re: RegExp, text: string, fn: (m: RegExpExecArray) => ExtractedFact | null, facts: ExtractedFact[], blank: (start: number, end: number) => void): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const fact = fn(m);
    if (fact && fact.key) facts.push(fact);
    blank(m.index, m.index + m[0].length);
  }
}

/** Numbers, clock times, dates, amounts and booking codes mentioned in a text. */
export function extractFacts(text: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const chars = text.split('');
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end && i < chars.length; i++) chars[i] = ' ';
  };
  let work = text;
  const sync = (): void => {
    work = chars.join('');
  };
  collect(RE_DATE_TR, work, (m) => ({ text: m[0].trim(), kind: 'date', key: dateKey(m[1] ?? '', m[2] ?? '', m[3]) }), facts, blank);
  sync();
  collect(RE_DATE_EN, work, (m) => ({ text: m[0].trim(), kind: 'date', key: dateKey(m[2] ?? '', m[1] ?? '', m[3]) }), facts, blank);
  sync();
  collect(RE_DATE_ISO, work, (m) => ({ text: m[0], kind: 'date', key: dateKey(m[3] ?? '', m[2] ?? '', m[1]) }), facts, blank);
  sync();
  collect(RE_TIME, work, (m) => ({ text: m[0], kind: 'time', key: `${String(Number(m[1])).padStart(2, '0')}:${m[2] ?? ''}` }), facts, blank);
  sync();
  collect(RE_DATE_NUM, work, (m) => ({ text: m[0], kind: 'date', key: dateKey(m[1] ?? '', m[2] ?? '', m[3]) }), facts, blank);
  sync();
  collect(RE_AMOUNT, work, (m) => ({ text: m[0].trim(), kind: 'amount', key: canonicalNumber(m[1] ?? '') }), facts, blank);
  sync();
  collect(RE_PERCENT, work, (m) => ({ text: m[0].trim(), kind: 'amount', key: canonicalNumber(m[1] ?? m[2] ?? '') }), facts, blank);
  sync();
  collect(RE_PNR, work, (m) => ({ text: m[0].trim(), kind: 'code', key: (m[1] ?? '').toUpperCase() }), facts, blank);
  sync();
  collect(RE_CODE, work, (m) => ({ text: m[0], kind: 'code', key: (m[1] ?? '').toUpperCase() }), facts, blank);
  sync();
  collect(RE_NUMBER, work, (m) => ({ text: m[0], kind: 'number', key: canonicalNumber(m[1] ?? '') }), facts, blank);
  return facts.filter((f) => f.key.length > 0);
}

/**
 * Every concrete fact in the answer (numbers, dates, times, amounts, codes) must appear in the
 * content of the cited chunks; otherwise the answer is uncertain ("Kaynakta kesinleşmiyor.").
 */
export function groundingCheck(answerText: string, citedIds: readonly string[], chunks: readonly Pick<MemoryChunk, 'id' | 'content'>[]): GroundingResult {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const cited = citedIds.map((id) => byId.get(id)).filter((c): c is Pick<MemoryChunk, 'id' | 'content'> => !!c);
  const unknownCitation = citedIds.some((id) => !byId.has(id));
  const answerFacts = extractFacts(answerText);
  if (cited.length === 0) return { uncertain: answerFacts.length > 0 || unknownCitation, unsupportedFacts: answerFacts.map((f) => f.text) };
  const haystack = cited.map((c) => c.content).join('\n');
  const supported = new Set<string>();
  for (const f of extractFacts(haystack)) {
    supported.add(`${f.kind}:${f.key}`);
    if (f.kind === 'date') {
      supported.add(`date:${f.key.split('-').slice(0, 2).join('-')}`);
      for (const part of f.key.split('-')) supported.add(`number:${canonicalNumber(part)}`);
    }
    if (f.kind === 'amount' || f.kind === 'number') supported.add(`number:${f.key}`);
    if (f.kind === 'time') {
      supported.add(`number:${canonicalNumber(f.key.slice(0, 2))}`);
      supported.add(`number:${canonicalNumber(f.key.slice(3))}`);
    }
  }
  const upperHay = haystack.toUpperCase();
  const unsupported: string[] = [];
  for (const f of answerFacts) {
    let ok = false;
    if (f.kind === 'date') ok = supported.has(`date:${f.key}`) || supported.has(`date:${f.key.split('-').slice(0, 2).join('-')}`);
    else if (f.kind === 'code') ok = upperHay.includes(f.key);
    else if (f.kind === 'amount') ok = supported.has(`amount:${f.key}`) || supported.has(`number:${f.key}`);
    else ok = supported.has(`${f.kind}:${f.key}`);
    if (!ok) unsupported.push(f.text);
  }
  return { uncertain: unknownCitation || unsupported.length > 0, unsupportedFacts: [...new Set(unsupported)] };
}

// ---------------------------------------------------------------------------
// Source refs & search results
// ---------------------------------------------------------------------------

/** One SourceRef per underlying source (first occurrence wins), with a citation excerpt. */
export function buildSourceRefs(chunks: readonly Pick<MemoryChunk, 'source' | 'content'>[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const c of chunks) {
    const key = `${c.source.type}:${c.source.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const excerpt = c.source.excerpt ?? truncate(c.content.replace(/\s*\n\s*/g, ' '), CITATION_MAX_CHARS);
    out.push({ ...c.source, excerpt });
  }
  return out;
}

export interface SearchInput {
  chunks?: readonly ScoredChunk[];
  threads?: readonly EmailThread[];
  events?: readonly CalendarEvent[];
  contacts?: readonly Contact[];
  lifeEvents?: readonly LifeEvent[];
  commitments?: readonly Commitment[];
  tasks?: readonly TaskItem[];
}

export interface ToSearchResultsOptions {
  mode: 'semantic' | 'fts';
  query?: string;
  now?: string;
  locale?: Locale;
  timezone?: string;
  /** Default 20. */
  limit?: number;
}

function queryTokens(query: string | undefined): string[] {
  if (!query) return [];
  return buildFtsQuery(query)
    .split(/\s+/)
    .filter((t) => t && t !== 'or' && !t.startsWith('-'))
    .map((t) => t.replace(/"/g, ''))
    .flatMap((t) => t.split(' '))
    .filter(Boolean);
}

/** Share of query tokens that prefix a word of the text (0..1). */
export function termOverlap(query: string | undefined, text: string): number {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 0;
  const words = text.toLocaleLowerCase('tr-TR').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let hits = 0;
  for (const t of tokens) if (words.some((w) => w.startsWith(t))) hits += 1;
  return hits / tokens.length;
}

function relevance(query: string | undefined, text: string, date: string, nowMs: number, mode: 'semantic' | 'fts', given?: number): number {
  const rec = recencyScore(date, nowMs);
  if (typeof given === 'number') return Math.max(0, Math.min(1, given)) * 0.8 + rec * 0.2;
  const overlap = termOverlap(query, text);
  if (!query) return rec;
  return mode === 'fts' ? overlap * 0.8 + rec * 0.2 : overlap * 0.6 + rec * 0.4;
}

/** Map memory chunks and entity hits into the unified SearchResult list, best first. */
export function toSearchResults(input: SearchInput, opts: ToSearchResultsOptions): SearchResult[] {
  const locale = opts.locale ?? 'tr';
  const timezone = opts.timezone ?? 'Europe/Istanbul';
  const nowMs = opts.now ? ms(opts.now) : Date.now();
  const limit = opts.limit ?? 20;
  const results: SearchResult[] = [];
  const push = (r: SearchResult): void => {
    results.push(r);
  };
  for (const c of input.chunks ?? []) {
    const title = c.topic?.trim() || truncate(c.content.replace(/\s*\n\s*/g, ' '), 60);
    push({
      id: `memory:${c.id}`,
      kind: 'memory',
      title,
      summary: truncate(c.content.replace(/\s*\n\s*/g, ' '), 200),
      date: c.occurredAt,
      source: c.source,
      score: relevance(opts.query, `${title} ${c.content}`, c.occurredAt, nowMs, opts.mode, c.score),
      entityId: c.sourceId,
    });
  }
  for (const t of input.threads ?? []) {
    if (t.deletedAt) continue;
    const summary = t.analysis?.summary ?? t.snippet;
    const from = t.participants[0];
    const person = from?.name?.trim() || from?.email;
    push({
      id: `email:${t.id}`,
      kind: 'email',
      title: stripSubjectPrefixes(t.subject),
      summary: truncate(summary, 200),
      date: t.lastMessageAt,
      source: { type: 'gmail', id: t.id, externalId: t.externalThreadId, label: sourceLabel('gmail', locale), ...(person ? { person } : {}), timestamp: t.lastMessageAt },
      score: relevance(opts.query, `${t.subject} ${summary} ${person ?? ''}`, t.lastMessageAt, nowMs, opts.mode),
      entityId: t.id,
    });
  }
  for (const e of input.events ?? []) {
    if (e.deletedAt || e.status === 'cancelled') continue;
    const when = e.allDay ? dateSentence(e.startAt, timezone, locale, false) : dateSentence(e.startAt, timezone, locale);
    const summary = [when, e.location ?? null].filter(Boolean).join(' · ');
    push({
      id: `event:${e.id}`,
      kind: 'event',
      title: e.title,
      summary,
      date: e.startAt,
      source: { type: e.source, id: e.id, externalId: e.externalEventId, label: sourceLabel(e.source, locale), timestamp: e.startAt },
      score: relevance(opts.query, `${e.title} ${e.location ?? ''} ${e.attendees.map((a) => a.name ?? '').join(' ')}`, e.startAt, nowMs, opts.mode),
      entityId: e.id,
    });
  }
  for (const c of input.contacts ?? []) {
    if (c.deletedAt) continue;
    const date = c.lastContactAt ?? c.updatedAt;
    const summary = [c.title, c.company].filter(Boolean).join(' · ') || c.emails[0] || '';
    push({
      id: `person:${c.id}`,
      kind: 'person',
      title: c.displayName,
      summary,
      date,
      source: { type: 'user', id: c.id, label: locale === 'en' ? 'Contact' : 'Kişi', person: c.displayName, personId: c.id, timestamp: date },
      score: relevance(opts.query, `${c.displayName} ${c.emails.join(' ')} ${summary}`, date, nowMs, opts.mode),
      entityId: c.id,
    });
  }
  for (const l of input.lifeEvents ?? []) {
    if (l.deletedAt) continue;
    const date = l.eventAt ?? l.source.timestamp;
    const detail = [l.details.merchant, l.details.carrier, l.details.airline, l.details.payee, l.details.serviceName, l.details.venue].filter(Boolean).join(' · ');
    push({ id: `life:${l.id}`, kind: 'life_event', title: l.title, summary: detail, date, source: l.source, score: relevance(opts.query, `${l.title} ${detail}`, date, nowMs, opts.mode), entityId: l.id });
  }
  for (const c of input.commitments ?? []) {
    if (c.deletedAt) continue;
    const date = c.dueAt ?? c.source.timestamp;
    push({ id: `commitment:${c.id}`, kind: 'commitment', title: c.text, summary: c.quote ?? c.dueText ?? '', date, source: c.source, score: relevance(opts.query, `${c.text} ${c.quote ?? ''} ${c.counterpartName ?? ''}`, date, nowMs, opts.mode), entityId: c.id });
  }
  for (const t of input.tasks ?? []) {
    if (t.deletedAt) continue;
    const date = t.dueAt ?? t.updatedAt;
    push({
      id: `task:${t.id}`,
      kind: 'task',
      title: t.title,
      summary: t.notes ?? '',
      date,
      source: t.source ?? { type: 'user', id: t.id, label: sourceLabel('user', locale), timestamp: t.createdAt },
      score: relevance(opts.query, `${t.title} ${t.notes ?? ''}`, date, nowMs, opts.mode),
      entityId: t.id,
    });
  }
  const seen = new Set<string>();
  return results
    .sort((a, b) => b.score - a.score || ms(b.date) - ms(a.date) || a.id.localeCompare(b.id))
    .filter((r) => {
      const key = `${r.kind}:${r.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((r) => ({ ...r, score: Math.round(r.score * 1000) / 1000 }));
}
