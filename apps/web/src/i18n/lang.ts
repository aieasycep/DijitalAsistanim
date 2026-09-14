import { type Lang } from './types';

/**
 * Language primitives without the dictionaries, so the proxy and route handlers can import them
 * without bundling ~100 KB of copy.
 */
export const LANGS: readonly Lang[] = ['tr', 'en'];
export const DEFAULT_LANG: Lang = 'tr';
/** Persisted choice, written only by the `/lang` toggle. */
export const LANG_COOKIE = 'da_lang';
/** Per-request language derived from `?lang=` by `src/proxy.ts`; read first by `getLang()`. */
export const LANG_HEADER = 'x-da-lang';

export function isLang(value: unknown): value is Lang {
  return value === 'tr' || value === 'en';
}

export function htmlLang(lang: Lang): string {
  return lang === 'en' ? 'en' : 'tr';
}

export function ogLocale(lang: Lang): string {
  return lang === 'en' ? 'en_US' : 'tr_TR';
}
