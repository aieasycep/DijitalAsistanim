/**
 * Supabase clients for Edge Functions.
 *  - userClient(req): acts as the calling user (RLS enforced) — for reads/writes on the user's behalf.
 *  - adminClient(): service role (bypasses RLS) — ONLY for server-side pipelines, credentials, cron.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@da/server-core/errors';
import { getEnv } from './env.ts';

// deno-lint-ignore no-explicit-any
export type Db = SupabaseClient<any, 'public', any>;

let admin: Db | null = null;

export function adminClient(): Db {
  if (admin) return admin;
  const env = getEnv();
  admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-da-role': 'service' } },
  });
  return admin;
}

export function userClient(req: Request): Db {
  const env = getEnv();
  const auth = req.headers.get('Authorization') ?? '';
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: auth } },
  });
}

export interface AuthedUser {
  id: string;
  email?: string;
}

/** Resolve the calling user from the JWT; throws unauthorized when missing/invalid. */
export async function requireUser(req: Request): Promise<{ user: AuthedUser; db: Db }> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    throw new AppError('unauthorized', 'Oturum gerekli.');
  }
  const db = userClient(req);
  const { data, error } = await db.auth.getUser(auth.slice(7));
  if (error || !data.user) {
    throw new AppError('unauthorized', 'Oturum geçersiz veya süresi dolmuş.');
  }
  return { user: { id: data.user.id, email: data.user.email ?? undefined }, db };
}

/** Verify the shared secret used by pg_cron and function-to-function calls. */
export function requireInternal(req: Request): void {
  const env = getEnv();
  const provided = req.headers.get('x-internal-secret') ?? '';
  if (!env.internalSecret || provided.length === 0 || !timingSafeEqual(provided, env.internalSecret)) {
    throw new AppError('forbidden', 'İç çağrı doğrulanamadı.');
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** Throw a typed error for a PostgREST error. */
export function dbError(error: { message: string; code?: string } | null, context: string): never {
  const code = error?.code ?? '';
  if (code === 'PGRST116' || code === '42P01') throw new AppError('not_found', `${context}: bulunamadı`);
  if (code === '42501') throw new AppError('forbidden', `${context}: izin yok`);
  if (code === '23505') throw new AppError('conflict', `${context}: zaten var`);
  throw new AppError('internal', `${context}: ${error?.message ?? 'bilinmeyen hata'}`);
}

/** Load profile + preferences + notification prefs for a user (admin client). */
export async function loadUserContext(db: Db, userId: string) {
  const [{ data: profile, error: pErr }, { data: prefs, error: prefErr }, { data: notif, error: nErr }] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).single(),
    db.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    db.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  if (pErr || !profile) dbError(pErr, 'profil');
  if (prefErr) dbError(prefErr, 'tercihler');
  if (nErr) dbError(nErr, 'bildirim tercihleri');
  return { profile, prefs, notif };
}
