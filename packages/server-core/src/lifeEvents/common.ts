/** Shared context, evidence collection, amount parsing, URL and sender helpers for life-event detectors. */
import type { Locale } from '@da/domain';
import { extractDates, lowercasePreservingIndices, type ExtractedDate } from '../dates';
import { emailDomain, normalizeText, stripQuotedHistory } from '../util';

export const MAX_EVIDENCE = 8;
const EVIDENCE_LEN = 160;
const BODY_LIMIT = 6000;
const HEAD_LEN = 400;

export class EvidenceCollector {
  private readonly items: string[] = [];

  constructor(private readonly text: string) {}

  /** Add a snippet around [start, end); duplicates are ignored. */
  add(start: number, end: number): void {
    if (this.items.length >= MAX_EVIDENCE) return;
    const from = Math.max(0, start - 40);
    const to = Math.min(this.text.length, end + 40);
    let snippet = this.text.slice(from, to).replace(/\s+/g, ' ').trim();
    if (from > 0) snippet = `…${snippet}`;
    if (to < this.text.length) snippet = `${snippet}…`;
    snippet = snippet.slice(0, EVIDENCE_LEN);
    if (!snippet || this.items.includes(snippet)) return;
    this.items.push(snippet);
  }

  addText(snippet: string): void {
    const s = snippet.replace(/\s+/g, ' ').trim().slice(0, EVIDENCE_LEN);
    if (!s || this.items.length >= MAX_EVIDENCE || this.items.includes(s)) return;
    this.items.push(s);
  }

  list(): string[] {
    return [...this.items];
  }
}

export interface UrlHit {
  url: string;
  start: number;
  end: number;
}

export interface Ctx {
  subject: string;
  body: string;
  /** subject + "\n" + body — every offset below refers to this string. */
  text: string;
  lower: string;
  /** Lowercased subject + first 400 chars of the body. */
  head: string;
  subjectLower: string;
  from: { name: string | null; email: string };
  senderDomain: string;
  senderOrg: string | null;
  now: string;
  timezone: string;
  locale: Locale;
  dates: ExtractedDate[];
  urls: UrlHit[];
  evidence: EvidenceCollector;
}

const RE_URL = /https?:\/\/[^\s<>()"'\]]+/gu;

function findUrls(text: string): UrlHit[] {
  const out: UrlHit[] = [];
  RE_URL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_URL.exec(text)) !== null) {
    const url = m[0].replace(/[.,;:!?]+$/u, '');
    if (!isHttpUrl(url)) continue;
    out.push({ url, start: m.index, end: m.index + url.length });
  }
  return out;
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Known brands keyed by a domain label ("mailer.netflix.com" → Netflix). */
const BRANDS: Record<string, string> = {
  google: 'Google',
  gmail: 'Google',
  youtube: 'YouTube',
  netflix: 'Netflix',
  spotify: 'Spotify',
  apple: 'Apple',
  icloud: 'iCloud',
  microsoft: 'Microsoft',
  outlook: 'Microsoft',
  amazon: 'Amazon',
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'n11',
  getir: 'Getir',
  yurticikargo: 'Yurtiçi Kargo',
  yurtici: 'Yurtiçi Kargo',
  araskargo: 'Aras Kargo',
  mngkargo: 'MNG Kargo',
  suratkargo: 'Sürat Kargo',
  ptt: 'PTT',
  ups: 'UPS',
  dhl: 'DHL',
  fedex: 'FedEx',
  hepsijet: 'Hepsijet',
  turkishairlines: 'THY',
  thy: 'THY',
  flypgs: 'Pegasus',
  pegasus: 'Pegasus',
  ajet: 'AJet',
  anadolujet: 'AJet',
  sunexpress: 'SunExpress',
  lufthansa: 'Lufthansa',
  ckenerji: 'CK Enerji',
  ckbogazicielektrik: 'CK Enerji',
  turkcell: 'Turkcell',
  vodafone: 'Vodafone',
  turktelekom: 'Türk Telekom',
  iski: 'İSKİ',
  igdas: 'İGDAŞ',
  enerjisa: 'Enerjisa',
  paypal: 'PayPal',
  github: 'GitHub',
  dropbox: 'Dropbox',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  yemeksepeti: 'Yemeksepeti',
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  obilet: 'obilet',
  biletix: 'Biletix',
  disneyplus: 'Disney+',
  exxen: 'Exxen',
  blutv: 'BluTV',
  adobe: 'Adobe',
  canva: 'Canva',
  notion: 'Notion',
  openai: 'ChatGPT',
  zoom: 'Zoom',
  garanti: 'Garanti BBVA',
  garantibbva: 'Garanti BBVA',
  isbank: 'İş Bankası',
  akbank: 'Akbank',
  yapikredi: 'Yapı Kredi',
  ziraat: 'Ziraat Bankası',
  ziraatbank: 'Ziraat Bankası',
  qnb: 'QNB',
  denizbank: 'DenizBank',
  enpara: 'Enpara',
  papara: 'Papara',
};

