/**
 * Single completion point for the Supabase PKCE return (`dijitalasistan://auth/callback?code=…`).
 *
 * On Android the very same URL reaches the app three ways at once: the auth-session polyfill resolves
 * `openAuthSessionAsync` (useNativeSignIn), expo-linking fires a `url` event (useDeepLinks) and expo-router
 * opens `app/auth/callback.tsx`. A PKCE code can be exchanged exactly once, so every caller goes through
 * `completeAuthCallback`: the first call for a code performs the exchange and the others share its promise.
 * A failed exchange is forgotten right away (a network error leaves the code unused, so a retry is valid);
 * a successful one is remembered for a while so a late caller never re-sends a consumed code.
 */
import type { AuthSession, DataSource } from '@da/api-client';
import { parseQueryString } from '@/services/deeplinks';

const CONSUMED_TTL_MS = 5 * 60 * 1000;

interface Entry {
  promise: Promise<AuthSession>;
  at: number;
}

/** Keyed by data source: a different client owns a different PKCE verifier, and tests create one per case. */
const perSource = new WeakMap<DataSource, Map<string, Entry>>();

function entriesFor(ds: DataSource, now: number): Map<string, Entry> {
  let map = perSource.get(ds);
  if (!map) {
    map = new Map();
    perSource.set(ds, map);
  }
  for (const [key, entry] of map) if (now - entry.at > CONSUMED_TTL_MS) map.delete(key);
  return map;
}

/** The authorization code carried by a callback URL (query or fragment), or `null`. */
export function authCallbackCode(url: string): string | null {
  const hash = url.indexOf('#');
  const fragment = hash === -1 ? '' : url.slice(hash + 1);
  const beforeHash = hash === -1 ? url : url.slice(0, hash);
  const q = beforeHash.indexOf('?');
  const query = q === -1 ? '' : beforeHash.slice(q + 1);
  const code = (parseQueryString(query).code ?? parseQueryString(fragment).code ?? '').trim();
  return code.length > 0 ? code : null;
}

/**
 * Exchanges the code in `url` for a session exactly once per data source; concurrent and later callers for the
 * same code get the same promise. URLs without a code (provider errors, malformed links) go straight to the
 * data source, which rejects them with the right error.
 */
export function completeAuthCallback(ds: DataSource, url: string): Promise<AuthSession> {
  const code = authCallbackCode(url);
  if (!code) return ds.auth.exchangeCodeForSession(url);
  const now = Date.now();
  const map = entriesFor(ds, now);
  const existing = map.get(code);
  if (existing) return existing.promise;
  const promise = ds.auth.exchangeCodeForSession(url);
  map.set(code, { promise, at: now });
  promise.catch(() => {
    if (map.get(code)?.promise === promise) map.delete(code);
  });
  return promise;
}
