/**
 * Local storage layers:
 *  - secureStore: session secrets (Supabase auth) via expo-secure-store (Keychain / Keystore).
 *  - cache: encrypted MMKV for cached summaries, preferences and the offline snapshot of Today/briefing/plan.
 *    The MMKV encryption key itself lives in SecureStore. Raw email bodies are never written here.
 *  - Plain AsyncStorage is NOT used for anything sensitive.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { MMKV } from 'react-native-mmkv';
import type { KeyValueStorage } from '@da/api-client';

const MMKV_KEY_NAME = 'da.mmkv.key.v1';
let cacheInstance: MMKV | null = null;

function randomKey(): string {
  const bytes = Crypto.getRandomBytes(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lazily create the encrypted MMKV instance (key persisted in the secure enclave-backed store). */
export function getCache(): MMKV {
  if (cacheInstance) return cacheInstance;
  let key: string | null = null;
  try {
    key = SecureStore.getItem(MMKV_KEY_NAME);
  } catch {
    key = null;
  }
  if (!key) {
    key = randomKey();
    try {
      SecureStore.setItem(MMKV_KEY_NAME, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    } catch {
      // If the keychain is unavailable (rare), fall back to an ephemeral key: cache becomes session-only.
    }
  }
  cacheInstance = new MMKV({ id: 'da-cache', encryptionKey: key.slice(0, 16) });
  return cacheInstance;
}

export const secureStore: KeyValueStorage = {
  async getItem(key) {
    try {
      return (await SecureStore.getItemAsync(key)) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  },
  async removeItem(key) {
    await SecureStore.deleteItemAsync(key);
  },
};

export const cacheStorage: KeyValueStorage = {
  async getItem(key) {
    return getCache().getString(key) ?? null;
  },
  async setItem(key, value) {
    getCache().set(key, value);
  },
  async removeItem(key) {
    getCache().delete(key);
  },
};

/** Typed JSON helpers over the encrypted cache. */
export function readCache<T>(key: string): T | null {
  const raw = getCache().getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
export function writeCache<T>(key: string, value: T): void {
  getCache().set(key, JSON.stringify(value));
}
export function removeCache(key: string): void {
  getCache().delete(key);
}

/** Wipe everything local: cache, session secrets, demo state. Used on logout and account deletion. */
export async function wipeLocalData(): Promise<void> {
  try {
    getCache().clearAll();
  } catch {
    // ignore
  }
  const keys = ['da.mmkv.key.v1', 'sb-session', 'da.demo.session'];
  for (const k of keys) {
    try {
      await SecureStore.deleteItemAsync(k);
    } catch {
      // ignore
    }
  }
  cacheInstance = null;
}

export const CacheKeys = {
  todaySnapshot: 'cache.today.v1',
  briefingSnapshot: (kind: string) => `cache.briefing.${kind}.v1`,
  planSnapshot: (date: string) => `cache.plan.${date}.v1`,
  insightsSnapshot: 'cache.insights.v1',
  preferences: 'cache.preferences.v1',
  entitlement: 'cache.entitlement.v1',
  onboardingStep: 'onboarding.step.v1',
  recentQueries: 'search.recent.v1',
  widgetSnapshot: 'widget.snapshot.v1',
  pendingActions: 'offline.pending.v1',
  lastAnalyzedAt: 'cache.lastAnalyzedAt.v1',
  eveningClosedDate: 'evening.closed.v1',
} as const;
