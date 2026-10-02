/** Keys this adapter writes to the plain (non-secure) key-value storage; cleared on logout / account deletion. */
import type { SupabaseContext } from './client';

export const RECENT_SEARCHES_KEY = 'da.search.recent';

export const LOCAL_STORAGE_KEYS: readonly string[] = [RECENT_SEARCHES_KEY];

/**
 * Clears client-side caches held by this adapter and the persisted session material (session + PKCE verifier,
 * through the same chunked adapter supabase-js writes with) — `auth.signOut()` removes them too, but not when
 * the device was offline, so logout hygiene must not depend on it.
 */
export async function clearLocalState(
  ctx: Pick<SupabaseContext, 'storage' | 'sessionStorage' | 'sessionStorageKey'>,
): Promise<void> {
  await Promise.all([
    ...LOCAL_STORAGE_KEYS.map((key) => ctx.storage.removeItem(key)),
    ctx.sessionStorage.removeItem(ctx.sessionStorageKey),
    ctx.sessionStorage.removeItem(`${ctx.sessionStorageKey}-code-verifier`),
  ]);
}
