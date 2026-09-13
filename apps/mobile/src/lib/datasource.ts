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

/**
 * Demo/E2E clock: when `EXPO_PUBLIC_DEMO_NOW` is set (demo mode only) the app boots at that instant and
 * time keeps moving from there, so time-of-day copy and seeded meetings are stable across test runs.
 */
function demoClock(): (() => Date) | undefined {
  if (!isDemoMode || !env.demoNow) return undefined;
  const anchor = Date.parse(env.demoNow);
  if (!Number.isFinite(anchor)) return undefined;
  const bootedAt = Date.now();
  return () => new Date(anchor + (Date.now() - bootedAt));
}

/** Singleton data source — demo (dev) or Supabase (prod). */
export function getDataSource(): DataSource {
  if (instance) return instance;
  const now = demoClock();
  instance = createDataSource({
    mode: isDemoMode ? 'demo' : 'supabase',
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey,
    appScheme: env.appScheme,
    webUrl: env.webUrl,
    demoUserName: env.demoUserName,
    ...(now ? { now } : {}),
    timezone: isDemoMode && env.demoTimezone ? env.demoTimezone : deviceTimezone(),
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
