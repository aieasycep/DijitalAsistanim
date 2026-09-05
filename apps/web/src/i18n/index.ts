import { en } from './en';
import { tr } from './tr';
import { type Dictionary, type Lang } from './types';

export type { Dictionary, Lang, LegalDoc, LegalSection, ScopeRow } from './types';

export const LANGS: readonly Lang[] = ['tr', 'en'];
export const DEFAULT_LANG: Lang = 'tr';
export const LANG_COOKIE = 'da_lang';

export function isLang(value: unknown): value is Lang {
  return value === 'tr' || value === 'en';
}

export function getDictionary(lang: Lang): Dictionary {
  return lang === 'en' ? en : tr;
}

export function htmlLang(lang: Lang): string {
  return lang === 'en' ? 'en' : 'tr';
}

export function ogLocale(lang: Lang): string {
  return lang === 'en' ? 'en_US' : 'tr_TR';
}
