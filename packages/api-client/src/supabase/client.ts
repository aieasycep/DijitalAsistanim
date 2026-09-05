/**
 * Supabase client wiring shared by every API group: client creation (session material in secure storage),
 * a small typed facade over PostgREST so rows are typed by the `rows.ts` interfaces without generated
 * `Database` types, PostgREST/Auth/Storage → ClientApiError translation, and offline-aware read/write wrappers.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MemoryStorage, type DataSourceConfig, type KeyValueStorage } from '../config';
import { ClientApiError } from '../errors';
import { createFunctionsClient, type FunctionsClient } from './functions';
import { createChunkedSecureStorage } from './secureStorage';

export type SupabaseDataSourceConfig = DataSourceConfig & {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

// ---------------------------------------------------------------------------
// Typed PostgREST facade
// ---------------------------------------------------------------------------

export interface DbError {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
  count?: number | null;
}

/** The subset of the PostgREST builder chain this adapter uses; `Row` types the rows returned. */
export interface DbQuery<Row, Result = Row[]> extends PromiseLike<DbResult<Result>> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): DbQuery<Row, Row[]>;
  eq(column: string, value: unknown): DbQuery<Row, Result>;
  neq(column: string, value: unknown): DbQuery<Row, Result>;
  gt(column: string, value: unknown): DbQuery<Row, Result>;
  gte(column: string, value: unknown): DbQuery<Row, Result>;
  lt(column: string, value: unknown): DbQuery<Row, Result>;
  lte(column: string, value: unknown): DbQuery<Row, Result>;
  is(column: string, value: boolean | null): DbQuery<Row, Result>;
  in(column: string, values: readonly unknown[]): DbQuery<Row, Result>;
  ilike(column: string, pattern: string): DbQuery<Row, Result>;
  not(column: string, operator: string, value: unknown): DbQuery<Row, Result>;
  or(filters: string): DbQuery<Row, Result>;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): DbQuery<Row, Result>;
  limit(count: number): DbQuery<Row, Result>;
  single(): PromiseLike<DbResult<Row>>;
  maybeSingle(): PromiseLike<DbResult<Row | null>>;
}

export interface DbTable<Row> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): DbQuery<Row>;
  insert(values: Partial<Row> | Partial<Row>[]): DbQuery<Row>;
  upsert(
    values: Partial<Row> | Partial<Row>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): DbQuery<Row>;
  update(values: Partial<Row>): DbQuery<Row>;
  delete(): DbQuery<Row>;
}

/** Awaits a query and throws a ClientApiError for PostgREST errors. `maybeSingle` results keep their `null`. */
export async function exec<T>(query: PromiseLike<DbResult<T>>): Promise<T> {
  const result = await query;
  if (result.error) throw mapDbError(result.error);
  return result.data as T;
}

