/** Runtime configuration for the data layer — assembled by the app from EXPO_PUBLIC_* / NEXT_PUBLIC_* variables. */
export interface DataSourceConfig {
  mode: 'demo' | 'supabase';
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** Base URL of Edge Functions, defaults to `${supabaseUrl}/functions/v1` */
  functionsUrl?: string;
  /** App deep-link base used for OAuth redirects, e.g. dijitalasistan://oauth */
  appScheme: string;
  webUrl: string;
  /** Demo user name shown in greetings (demo mode only). */
  demoUserName?: string;
  /** Injected clock for deterministic demo/tests. */
  now?: () => Date;
  timezone?: string;
  locale?: 'tr' | 'en';
  /** Optional async key-value storage for client-side persistence (recent searches, demo state). */
  storage?: KeyValueStorage;
  /** Secure storage for session material. */
  secureStorage?: KeyValueStorage;
  fetch?: typeof fetch;
  isProduction: boolean;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

/**
 * Demo mode is a development affordance. It is refused in production builds regardless of env so a
 * mis-set EXPO_PUBLIC_DATA_MODE can never ship fixtures to real users.
 */
export function resolveMode(input: {
  requested?: string | null;
  isProduction: boolean;
  hasSupabase: boolean;
}): 'demo' | 'supabase' {
  if (input.isProduction) return 'supabase';
  if (input.requested === 'supabase') return 'supabase';
  if (input.requested === 'demo') return 'demo';
  return input.hasSupabase ? 'supabase' : 'demo';
}
