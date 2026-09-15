import { useMemo } from 'react';
import type { DataSource } from '@da/api-client';
import { getDataSource } from '@/lib/datasource';

/** Access the app's DataSource (demo or Supabase). Stable across renders. */
export function useDataSource(): DataSource {
  return useMemo(() => getDataSource(), []);
}