const GENERIC_SENDER_NAMES = /^(?:no-?reply|noreply|do-?not-?reply|donotreply|info|bilgi|bildirim|bildirimler|notification|notifications|mailer|support|destek|hesap|account|accounts|hello|merhaba|newsletter|bülten|team|ekip|service|servis|admin|system|sistem|alert|alerts|uyarı|security|güvenlik|billing|fatura|faturalama|payments?|ödeme|orders?|sipariş|shipping|kargo|reservations?|rezervasyon|customer ?service|müşteri hizmetleri)$/iu;
const RE_SENDER_SUFFIX = /\s*(?:\|.*|-\s.*|·.*|–.*|\(.*\)|<.*>|ekibi|team|bildirim(?:leri)?|notifications?|müşteri hizmetleri|customer (?:service|care)|support|destek|hesaplar|accounts?|security|güvenlik|no-?reply|noreply)\s*$/iu;

/** Human label for the sending organisation: display name ("CK Enerji", "Google") or a known brand from the domain. */
export function senderOrgName(from: { name?: string | null; email: string }): string | null {
  const name = (from.name ?? '').trim();
  if (name && !name.includes('@') && !GENERIC_SENDER_NAMES.test(name)) {
    const cleaned = name.replace(RE_SENDER_SUFFIX, '').trim();
    if (cleaned && !GENERIC_SENDER_NAMES.test(cleaned)) return cleaned.slice(0, 80);
  }
  const domain = emailDomain(from.email);
  const labels = domain.split('.').filter((l) => l && !['com', 'net', 'org', 'tr', 'co', 'io', 'gov', 'edu', 'info', 'mail', 'email', 'e', 'em', 'news', 'mailer', 'send', 'notify', 'accounts', 'account', 'noreply', 'no-reply', 'info', 'alerts', 'alert', 'notifications', 'notification', 'go', 'my', 'app', 'apps', 'online', 'www'].includes(l));
  for (const l of [...labels].reverse()) {
    const brand = BRANDS[l.replace(/-/g, '')];
    if (brand) return brand;
  }
  const last = labels[labels.length - 1];
  if (!last) return null;
  return last.charAt(0).toLocaleUpperCase('tr-TR') + last.slice(1);
}