/** Awaits a `select(…, { count: 'exact', head: true })` query and returns the count. */
export async function count(query: PromiseLike<DbResult<unknown>>): Promise<number> {
  const result = await query;
  if (result.error) throw mapDbError(result.error);
  return result.count ?? 0;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface SupabaseContext {
  readonly client: SupabaseClient;
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly call: FunctionsClient['call'];
  /** Plain (non-secure) key-value storage for client-side conveniences (recent searches). */
  readonly storage: KeyValueStorage;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly locale: 'tr' | 'en';
  readonly timezone: string;
  table<Row>(name: string): DbTable<Row>;
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  /** Current user's id; throws `unauthorized` when there is no session. */
  requireUserId(): Promise<string>;
  getAccessToken(): Promise<string | null>;
}

export function createSupabaseContext(config: SupabaseDataSourceConfig): SupabaseContext {
  const fetchFn: typeof fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const sessionStorage = createChunkedSecureStorage(config.secureStorage ?? new MemoryStorage());
  const client: SupabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { fetch: fetchFn },
  });

  const getAccessToken = async (): Promise<string | null> => {
    const { data, error } = await client.auth.getSession();
    if (error) throw mapAuthError(error);
    return data.session?.access_token ?? null;
  };

  const functions = createFunctionsClient({
    baseUrl: config.functionsUrl ?? `${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1`,
    anonKey: config.supabaseAnonKey,
    fetch: fetchFn,
    getAccessToken,
  });

  return {
    client,
    supabaseUrl: config.supabaseUrl.replace(/\/+$/, ''),
    anonKey: config.supabaseAnonKey,
    call: functions.call,
    storage: config.storage ?? new MemoryStorage(),
    fetch: fetchFn,
    now: config.now ?? (() => new Date()),
    locale: config.locale ?? 'tr',
    timezone: config.timezone ?? 'Europe/Istanbul',
    table<Row>(name: string): DbTable<Row> {
      return client.from(name) as unknown as DbTable<Row>;
    },
    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      return exec(client.rpc(fn, args) as unknown as PromiseLike<DbResult<T>>);
    },
    async requireUserId(): Promise<string> {
      const { data, error } = await client.auth.getSession();
      if (error) throw mapAuthError(error);
      const userId = data.session?.user.id;
      if (!userId)
        throw new ClientApiError({
          code: 'unauthorized',
          message: 'Oturum bulunamadı. Lütfen tekrar giriş yap.',
        });
      return userId;
    },
    getAccessToken,
  };
}

// ---------------------------------------------------------------------------
// Offline-aware wrappers
// ---------------------------------------------------------------------------

const READ_RETRY_DELAY_MS = 250;

/** Reads are retried once when the network is unavailable; every error becomes a ClientApiError. */
export async function read<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    const err = toClientError(e);
    if (!err.isOffline) throw err;
  }
  await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAY_MS));
  try {
    return await op();
  } catch (e) {
    throw toClientError(e);
  }
}

/** Writes are never retried by the client (idempotency is handled server-side). */
export async function write<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    throw toClientError(e);
  }
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

export function toClientError(e: unknown): ClientApiError {
  if (e instanceof ClientApiError) return e;
  if (isAuthErrorLike(e)) return mapAuthError(e);
  if (isStorageErrorLike(e)) return mapStorageError(e);
  if (isDbErrorLike(e)) return mapDbError(e);
  if (isAbortError(e))
    return new ClientApiError({
      code: 'offline',
      message: 'Sunucu yanıt vermedi.',
      details: { reason: 'timeout' },
    });
  return ClientApiError.from(e);
}

function offline(): ClientApiError {
  return new ClientApiError({
    code: 'offline',
    message: 'Çevrimdışısın.',
    details: { reason: 'network' },
  });
}

export function mapDbError(e: DbError): ClientApiError {
  const code = e.code ?? '';
  const message = e.message || 'Bir şeyler ters gitti.';
  const details = { pgCode: code, hint: e.hint ?? null };
  if (!code && /fetch|network/i.test(message)) return offline();
  switch (code) {
    case 'PGRST116': // single() but zero/many rows
    case 'P0002': // no_data_found (resolve_insight)
      return new ClientApiError({ code: 'not_found', message: 'Kayıt bulunamadı.', details });
    case '42501': // insufficient_privilege (RLS / client guards)
      return new ClientApiError({ code: 'forbidden', message, details });
    case 'PGRST301': // JWT expired / invalid
    case 'PGRST302':
    case 'PGRST303':
      return new ClientApiError({
        code: 'unauthorized',
        message: 'Oturumun sona erdi. Lütfen tekrar giriş yap.',
        details,
      });
    case '23505': // unique_violation
    case 'P0001': // raise_exception (approval state machine)
      return new ClientApiError({ code: 'conflict', message, details });
    case '23503': // foreign_key_violation
    case '23514': // check_violation
    case '22P02': // invalid_text_representation
    case '22007':
    case '22008':
    case 'PGRST100':
    case 'PGRST102':
      return new ClientApiError({ code: 'validation', message, details });
    default:
      if (/jwt/i.test(message))
        return new ClientApiError({
          code: 'unauthorized',
          message: 'Oturumun sona erdi. Lütfen tekrar giriş yap.',
          details,
        });
      return new ClientApiError({ code: 'internal', message, details });
  }
}

