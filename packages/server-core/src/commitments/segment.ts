/** Message segmentation: signature stripping, vocative detection, sentence and clause splitting. */
import { isNameToken, stripHonorifics } from './shared';

const CLOSINGS = [
  'saygılarımla', 'saygılarımızla', 'saygılar', 'saygılarımı sunarım', 'sevgiler', 'sevgilerimle', 'sevgilerimizle', 'iyi çalışmalar', 'iyi günler', 'iyi akşamlar',
  'iyi haftalar', 'iyi hafta sonları', 'iyi tatiller', 'teşekkürler', 'teşekkür ederim', 'teşekkür ederiz', 'çok teşekkürler', 'çok teşekkür ederim', 'kolay gelsin',
  'hoşça kalın', 'hoşça kal', 'görüşmek üzere', 'görüşürüz', 'esenlikle', 'esenlikler', 'selamlar', 'best regards', 'kind regards', 'warm regards', 'warmest regards',
  'regards', 'best', 'all the best', 'best wishes', 'thanks', 'thank you', 'many thanks', 'thanks again', 'cheers', 'sincerely', 'yours sincerely', 'yours truly',
  'yours', 'take care', 'talk soon', 'speak soon', 'thanks in advance', 'thx', 'ty',
];
const RE_MOBILE = /^(?:sent from my|sent via|iphone'?umdan gönderildi|android'?imden gönderildi|ipad'?imden gönderildi|outlook for|get outlook for)/iu;
const RE_SEPARATOR = /^(?:--+|—+|__+|\*\*+)\s*$/u;
const GREETINGS = new Set(
  ['merhaba', 'merhabalar', 'selam', 'selamlar', 'sayın', 'sevgili', 'değerli', 'kıymetli', 'sn', 'sn.', 'hi', 'hello', 'hey', 'dear', 'good', 'morning', 'afternoon', 'evening', 'hola'].map((g) => g.replace(/ı/g, 'i')),
);
const RE_TRAILING_PUNCT = /[,;:!.]+$/u;

export interface StrippedMessage {
  body: string;
  /** Name found in the sign-off ("Saygılarımla,\nAhmet Yılmaz" → "Ahmet Yılmaz"). */
  signatureName: string | null;
}

function lower(s: string): string {
  return s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
}

function closingMatch(line: string): { closing: string; rest: string } | null {
  const l = lower(line.trim().replace(/[’']/g, "'"));
  for (const c of CLOSINGS) {
    const key = lower(c);
    if (l === key || l === `${key},` || l === `${key}.` || l === `${key}!`) return { closing: c, rest: '' };
    if (l.startsWith(`${key},`) || l.startsWith(`${key} -`) || l.startsWith(`${key} –`)) {
      const rest = line.trim().slice(c.length).replace(/^[,\s\-–]+/u, '').trim();
      if (rest.length <= 40) return { closing: c, rest };
    }
  }
  return null;
}

function looksLikeName(line: string): boolean {
  const cleaned = stripHonorifics(line.trim().replace(RE_TRAILING_PUNCT, ''));
  const tokens = cleaned.split(/\s+/u).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  return tokens.every((t) => isNameToken(t) || /^\p{Lu}\.$/u.test(t) || /^\p{Lu}{2,4}$/u.test(t));
}

/** Drop everything from the sign-off (or a signature separator / mobile footer) to the end. */
export function stripSignature(text: string): StrippedMessage {
  const lines = text.split('\n');
  let cut = lines.length;
  let signatureName: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const t = line.trim();
    if (!t) continue;
    if (RE_SEPARATOR.test(t) || RE_MOBILE.test(t)) {
      cut = i;
      break;
    }
    if (i === 0 && lines.length === 1) continue;
    const c = closingMatch(t);
    if (!c) continue;
    cut = i;
    if (c.rest && looksLikeName(c.rest)) signatureName = stripHonorifics(c.rest.replace(RE_TRAILING_PUNCT, ''));
    if (!signatureName) {
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const next = (lines[j] ?? '').trim();
        if (!next) continue;
        if (looksLikeName(next)) signatureName = stripHonorifics(next.replace(RE_TRAILING_PUNCT, ''));
        break;
      }
    }
    break;
  }
  if (cut === lines.length) {
    // No closing phrase: a trailing bare name line ("…\n\nYunus") is still a signature.
    for (let i = lines.length - 1; i > 0; i--) {
      const t = (lines[i] ?? '').trim();
      if (!t) continue;
      const prev = (lines[i - 1] ?? '').trim();
      if (prev === '' && looksLikeName(t) && !/[.!?]$/u.test(t)) {
        cut = i;
        signatureName = stripHonorifics(t.replace(RE_TRAILING_PUNCT, ''));
      }
      break;
    }
  }
  return { body: lines.slice(0, cut).join('\n').trim(), signatureName };
}

/** Name addressed at the very start: "Merhaba Mehmet Bey," / "Yunus merhaba," / "Sayın Selin Kaya," / "Hi Selin,". */
export function detectVocative(text: string): string | null {
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  if (!firstLine || firstLine.length > 80) return null;
  const head = firstLine.split(/[,;:!.]/u)[0] ?? '';
  const tokens = head.split(/\s+/u).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 6) return null;
  const isGreeting = (t: string): boolean => GREETINGS.has(lower(t).replace(/[,.!]/g, ''));
  const honor = (t: string): boolean => /^(?:bey|hanım|abi|abla|hocam|hoca|mr\.?|mrs\.?|ms\.?|dr\.?)$/iu.test(t);
  let nameTokens: string[] = [];
  if (isGreeting(tokens[0] ?? '')) {
    let i = 1;
    while (i < tokens.length && isGreeting(tokens[i] ?? '')) i += 1;
    nameTokens = tokens.slice(i);
  } else if (tokens.length >= 2 && isGreeting(tokens[tokens.length - 1] ?? '')) {
    nameTokens = tokens.slice(0, -1);
  } else {
    return null;
  }
  nameTokens = nameTokens.filter((t) => !honor(t));
  if (nameTokens.length === 0 || nameTokens.length > 3) return null;
  if (!nameTokens.every((t) => isNameToken(t.replace(RE_TRAILING_PUNCT, '')))) return null;
  return nameTokens.map((t) => t.replace(RE_TRAILING_PUNCT, '')).join(' ');
}

export interface Span {
  /** Verbatim text. */
  text: string;
  start: number;
  end: number;
  /** Text handed to the analyser when it differs from the verbatim clause ("and let you know" → "we'll let you know"). */
  analysisText?: string;
}

const RE_EN_SUBJECT_AUX = /(?<![\p{L}])(?<subj>(?:i|we)\s*(?:'ll|will|shall|'m going to|am going to|'re going to|are going to|can|could|promise to|plan to))\s+/iu;
const RE_EN_BARE_VERB_START = /^(?!(?:i|we|you|they|he|she|it|please|kindly|if|then|also|the|a|an|my|our|your)\b)[a-z]+(?:\s|$)/iu;

/** "We'll review the draft and let you know" → the right clause inherits "we'll". */
function inheritSubject(left: string, right: string): string | null {
  const m = RE_EN_SUBJECT_AUX.exec(left);
  if (!m?.groups?.subj || !RE_EN_BARE_VERB_START.test(right)) return null;
  return `${m.groups.subj} ${right}`;
}

const ABBREVIATIONS = new Set(['vb', 'vs', 'dr', 'sn', 'prof', 'av', 'bkz', 'örn', 'mr', 'mrs', 'ms', 'no', 'st', 'e.g', 'i.e', 'etc', 'inc', 'ltd', 'a.ş', 'ltd.şti', 'tel', 'yak', 'yakl', 'md', 'sok', 'cad', 'mah', 'apt']);

/** Sentences with their offsets: boundaries at ./!/? followed by whitespace (not inside numbers or abbreviations) and at line breaks. */
export function splitSentences(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;
  const push = (end: number): void => {
    const raw = text.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, start: start + leading, end: start + leading + t.length });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (ch === '\n') {
      push(i);
      continue;
    }
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    let j = i;
    while (j + 1 < text.length && '.!?'.includes(text[j + 1] ?? '')) j += 1;
    const next = text[j + 1];
    if (next !== undefined && !/\s/u.test(next)) continue;
    if (ch === '.') {
      const before = text.slice(Math.max(0, i - 8), i);
      const word = /(\S+)$/u.exec(before)?.[1] ?? '';
      if (/^\d+$/u.test(word) && next !== undefined) continue;
      if (ABBREVIATIONS.has(lower(word).replace(/\.$/, ''))) continue;
    }
    push(j + 1);
    i = j;
  }
  push(text.length);
  return out;
}

/** Split a sentence at conjunctions ("ve", "and", ";", ",") only when both sides carry a verb form. */
export function splitClauses(sentence: Span, hasVerb: (s: string) => boolean): Span[] {
  const separators = /\s+(?:ve|ayrıca|ardından|sonrasında|and then|and|then)\s+|;\s*|,\s+/gu;
  const parts: Span[] = [];
  let cursor = 0;
  let pendingAnalysis: string | null = null;
  let m: RegExpExecArray | null;
  const text = sentence.text;
  const flush = (end: number, analysisText: string | null): void => {
    const raw = text.slice(cursor, end);
    const leading = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (!t) return;
    const span: Span = { text: t, start: sentence.start + cursor + leading, end: sentence.start + cursor + leading + t.length };
    if (analysisText) span.analysisText = analysisText;
    parts.push(span);
  };
  while ((m = separators.exec(text)) !== null) {
    const left = text.slice(cursor, m.index);
    const right = text.slice(m.index + m[0].length);
    const leftAnalysis: string = pendingAnalysis ?? left;
    const rightSeparated: string = right.split(separators)[0] ?? right;
    const inherited: string | null = /\s(?:and|then)\s/iu.test(m[0]) ? inheritSubject(leftAnalysis, rightSeparated) : null;
    if (!hasVerb(leftAnalysis) || !(hasVerb(right) || (inherited !== null && hasVerb(inherited)))) continue;
    flush(m.index, pendingAnalysis);
    cursor = m.index + m[0].length;
    pendingAnalysis = inherited ? `${inherited.slice(0, inherited.length - rightSeparated.length)}${text.slice(cursor)}` : null;
  }
  flush(text.length, pendingAnalysis);
  return parts.length > 0 ? parts : [sentence];
}
