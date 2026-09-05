/** Keys this adapter writes to the plain (non-secure) key-value storage; cleared on logout / account deletion. */
import type { SupabaseContext } from './client';

export const RECENT_SEARCHES_KEY = 'da.search.recent';

export const LOCAL_STORAGE_KEYS: readonly string[] = [RECENT_SEARCHES_KEY];

/** Clears client-side caches held by this adapter. Session material is handled by `auth.signOut()`. */
export async function clearLocalState(ctx: Pick<SupabaseContext, 'storage'>): Promise<void> {
  await Promise.all(LOCAL_STORAGE_KEYS.map((key) => ctx.storage.removeItem(key)));
}
