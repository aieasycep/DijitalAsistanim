/**
 * commitments — deterministic extraction of promises ("yarın göndereceğim", "I'll send it by Friday")
 * and requests ("iletebilir misin", "can you share …") from mail bodies, meeting notes and voice
 * transcripts, with evidence-backed due dates from the dates module.
 *
 * Direction: first-person forms written by the user → user_owes; the same forms written by the
 * other party → other_owes. Requests flip: the user asking → other_owes, the other party asking → user_owes.
 * Quoted history and signatures are ignored; negated, conditional, optative and question forms are rejected.
 */
import type { CommitmentDirection, Locale, SourceRef } from '@da/domain';
import {
  extractDates,
  localToUtcIso,
  lowercasePreservingIndices,
  parseDateKey,
  type ExtractedDate,
} from '../dates';
import { clamp, normalizeText, stripQuotedHistory, truncate, uniqBy } from '../util';
import { analyzeEnglishClause, composeEnglish } from './english';
import { detectVocative, splitClauses, splitSentences, stripSignature, type Span } from './segment';
import { firstNameOf, resolveFullName, stripHonorifics, type ClauseAnalysis } from './shared';
import { analyzeTurkishClause, composeTurkish, isKnownDeliverable } from './turkish';
import {
  RE_EXPECTATION,
  RE_FIRST_PERSON_FORMS,
  RE_GENERIC_FUTURE,
  RE_REQUEST_CONDITIONAL,
  RE_REQUEST_IMPERATIVE,
  RE_REQUEST_NEED,
  RE_REQUEST_QUESTION,
  RE_REQUEST_VERBAL_NOUN,
} from './verbs';
import type {
  CommitmentCandidate,
  CommitmentDraft,
  CommitmentDue,
  ExtractCommitmentsInput,
  NormalizeCommitmentOptions,
} from './types';

export type {
  CommitmentCandidate,
  CommitmentCounterpartHint,
  CommitmentDraft,
  CommitmentDue,
  CommitmentFormKind,
  CommitmentLanguage,
  ExtractCommitmentsInput,
  NormalizeCommitmentOptions,
} from './types';
export {
  stripSignature as stripMailSignature,
  detectVocative as detectVocativeName,
} from './segment';
export { turkishAccusative, normalizeNounPhrase } from './turkish';

const MAX_TEXT = 20_000;
const MAX_CANDIDATES = 8;
const MAX_TEXT_LEN = 200;
const MAX_QUOTE_LEN = 240;
const DEFAULT_NOW = '2000-01-01T00:00:00.000Z';
const DEFAULT_TZ = 'Europe/Istanbul';

