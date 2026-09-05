/**
 * Turkish morphology helpers used to render natural labels ("17:00'ye kadar", "Eylül'de",
 * "Mehmet'e") and to lowercase text without shifting character indices.
 */

const BACK_VOWELS = new Set(['a', 'ı', 'o', 'u']);
const FRONT_VOWELS = new Set(['e', 'i', 'ö', 'ü']);
const VOICELESS = new Set(['ç', 'f', 'h', 'k', 'p', 's', 'ş', 't']);

export function isVowel(ch: string): boolean {
  return BACK_VOWELS.has(ch) || FRONT_VOWELS.has(ch);
}

export function lastVowel(word: string): string | null {
  const lower = word.toLocaleLowerCase('tr-TR');
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i] ?? '';
    if (isVowel(ch)) return ch;
  }
  return null;
}

function isBackHarmony(word: string): boolean {
  const v = lastVowel(word);
  return v === null ? true : BACK_VOWELS.has(v);
}

function endsWithVowel(word: string): boolean {
  const last = word.toLocaleLowerCase('tr-TR').slice(-1);
  return isVowel(last);
}

/** "Mehmet" → "Mehmet'e", "Ayşe" → "Ayşe'ye", "Burak" → "Burak'a". */
export function turkishDative(word: string): string {
  const clean = word.trim();
  if (!clean) return clean;
  const buffer = endsWithVowel(clean) ? 'y' : '';
  return `${clean}'${buffer}${isBackHarmony(clean) ? 'a' : 'e'}`;
}

/** "Eylül" → "Eylül'de", "Ocak" → "Ocak'ta", "Mayıs" → "Mayıs'ta". */
export function turkishLocative(word: string): string {
  const clean = word.trim();
  if (!clean) return clean;
  const last = clean.toLocaleLowerCase('tr-TR').slice(-1);
  const consonant = VOICELESS.has(last) ? 't' : 'd';
  return `${clean}'${consonant}${isBackHarmony(clean) ? 'a' : 'e'}`;
}

const UNIT_DATIVE: Record<number, string> = {
  0: 'a',
  1: 'e',
  2: 'ye',
  3: 'e',
  4: 'e',
  5: 'e',
  6: 'ya',
  7: 'ye',
  8: 'e',
  9: 'a',
};
const TENS_DATIVE: Record<number, string> = {
  10: 'a',
  20: 'ye',
  30: 'a',
  40: 'a',
  50: 'ye',
  60: 'a',
  70: 'e',
  80: 'e',
  90: 'a',
};

/** Dative suffix (without apostrophe) for a spoken number: 17 → "ye" (on yediye), 18 → "e", 30 → "a". */
export function turkishNumberDative(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const unit = abs % 10;
  if (unit !== 0) return UNIT_DATIVE[unit] ?? 'e';
  const tens = abs % 100;
  if (tens !== 0) return TENS_DATIVE[tens] ?? 'a';
  if (abs === 0) return 'a';
  return 'e';
}

const UNIT_LOCATIVE: Record<number, string> = {
  0: 'da',
  1: 'de',
  2: 'de',
  3: 'te',
  4: 'te',
  5: 'te',
  6: 'da',
  7: 'de',
  8: 'de',
  9: 'da',
};
const TENS_LOCATIVE: Record<number, string> = {
  10: 'da',
  20: 'de',
  30: 'da',
  40: 'ta',
  50: 'de',
  60: 'ta',
  70: 'te',
  80: 'de',
  90: 'da',
};

/** Locative suffix (without apostrophe) for a spoken number: 2027 → "de" (yedide), 2030 → "da", 15 → "te". */
export function turkishNumberLocative(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const unit = abs % 10;
  if (unit !== 0) return UNIT_LOCATIVE[unit] ?? 'de';
  const tens = abs % 100;
  if (tens !== 0) return TENS_LOCATIVE[tens] ?? 'da';
  if (abs === 0) return 'da';
  return 'de';
}

/** "17:00" → "17:00'ye", "17:30" → "17:30'a", "18:00" → "18:00'e". */
export function timeWithDative(hh: number, mm: number): string {
  const spoken = mm !== 0 ? mm : hh;
  return `${pad2(hh)}:${pad2(mm)}'${turkishNumberDative(spoken)}`;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Lowercase for matching while keeping UTF-16 indices aligned with the original text.
 * Dotted capital İ is mapped to plain "i" beforehand because the standard lowercase of "İ" is two code units.
 * Typographic apostrophes are unified so "Cuma’ya" and "Cuma'ya" match the same patterns.
 */
export function lowercasePreservingIndices(text: string): string {
  const prepared = text.replace(/İ/g, 'i').replace(/[’‘ʼ`´]/g, "'");
  const lower = prepared.toLowerCase();
  if (lower.length === prepared.length) return lower;
  let out = '';
  for (const ch of prepared) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

/** Regex fragment where dotted/dotless i are interchangeable (handles "SALI" → "sali"). */
export function flexI(fragment: string): string {
  return fragment.replace(/[iı]/g, '[iı]');
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