/** Brand named in free text ("Trendyol", "Yurtiçi Kargo") — case-insensitive, word-bounded. */
export function brandInText(lower: string, names: readonly string[]): string | null {
  for (const n of names) {
    const key = lowercasePreservingIndices(n);
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[iı]/g, '[iı]')}(?![\\p{L}\\p{N}])`, 'u');
    if (re.test(lower)) return n;
  }
  return null;
}

export function buildContext(input: { subject: string; from: { name?: string | null; email: string }; bodyText?: string | null; now: string; timezone: string; locale?: Locale }): Ctx {
  const subject = normalizeText(input.subject ?? '').replace(/\n+/g, ' ').trim();
  const rawBody = input.bodyText ? stripQuotedHistory(normalizeText(input.bodyText)) : '';
  const body = rawBody.length > BODY_LIMIT ? rawBody.slice(0, BODY_LIMIT) : rawBody;
  const text = `${subject}\n${body}`;
  const lower = lowercasePreservingIndices(text);
  return {
    subject,
    body,
    text,
    lower,
    head: lower.slice(0, subject.length + 1 + HEAD_LEN),
    subjectLower: lower.slice(0, subject.length),
    from: { name: input.from.name ?? null, email: input.from.email },
    senderDomain: emailDomain(input.from.email),
    senderOrg: senderOrgName(input.from),
    now: input.now,
    timezone: input.timezone,
    locale: input.locale ?? 'tr',
    dates: extractDates({ text, now: input.now, timezone: input.timezone }),
    urls: findUrls(text),
    evidence: new EvidenceCollector(text),
  };
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

export interface AmountHit {
  amount: number;
  currency: string;
  start: number;
  end: number;
  text: string;
}

const NUM = '\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
const RE_AMOUNT = new RegExp(
  `(?<cur1>₺|\\$|€|£)\\s?(?<num1>${NUM})(?![\\d])|(?<![\\d.,])(?<num2>${NUM})\\s?(?<cur2>tl|₺|try|usd|eur|gbp|\\$|€|£|dolar|euro|avro|sterlin)(?![\\p{L}])`,
  'gu',
);
const CURRENCY: Record<string, string> = { tl: 'TRY', '₺': 'TRY', try: 'TRY', usd: 'USD', $: 'USD', dolar: 'USD', eur: 'EUR', '€': 'EUR', euro: 'EUR', avro: 'EUR', gbp: 'GBP', '£': 'GBP', sterlin: 'GBP' };

/** "1.842,00" → 1842, "1.842" → 1842, "229,99" → 229.99, "1,842.50" → 1842.5, "49.99" → 49.99, "1,842" → 1842. */
export function parseAmountNumber(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    normalized = s.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    normalized = after === 3 && (s.match(/,/g) ?? []).length >= 1 && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
    if ((s.match(/,/g) ?? []).length > 1) normalized = s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    normalized = after === 3 || (s.match(/\./g) ?? []).length > 1 ? s.replace(/\./g, '') : s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function findAmounts(lower: string): AmountHit[] {
  const out: AmountHit[] = [];
  RE_AMOUNT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_AMOUNT.exec(lower)) !== null) {
    const g = m.groups ?? {};
    const num = g.num1 ?? g.num2 ?? '';
    const cur = (g.cur1 ?? g.cur2 ?? '').toLowerCase();
    const currency = CURRENCY[cur];
    const amount = parseAmountNumber(num);
    if (!currency || amount === null) continue;
    // "%20'ye varan indirim" style percentages never carry a currency, but "1.000 TL'ye varan" does — keep it, callers decide.
    out.push({ amount, currency, start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

/** Prefer an amount whose preceding 48 chars carry a label ("toplam", "tutar", "ücret" …); otherwise the first one. */
export function pickAmount(lower: string, amounts: AmountHit[], labels: RegExp): AmountHit | null {
  if (amounts.length === 0) return null;
  for (const a of amounts) {
    const before = lower.slice(Math.max(0, a.start - 48), a.start);
    if (labels.test(before)) return a;
  }
  return amounts[0] ?? null;
}

export function formatAmount(amount: number, currency: string, locale: Locale): string {
  const fmt = new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const num = fmt.format(amount);
  if (currency === 'TRY') return `${num} TL`;
  return `${num} ${currency}`;
}

// ---------------------------------------------------------------------------
// Sentences & labels
// ---------------------------------------------------------------------------

/** Sentence-ish window [start, end) containing `pos` (bounded by ., !, ?, newline or 220 chars). */
export function sentenceAround(text: string, pos: number): { start: number; end: number } {
  let start = pos;
  while (start > 0 && !'.!?\n'.includes(text[start - 1] ?? '') && pos - start < 220) start -= 1;
  let end = pos;
  while (end < text.length && !'.!?\n'.includes(text[end] ?? '') && end - pos < 220) end += 1;
  return { start, end: Math.min(text.length, end + 1) };
}

/** First date whose surrounding sentence matches `labels`, else null. */
export function dateNear(ctx: Ctx, labels: RegExp, filter: (d: ExtractedDate) => boolean = () => true): ExtractedDate | null {
  for (const d of ctx.dates) {
    if (!filter(d)) continue;
    const s = sentenceAround(ctx.lower, d.start);
    if (labels.test(ctx.lower.slice(s.start, s.end))) return d;
  }
  return null;
}

/** Value after a "Label:" pair on the same line ("Adres: Bağdat Cad. 12" → "Bağdat Cad. 12"). */
export function labelledValue(text: string, label: RegExp): { value: string; start: number; end: number } | null {
  const re = new RegExp(`(?<![\\p{L}])(?:${label.source})\\s*[:：]\\s*(?<v>[^\\n]{2,120})`, 'iu');
  const m = re.exec(text);
  if (!m?.groups?.v) return null;
  const value = m.groups.v.replace(/\s+/g, ' ').replace(/[.;,]+$/u, '').trim();
  const start = m.index + m[0].length - m.groups.v.length;
  return { value, start, end: start + m.groups.v.length };
}

export function capitalizeFirst(s: string, locale: Locale = 'tr'): string {
  return s ? (s[0] ?? '').toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-US') + s.slice(1) : s;
}

export function slug(s: string): string {
  const fold: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (ch) => fold[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