const RE_EN_VERBISH =
  /(?<![\p{L}])(?:(?:i|we)\s*(?:'ll|will|shall|'m going to|am going to|'re going to|are going to|can|could|promise to|plan to)|(?:can|could|would|will)\s+you|please|kindly|waiting for|let (?:me|us|you) know|get back to (?:me|you)|send (?:me|us)|i need you to)(?![\p{L}])/u;
const RE_ADDRESSES_USER =
  /(?<![\p{L}])(?:size|sana|sizi|seni|sizinle|seninle|sizlere|sizlerle|tarafınıza|tarafına|you|your)(?![\p{L}])/u;
const RE_EN_DELIVERABLE =
  /(?<![\p{L}])(?:proposal|report|file|files|document|documents|invoice|contract|draft|quote|quotation|update|feedback|answer|reply|details|numbers|figures|slides|deck|presentation|link|photos|pictures|list|plan|schedule|estimate|offer|agreement|signature|payment|confirmation|approval|summary|notes|minutes|specs?|design|mockup|version|pdf|spreadsheet|sheet|data|results|samples?|order|shipment|package|parcel|brief|timeline|budget|roadmap)(?![\p{L}])/u;

function hasVerbForm(text: string): boolean {
  const lower = lowercasePreservingIndices(text);
  RE_FIRST_PERSON_FORMS.lastIndex = 0;
  if (RE_FIRST_PERSON_FORMS.test(lower)) return true;
  RE_GENERIC_FUTURE.lastIndex = 0;
  if (RE_GENERIC_FUTURE.test(lower)) return true;
  RE_REQUEST_IMPERATIVE.lastIndex = 0;
  return (
    RE_REQUEST_QUESTION.test(lower) ||
    RE_REQUEST_VERBAL_NOUN.test(lower) ||
    RE_REQUEST_NEED.test(lower) ||
    RE_REQUEST_CONDITIONAL.test(lower) ||
    RE_EXPECTATION.test(lower) ||
    RE_EN_VERBISH.test(lower)
  );
}

function analyzeClause(
  text: string,
  opts: { now: string; timezone: string; hintFirstName: string | null },
  locale: Locale,
): ClauseAnalysis | null {
  if (locale === 'en') return analyzeEnglishClause(text, opts) ?? analyzeTurkishClause(text, opts);
  return analyzeTurkishClause(text, opts) ?? analyzeEnglishClause(text, opts);
}

function dueFromDates(dates: ExtractedDate[], timezone: string): CommitmentDue | null {
  if (dates.length === 0) return null;
  const rank = (d: ExtractedDate): number =>
    d.kind === 'deadline' ? 3 : d.kind === 'time' ? 1 : 2;
  const sorted = [...dates].sort((a, b) => rank(b) - rank(a) || a.start - b.start);
  const best = sorted[0];
  if (!best) return null;
  const iso = best.hasTime
    ? best.iso
    : localToUtcIso(parseDateKey(best.localDate), 18, 0, timezone);
  return {
    iso,
    text: best.text,
    evidence: best.evidence,
    hasTime: best.hasTime,
    localDate: best.localDate,
  };
}

interface MessageContext {
  vocative: string | null;
  signatureName: string | null;
  hintName: string | null;
}

function resolveCounterpart(
  a: ClauseAnalysis,
  authorIsUser: boolean,
  ctx: MessageContext,
): { name: string | null; clauseNameIsCounterpart: boolean } {
  if (a.person === 'first' && authorIsUser) {
    if (a.clauseName)
      return {
        name: resolveFullName(a.clauseName.name, ctx.hintName),
        clauseNameIsCounterpart: true,
      };
    if (ctx.vocative)
      return { name: resolveFullName(ctx.vocative, ctx.hintName), clauseNameIsCounterpart: false };
    return { name: ctx.hintName, clauseNameIsCounterpart: false };
  }
  if (authorIsUser) {
    // The user asks the reader for something: the reader is the counterpart.
    return {
      name: ctx.vocative ? resolveFullName(ctx.vocative, ctx.hintName) : ctx.hintName,
      clauseNameIsCounterpart: false,
    };
  }
  // The other party wrote the text: they are the counterpart, whether promising or asking.
  return { name: ctx.hintName ?? ctx.signatureName, clauseNameIsCounterpart: false };
}

function compose(
  a: ClauseAnalysis,
  direction: CommitmentDirection,
  counterpartName: string | null,
  clauseNameIsCounterpart: boolean,
  topic: string | null | undefined,
): string {
  const counterpartFirstName = counterpartName ? firstNameOf(counterpartName) : null;
  const args = { analysis: a, direction, counterpartFirstName, clauseNameIsCounterpart, topic };
  const text = a.language === 'tr' ? composeTurkish(args) : composeEnglish(args);
  return truncate(text, MAX_TEXT_LEN);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildCandidate(
  a: ClauseAnalysis,
  clause: Span,
  sentence: Span,
  input: ExtractCommitmentsInput,
  ctx: MessageContext,
): CommitmentCandidate | null {
  const direction: CommitmentDirection =
    a.person === 'first'
      ? input.authorIsUser
        ? 'user_owes'
        : 'other_owes'
      : input.authorIsUser
        ? 'other_owes'
        : 'user_owes';
  const { name: counterpartName, clauseNameIsCounterpart } = resolveCounterpart(
    a,
    input.authorIsUser,
    ctx,
  );
  const due = dueFromDates(
    extractDates({ text: clause.text, now: input.now, timezone: input.timezone }),
    input.timezone,
  );
  const object = clauseNameIsCounterpart ? a.objectWithoutName : a.object;
  // The other party's own plans count only when directed at the user, dated, or about a deliverable
  // ("Yönetim toplantısında sunacağım" is not a promise to the user).
  if (direction === 'other_owes' && a.person === 'first') {
    const addressed =
      a.addressesYou === true || RE_ADDRESSES_USER.test(lowercasePreservingIndices(clause.text));
    const deliverable =
      a.language === 'tr'
        ? isKnownDeliverable(object)
        : RE_EN_DELIVERABLE.test(object.toLowerCase());
    if (!due && !addressed && !deliverable) return null;
  }

  let confidence = a.baseConfidence;
  if (due) confidence += due.hasTime ? 0.1 : 0.08;
  if (clauseNameIsCounterpart) confidence += 0.05;
  else if (counterpartName) confidence += 0.03;
  if (object) confidence += 0.03;
  if (a.strong) confidence += 0.03;
  if (!object && !due && !counterpartName) confidence -= 0.1;
  confidence = round2(clamp(confidence, 0, 0.95));
  if (confidence < 0.5) return null;

  return {
    text: compose(a, direction, counterpartName, clauseNameIsCounterpart, input.topic),
    quote: truncate(clause.text, MAX_QUOTE_LEN),
    direction,
    counterpartName,
    due,
    dueText: due?.text ?? null,
    confidence,
    evidence: truncate(sentence.text, MAX_QUOTE_LEN),
    verb: a.lemma,
    language: a.language,
    form: a.form,
  };
}

/** Deterministic commitment candidates in text order (deduplicated, at most 8). */
export function extractCommitments(input: ExtractCommitmentsInput): CommitmentCandidate[] {
  const raw = input.text ?? '';
  if (!raw.trim() || Number.isNaN(Date.parse(input.now))) return [];
  const locale: Locale = input.locale ?? 'tr';
  const cleaned = stripQuotedHistory(
    normalizeText(raw.length > MAX_TEXT ? raw.slice(0, MAX_TEXT) : raw),
  );
  const { body, signatureName } = stripSignature(cleaned);
  if (!body) return [];
  const hintName = input.counterpartHint?.name
    ? stripHonorifics(input.counterpartHint.name) || null
    : null;
  const ctx: MessageContext = {
    vocative: input.authorIsUser ? detectVocative(body) : null,
    signatureName,
    hintName,
  };
  const opts = {
    now: input.now,
    timezone: input.timezone,
    hintFirstName: hintName ? firstNameOf(hintName) : null,
  };

  const out: CommitmentCandidate[] = [];
  for (const sentence of splitSentences(body)) {
    for (const clause of splitClauses(sentence, hasVerbForm)) {
      const analysis = analyzeClause(clause.analysisText ?? clause.text, opts, locale);
      if (!analysis) continue;
      const candidate = buildCandidate(analysis, clause, sentence, input, ctx);
      if (candidate) out.push(candidate);
    }
  }
  return uniqBy(
    out,
    (c) => `${c.direction}|${c.text.toLocaleLowerCase('tr-TR')}|${c.due?.localDate ?? ''}`,
  ).slice(0, MAX_CANDIDATES);
}

/**
 * Normalized commitment text for a verbatim quote: "yarın Mehmet'e teklifi göndereceğim" → "Mehmet'e teklifi gönder".
 * Falls back to the cleaned quote when no verb form is recognized.
 */
export function normalizeCommitmentText(
  quote: string,
  counterpart: string | null | undefined,
  locale: Locale = 'tr',
  opts: NormalizeCommitmentOptions = {},
): string {
  const cleanedQuote = normalizeText(quote)
    .replace(/[.!?\s]+$/u, '')
    .trim();
  if (!cleanedQuote) return '';
  const hintName = counterpart ? stripHonorifics(counterpart) || null : null;
  const analysis = analyzeClause(
    cleanedQuote,
    {
      now: opts.now ?? DEFAULT_NOW,
      timezone: opts.timezone ?? DEFAULT_TZ,
      hintFirstName: hintName ? firstNameOf(hintName) : null,
    },
    locale,
  );
  if (!analysis)
    return truncate(
      (cleanedQuote[0] ?? '').toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-US') +
        cleanedQuote.slice(1),
      MAX_TEXT_LEN,
    );
  const direction = opts.direction ?? 'user_owes';
  const clauseNameIsCounterpart =
    direction === 'user_owes' && analysis.person === 'first' && analysis.clauseName !== null;
  const counterpartName =
    clauseNameIsCounterpart && analysis.clauseName
      ? resolveFullName(analysis.clauseName.name, hintName)
      : hintName;
  return compose(analysis, direction, counterpartName, clauseNameIsCounterpart, opts.topic);
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

function foldKey(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Stable key so re-running extraction over the same source never duplicates a commitment. */
export function commitmentDedupeKey(
  candidate: Pick<CommitmentCandidate, 'text' | 'direction' | 'due'>,
  sourceId: string,
): string {
  const key = `${foldKey(candidate.text)}|${candidate.due?.localDate ?? ''}`;
  return `commit:${sourceId}:${candidate.direction}:${fnv1a(key)}`;
}

/** Row-shaped draft: high-confidence candidates open directly, the rest are proposed for user confirmation. */
export function toCommitmentDraft(
  candidate: CommitmentCandidate,
  source: SourceRef,
): CommitmentDraft {
  return {
    text: candidate.text,
    quote: candidate.quote,
    direction: candidate.direction,
    counterpartName: candidate.counterpartName,
    counterpartContactId: null,
    dueAt: candidate.due?.iso ?? null,
    dueText: candidate.dueText,
    status: candidate.confidence >= 0.75 ? 'open' : 'proposed',
    source,
    confidence: candidate.confidence,
    completedAt: null,
    postponedUntil: null,
    relatedEventId: null,
    deletedAt: null,
  };
}
