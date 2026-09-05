/**
 * Pre-prompt redaction: strip HTML, quoted history, signatures, legal disclaimers, unsubscribe
 * footers and long tracking URLs, then cap the length per purpose. Keeps the parts a model
 * needs (greeting, body, closing + name) and drops noise that costs tokens and leaks nothing useful.
 */
import type { Locale } from '@da/domain';
import { normalizeText, stripQuotedHistory } from '../util';
import type { AiPurpose } from './types';

/** Character caps per purpose — for list purposes the cap applies to each item. */
export const PROMPT_CHAR_LIMITS: Record<AiPurpose, number> = {
  email_deep_analysis: 6000,
  email_batch_classify: 320,
  briefing: 240,
  meeting_prep: 800,
  commitment_extraction: 5000,
  capture_analysis: 8000,
  assistant_answer: 700,
  reply_draft: 2500,
  voice_intent: 600,
  schedule_suggestion: 200,
  suggested_questions: 200,
  other: 4000,
};

export interface RedactOptions {
  purpose?: AiPurpose;
  /** Explicit cap (wins over the purpose default). */
  maxChars?: number;
  keepQuotedHistory?: boolean;
  keepSignature?: boolean;
  locale?: Locale;
}

const SIGNATURE_DELIMITERS = [
  /^-{2,}\s*$/,
  /^_{3,}\s*$/,
  /^—+\s*$/,
  /^sent from my (iphone|ipad|galaxy|android|samsung|mobile)/i,
  /^(iphone|ipad|android|samsung|galaxy)[’']?[ıiu]?m?dan gönderildi/i,
  /^get outlook for (ios|android)/i,
  /^outlook for (ios|android)/i,
  /^bu (e-?posta|ileti) .*(mobil|telefon).*gönderildi/i,
];

const CLOSING_LINE =
  /^(saygılarımla|saygılarımızla|saygılar|sevgiler|sevgilerimle|selamlar|iyi çalışmalar|iyi günler|iyi akşamlar|kolay gelsin|teşekkürler|teşekkür ederim|çok teşekkürler|best regards|kind regards|warm regards|regards|best|thanks|thank you|many thanks|sincerely|cheers|cordialement|mit freundlichen grüßen)[,.!]?\s*$/i;

const DISCLAIMER_PARAGRAPH =
  /(gizli|confidential|yasal uyarı|legal notice|disclaimer|sorumluluk kabul|liability|intended recipient|muhatab|yetkisiz|unauthori[sz]ed|virüs|virus|kvkk|gdpr|kişisel verilerin korunması|imha edin|delete this (e-?mail|message)|bu (e-?posta|ileti)(yı|nın)? .*(sil|imha))/i;

const UNSUBSCRIBE_LINE =
  /(unsubscribe|abonelik(ten|ği|ten çık)|aboneliğinizi|listeden çık|listemizden çık|view (this )?(e-?mail )?in (your )?browser|tarayıcı(da|nızda) görüntüle|e-?posta tercihleri|email preferences|manage (your )?preferences|bildirim tercihleri)/i;

export function stripSignature(text: string): string {
  const lines = text.split('\n');
  let cutAt = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (i > 0 && SIGNATURE_DELIMITERS.some((re) => re.test(line))) {
      cutAt = i;
      break;
    }
  }
  let kept = lines.slice(0, cutAt);
  const closingIndex = kept.findIndex((l, i) => i > 0 && CLOSING_LINE.test(l.trim()));
  if (closingIndex > 0) {
    const rest = kept.slice(closingIndex + 1);
    const lateEnough = closingIndex / kept.length >= 0.4;
    const restLooksLikeSignature = rest.length <= 15 && rest.every((l) => l.trim().length <= 80);
    if (lateEnough || restLooksLikeSignature) {
      const nameLines = rest.filter((l) => l.trim().length > 0).slice(0, 2);
      const shortNameLines = nameLines.filter((l) => l.trim().length <= 60 && !/\d{3,}/.test(l));
      kept = [...kept.slice(0, closingIndex + 1), ...shortNameLines];
    }
  }
  return kept.join('\n').trim();
}

export function stripDisclaimers(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  const kept = paragraphs.filter((p) => {
    const flat = p.replace(/\s+/g, ' ').trim();
    if (!flat) return false;
    if (flat.length > 160 && DISCLAIMER_PARAGRAPH.test(flat)) return false;
    return true;
  });
  return kept
    .map((p) =>
      p
        .split('\n')
        .filter((l) => !UNSUBSCRIBE_LINE.test(l))
        .join('\n'),
    )
    .filter((p) => p.trim().length > 0)
    .join('\n\n')
    .trim();
}

/** Replace long tracking URLs by their host and blank out base64 / long token blobs. */
export function shortenUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>"')\]]{81,}/g, (url) => {
      try {
        return `${new URL(url).origin}/…`;
      } catch {
        return '[bağlantı]';
      }
    })
    .replace(/[A-Za-z0-9+/=_-]{80,}/g, '[veri]');
}

export function redactForPrompt(text: string, opts: RedactOptions = {}): string {
  const limit = opts.maxChars ?? PROMPT_CHAR_LIMITS[opts.purpose ?? 'other'];
  let out = normalizeText(text ?? '');
  if (!opts.keepQuotedHistory) out = stripQuotedHistory(out);
  out = stripDisclaimers(out);
  if (!opts.keepSignature) out = stripSignature(out);
  out = shortenUrls(out).replace(/\n{3,}/g, '\n\n').trim();
  if (out.length <= limit) return out;
  const marker = opts.locale === 'en' ? '[… shortened]' : '[… kısaltıldı]';
  const room = Math.max(0, limit - marker.length - 1);
  let cut = out.slice(0, room);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > room * 0.7) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()} ${marker}`;
}