interface AuthErrorLike {
  name: string;
  message: string;
  status?: number;
  code?: string;
}

const AUTH_UNAUTHORIZED_CODES: ReadonlySet<string> = new Set([
  'invalid_credentials',
  'otp_expired',
  'otp_disabled',
  'bad_jwt',
  'session_expired',
  'session_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'user_not_found',
  'bad_oauth_state',
  'bad_oauth_callback',
  'bad_code_verifier',
  'flow_state_expired',
  'flow_state_not_found',
  'identity_not_found',
]);

export function mapAuthError(e: AuthErrorLike): ClientApiError {
  const details = { authCode: e.code ?? null, authName: e.name };
  if (e.name === 'AuthRetryableFetchError' || /fetch|network/i.test(e.message)) return offline();
  if (e.name === 'AuthSessionMissingError')
    return new ClientApiError({ code: 'unauthorized', message: 'Oturum bulunamadı.', details });
  if (
    e.status === 429 ||
    e.code === 'over_request_rate_limit' ||
    e.code === 'over_email_send_rate_limit'
  ) {
    return new ClientApiError(
      {
        code: 'rate_limited',
        message: 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.',
        details,
      },
      e.status,
    );
  }
  if (
    e.status === 401 ||
    e.status === 403 ||
    (e.code !== undefined && AUTH_UNAUTHORIZED_CODES.has(e.code))
  ) {
    return new ClientApiError({ code: 'unauthorized', message: e.message, details }, e.status);
  }
  if (e.status === 400 || e.status === 422)
    return new ClientApiError({ code: 'validation', message: e.message, details }, e.status);
  if (e.status !== undefined && e.status >= 500)
    return new ClientApiError(
      { code: 'provider_unavailable', message: e.message, details },
      e.status,
    );
  return new ClientApiError({ code: 'internal', message: e.message, details }, e.status);
}

interface StorageErrorLike {
  message: string;
  status?: number;
  statusCode?: string;
  originalError?: unknown;
}

export function mapStorageError(e: StorageErrorLike): ClientApiError {
  const details = { storageStatus: e.status ?? null, storageCode: e.statusCode ?? null };
  if (e.originalError instanceof TypeError || /fetch|network/i.test(e.message)) return offline();
  switch (e.status) {
    case 401:
    case 403:
      return new ClientApiError(
        { code: 'forbidden', message: 'Bu dosyaya erişim yetkin yok.', details },
        e.status,
      );
    case 404:
      return new ClientApiError(
        { code: 'not_found', message: 'Dosya bulunamadı.', details },
        e.status,
      );
    case 409:
      return new ClientApiError(
        { code: 'conflict', message: 'Bu dosya zaten var.', details },
        e.status,
      );
    case 413:
    case 415:
      return new ClientApiError(
        { code: 'validation', message: 'Dosya boyutu ya da türü desteklenmiyor.', details },
        e.status,
      );
    default:
      return new ClientApiError({ code: 'internal', message: e.message, details }, e.status);
  }
}

function isAuthErrorLike(e: unknown): e is AuthErrorLike {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.message === 'string' &&
    (obj.__isAuthError === true || (typeof obj.name === 'string' && obj.name.startsWith('Auth')))
  );
}

function isStorageErrorLike(e: unknown): e is StorageErrorLike {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.message === 'string' &&
    (obj.__isStorageError === true ||
      (typeof obj.name === 'string' && obj.name.startsWith('Storage')))
  );
}

function isDbErrorLike(e: unknown): e is DbError {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.message === 'string' &&
    ('hint' in obj || 'details' in obj || obj.name === 'PostgrestError')
  );
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}
