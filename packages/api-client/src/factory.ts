import type { DataSource } from './datasource';
import { resolveMode, type DataSourceConfig } from './config';
import { createDemoDataSource } from './demo';
import { createSupabaseDataSource } from './supabase';

export function createDataSource(config: DataSourceConfig): DataSource {
  const mode = resolveMode({
    requested: config.mode,
    isProduction: config.isProduction,
    hasSupabase: Boolean(config.supabaseUrl && config.supabaseAnonKey),
  });
  if (mode === 'demo') return createDemoDataSource(config);
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase yapılandırması eksik: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY gerekli.');
  }
  return createSupabaseDataSource({ ...config, supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey });
}
