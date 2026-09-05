/** Turkish-aware text normalisation for keyword matching and search. */

/** Lower-cases with Turkish dotted/dotless I rules (İ → i, I → ı). */
export function trLower(input: string): string {
  return input.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

/** Folds Turkish diacritics so "ucak" matches "uçak" and "Istanbul" matches "İstanbul". */
export function fold(input: string): string {
  return trLower(input)
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}

export function tokenize(input: string): string[] {
  return fold(input)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

export function includesAny(haystack: string, needles: readonly string[]): boolean {
  const folded = fold(haystack);
  return needles.some((n) => folded.includes(fold(n)));
}

export function includesAll(haystack: string, needles: readonly string[]): boolean {
  const folded = fold(haystack);
  return needles.every((n) => folded.includes(fold(n)));
}

export function truncate(input: string, max: number): string {
  const clean = input.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function capitalizeTr(input: string): string {
  if (!input) return input;
  const first = input[0] ?? '';
  const upper = first === 'i' ? 'İ' : first === 'ı' ? 'I' : first.toUpperCase();
  return upper + input.slice(1);
}
