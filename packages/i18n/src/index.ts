import i18next, { type i18n as I18nInstance, type TFunction } from 'i18next';
import type { Locale } from '@da/domain';
import tr from './locales/tr.json';
import en from './locales/en.json';

export const resources = {
  tr: { translation: tr },
  en: { translation: en },
} as const;

export const DEFAULT_LOCALE: Locale = 'tr';
export const SUPPORTED_LOCALES: Locale[] = ['tr', 'en'];

export type TranslationKeys = typeof tr;

let instance: I18nInstance | null = null;

/** Create (or return) the shared i18next instance. Safe to call multiple times. */
export function createI18n(locale: Locale = DEFAULT_LOCALE): I18nInstance {
  if (instance) {
    if (instance.language !== locale) void instance.changeLanguage(locale);
    return instance;
  }
  const inst = i18next.createInstance();
  void inst.init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
    returnNull: false,
    initImmediate: false,
  });
  instance = inst;
  return inst;
}

export function getI18n(): I18nInstance {
  return instance ?? createI18n();
}

export function t(key: string, options?: Record<string, unknown>): string {
  return (getI18n().t as TFunction)(key, options) as string;
}

export function resolveLocale(deviceTag: string | undefined | null): Locale {
  const lang = (deviceTag ?? '').toLowerCase().split(/[-_]/)[0];
  return lang === 'en' ? 'en' : 'tr';
}

export * from './format';
