import { createDataSource, type DataSource } from '@da/api-client';
import { getLocales, getCalendars } from 'expo-localization';
import { resolveLocale } from '@da/i18n';
import { env, isDemoMode } from './env';
import { cacheStorage, secureStore } from './storage';

let instance: DataSource | null = null;

export function deviceTimezone(): string {
  return getCalendars()[0]?.timeZone ?? 'Europe/Istanbul';
}

export function deviceLocale(): 'tr' | 'en' {
  return resolveLocale(getLocales()[0]?.languageTag);
}

/** Singleton data source — demo (dev) or Supabase (prod). */
export function getDataSource(): DataSource {
  if (instance) return instance;
  instance = createDataSource({
    mode: isDemoMode ? 'demo' : 'supabase',
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey,
    appScheme: env.appScheme,
    webUrl: env.webUrl,
    demoUserName: env.demoUserName,
    timezone: deviceTimezone(),
    locale: deviceLocale(),
    storage: cacheStorage,
    secureStorage: secureStore,
    isProduction: env.isProduction,
  });
  return instance;
}

export function resetDataSource(): void {
  instance = null;
}
