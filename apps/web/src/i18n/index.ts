import { REFERRAL_BONUS_DAYS } from '@da/domain';
import { publicEnv } from '@/lib/env';
import { en } from './en';
import { resolveDictionary } from './resolve';
import { tr } from './tr';
import { type Dictionary, type Lang } from './types';

export type { Dictionary, FaqItem, Lang, LegalDoc, LegalSection, ScopeRow } from './types';
export { DEFAULT_LANG, LANG_COOKIE, LANG_HEADER, LANGS, htmlLang, isLang, ogLocale } from './lang';

const vars = { trialDays: publicEnv.trialDays, referralDays: REFERRAL_BONUS_DAYS };

/** Resolved once per process: trial copy applied (or removed) and placeholders filled. */
const DICTIONARIES: Record<Lang, Dictionary> = {
  tr: resolveDictionary(tr, vars),
  en: resolveDictionary(en, vars),
};

export function getDictionary(lang: Lang): Dictionary {
  return DICTIONARIES[lang];
}
