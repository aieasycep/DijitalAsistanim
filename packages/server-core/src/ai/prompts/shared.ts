/** Building blocks shared by all prompt builders: anti-hallucination rules, system composer, formatting. */
import type { Locale } from '@da/domain';
import { normalizeText } from '../../util';

export const DEFAULT_PROMPT_TIMEZONE = 'Europe/Istanbul';

export interface PromptParticipant {
  name?: string | null;
  email?: string | null;
}

/** Fields every builder accepts. `now` anchors relative dates ("yarın", "next week"). */
export interface PromptBase {
  now: string;
  locale?: Locale;
  timezone?: string;
}

/** The phrase models must use when a fact is not confirmed by the sources. */
export const UNCERTAIN_PHRASE_TR = 'Kaynakta kesinleşmiyor.';
export const UNCERTAIN_PHRASE_EN = 'Not confirmed in the source.';

export function antiHallucinationBlock(locale: Locale = 'tr'): string {
  if (locale === 'en') {
    return [
      'Accuracy rules (no exceptions):',
      '- Use only the information in the sources you are given. Never infer or state an exact fact (date, time, amount, person, place, number) that is not explicitly in the sources.',
      '- Never invent a deadline, amount, attendee, booking, flight or shipment detail. If a value is not in the source leave it null; if it is, quote the exact source phrase as evidence.',
      `- Whenever you are unsure, say "${UNCERTAIN_PHRASE_EN}" (Turkish: "${UNCERTAIN_PHRASE_TR}") and add it to the uncertainties field when the schema has one.`,
      '- Return an honest confidence between 0 and 1 for every output; keep it low for anything you had to guess.',
      '- Output language: English.',
      '- Be concise and calm, in natural everyday language; no corporate or robotic tone. No markdown, emoji or headings inside narrative fields.',
      '- Return only the requested JSON structure; no explanations outside the JSON.',
    ].join('\n');
  }
  return [
    'Doğruluk kuralları (istisna yok):',
    '- Yalnızca sana verilen kaynaklardaki bilgiyi kullan. Kaynakta açıkça yazmayan kesin bir bilgiyi (tarih, saat, tutar, kişi, yer, numara) çıkarım yaparak yazma.',
    '- Son tarih, tutar, katılımcı, rezervasyon, uçuş veya kargo bilgisi uydurma. Bir değer kaynakta geçmiyorsa boş (null) bırak; geçiyorsa kanıt olarak kaynaktaki ifadeyi birebir aktar.',
    `- Emin olmadığın her noktada "${UNCERTAIN_PHRASE_TR}" de ve şemada varsa bunu uncertainties alanına ekle.`,
    '- Her çıktı için 0 ile 1 arasında dürüst bir confidence değeri ver; tahmin etmek zorunda kaldığın şeylerde düşük tut.',
    '- Çıktı dili: Türkçe.',
    '- Kısa, sakin ve doğal bir dil kullan; kurumsal ya da robotik ton yok. Anlatı alanlarında markdown, emoji ve başlık kullanma.',
    '- Yalnızca istenen JSON yapısını döndür; JSON dışında açıklama yazma.',
  ].join('\n');
}

/** True when a system prompt carries the mandatory anti-hallucination rules. */
export function containsAntiHallucinationBlock(system: string): boolean {
  return (
    system.includes(UNCERTAIN_PHRASE_TR) &&
    /confidence/.test(system) &&
    /(uydurma|invent)/i.test(system) &&
    /markdown/i.test(system) &&
    /(Çıktı dili|Output language)/.test(system)
  );
}

export interface ComposeSystemInput {
  role: string;
  rules: string[];
  locale: Locale;
  /** Extra free-form sections (already localized). */
  sections?: { title: string; body: string }[];
}

export function composeSystem(input: ComposeSystemInput): string {
  const rulesTitle = input.locale === 'en' ? 'Task rules:' : 'Görev kuralları:';
  const parts = [input.role.trim(), `${rulesTitle}\n${bullets(input.rules)}`];
  for (const section of input.sections ?? []) {
    if (section.body.trim()) parts.push(`${section.title}\n${section.body.trim()}`);
  }
  parts.push(antiHallucinationBlock(input.locale));
  return parts.join('\n\n');
}

export function bullets(items: readonly string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : 'tr-TR';
}

/** "5 Eylül 2026 Cumartesi 09:30" / "Saturday 5 September 2026 09:30" — deterministic given tz. */
export function formatPromptDateTime(
  iso: string,
  timezone: string = DEFAULT_PROMPT_TIMEZONE,
  locale: Locale = 'tr',
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

export function formatPromptDate(
  iso: string,
  timezone: string = DEFAULT_PROMPT_TIMEZONE,
  locale: Locale = 'tr',
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function formatPromptTime(iso: string, timezone: string = DEFAULT_PROMPT_TIMEZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

/** Header lines that let the model resolve relative dates without guessing. */
export function temporalContext(base: PromptBase): string {
  const locale = base.locale ?? 'tr';
  const timezone = base.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const stamp = formatPromptDateTime(base.now, timezone, locale);
  return locale === 'en'
    ? `Now: ${stamp} (${timezone}). ISO now: ${base.now}. Resolve relative dates from this moment and return timestamps as ISO 8601 UTC.`
    : `Şu an: ${stamp} (${timezone}). ISO: ${base.now}. Göreli tarihleri bu andan hesapla; zaman damgalarını ISO 8601 UTC olarak döndür.`;
}

export function personLabel(p: PromptParticipant | null | undefined): string {
  if (!p) return '?';
  const name = p.name?.trim();
  const email = p.email?.trim();
  if (name && email) return `${name} <${email}>`;
  return name || email || '?';
}

/** Single-line clip for subjects / titles (HTML stripped, newlines collapsed). */
export function clipInline(text: string | null | undefined, max = 160): string {
  const flat = normalizeText(text ?? '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Keep at most `max` items, appending a note so the model knows the list was cut. */
export function capList<T>(
  items: readonly T[],
  max: number,
  locale: Locale = 'tr',
): { items: T[]; note: string | null } {
  if (items.length <= max) return { items: [...items], note: null };
  const dropped = items.length - max;
  return {
    items: items.slice(0, max),
    note:
      locale === 'en'
        ? `(${dropped} more items were omitted for length.)`
        : `(${dropped} öğe daha uzunluk nedeniyle listeye alınmadı.)`,
  };
}

export function labelled(label: string, value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? `${label}: ${v}` : null;
}

export function joinLines(lines: (string | null | undefined)[]): string {
  return lines.filter((l): l is string => typeof l === 'string' && l.length > 0).join('\n');
}
