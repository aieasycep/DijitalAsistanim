import { initReactI18next } from 'react-i18next';
import { createI18n, DEFAULT_LOCALE, type FormatCtx } from '@da/i18n';
import type { Locale } from '@da/domain';
import { deviceLocale, deviceTimezone } from './datasource';

let initialized = false;

export function setupI18n(locale?: Locale): void {
  const i18n = createI18n(locale ?? deviceLocale() ?? DEFAULT_LOCALE);
  if (!initialized) {
    i18n.use(initReactI18next);
    void i18n.init({});
    initialized = true;
  }
}

export function changeLocale(locale: Locale): void {
  void createI18n(locale).changeLanguage(locale);
}

/** Formatting context for @da/i18n helpers (timezone from preferences when set, else device). */
export function formatCtx(overrides?: Partial<FormatCtx>): FormatCtx {
  return { locale: deviceLocale(), timezone: deviceTimezone(), ...overrides };
}
