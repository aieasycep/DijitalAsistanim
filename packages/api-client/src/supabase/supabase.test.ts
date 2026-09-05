import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, type KeyValueStorage } from '../config';
import { ClientApiError } from '../errors';
import { createSupabaseDataSource } from './index';
import {
  toApprovalAction,
  toBriefing,
  toConnectedAccount,
  toEmailThread,
  toInsight,
  userPreferencesPatchToRow,
} from './mappers';
import type {
  ApprovalActionRow,
  BriefingRow,
  ConnectedAccountRow,
  ContactRow,
  EmailThreadRow,
  InsightRow,
} from './rows';
import { createChunkedSecureStorage, utf8ByteLength } from './secureStorage';
import type { SupabaseDataSourceConfig } from './client';
import { buildQuery, parseQueryParams } from './url';

// ---------------------------------------------------------------------------
// Fake supabase-js client (hoisted so vi.mock can reference it)
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  interface Result {
    data: unknown;
    error: unknown;
    count?: number | null;
  }
  interface Call {
    table: string;
    op: string;
    args: unknown[];
  }
  interface FakeChannel {
    on(type: string, filter: unknown, cb: unknown): FakeChannel;
    subscribe(cb?: unknown): FakeChannel;
  }
  const defaultSession = (): Record<string, unknown> => ({
    access_token: 'tok',
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: 1_800_000_000,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      email: 'yunus@example.com',
      app_metadata: { provider: 'google' },
      user_metadata: { full_name: 'Yunus Emre' },
    },
  });
  const state = {
    session: defaultSession() as Record<string, unknown> | null,
    results: new Map<string, Result[]>(),
    calls: [] as Call[],
    rpcCalls: [] as { fn: string; args: unknown }[],
    rpcResults: [] as Result[],
    channels: [] as { name: string; filters: unknown[]; subscribed: boolean }[],
    removedChannels: 0,
    uploads: [] as { path: string; body: unknown; options: unknown }[],
    uploadResult: { data: { path: 'x' }, error: null } as Result,
    authCalls: [] as { method: string; args: unknown[] }[],
    reset() {
      this.session = defaultSession();
      this.results.clear();
      this.calls.length = 0;
      this.rpcCalls.length = 0;
      this.rpcResults.length = 0;
      this.channels.length = 0;
      this.removedChannels = 0;
      this.uploads.length = 0;
      this.uploadResult = { data: { path: 'x' }, error: null };
      this.authCalls.length = 0;
    },
    queue(table: string, ...results: Result[]) {
      const list = this.results.get(table) ?? [];
      list.push(...results);
      this.results.set(table, list);
    },
    ops(table: string, op: string): Call[] {
      return this.calls.filter((c) => c.table === table && c.op === op);
    },
  };
  const OPS = [
    'select',
    'insert',
    'upsert',
    'update',
    'delete',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'is',
    'in',
    'ilike',
    'not',
    'or',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ];
  function builder(table: string): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    for (const op of OPS) {
      b[op] = (...args: unknown[]) => {
        state.calls.push({ table, op, args });
        return b;
      };
    }
    b.then = (onFulfilled?: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) => {
      const queued = state.results.get(table)?.shift();
      return Promise.resolve(queued ?? { data: [], error: null, count: 0 }).then(
        onFulfilled,
        onRejected,
      );
    };
    return b;
  }
  const record =
    (method: string) =>
    (...args: unknown[]) =>
      state.authCalls.push({ method, args });
  const client = {
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      onAuthStateChange: (cb: unknown) => {
        record('onAuthStateChange')(cb);
        return { data: { subscription: { unsubscribe: () => record('unsubscribe')() } } };
      },
      signInWithIdToken: async (...args: unknown[]) => {
        record('signInWithIdToken')(...args);
        return { data: { session: state.session, user: state.session?.user }, error: null };
      },
      signInWithOAuth: async (...args: unknown[]) => {
        record('signInWithOAuth')(...args);
        return {
          data: {
            provider: 'google',
            url: 'https://proj.supabase.co/auth/v1/authorize?provider=google',
          },
          error: null,
        };
      },
      exchangeCodeForSession: async (...args: unknown[]) => {
        record('exchangeCodeForSession')(...args);
        return { data: { session: state.session, user: state.session?.user }, error: null };
      },
      signInWithOtp: async (...args: unknown[]) => {
        record('signInWithOtp')(...args);
        return { data: { user: null, session: null }, error: null };
      },
      verifyOtp: async (...args: unknown[]) => {
        record('verifyOtp')(...args);
        return { data: { session: state.session, user: state.session?.user }, error: null };
      },
      signOut: async (...args: unknown[]) => {
        record('signOut')(...args);
        return { error: null };
      },
      updateUser: async (...args: unknown[]) => {
        record('updateUser')(...args);
        return { data: { user: state.session?.user }, error: null };
      },
    },
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      const result = state.rpcResults.shift() ?? { data: null, error: null };
      return {
        then: (f?: (v: Result) => unknown, r?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(f, r),
      };
    },
    channel: (name: string): FakeChannel => {
      const entry = { name, filters: [] as unknown[], subscribed: false };
      state.channels.push(entry);
      const ch: FakeChannel = {
        on(_type, filter) {
          entry.filters.push(filter);
          return ch;
        },
        subscribe() {
          entry.subscribed = true;
          return ch;
        },
      };
      return ch;
    },
    removeChannel: async () => {
      state.removedChannels += 1;
      return 'ok';
    },
    storage: {
      from: () => ({
        upload: async (path: string, body: unknown, options: unknown) => {
          state.uploads.push({ path, body, options });
          return state.uploadResult;
        },
      }),
    },
  };
  return { state, client };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => h.client) }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'https://proj.supabase.co';
const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function ok<T>(data: T, status = 200): Response {
  return json({ ok: true, data }, status);
}

function fail(code: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error: { code, message: `err:${code}`, ...extra } }, status);
}

function requestOf(index = 0): { url: string; init: RequestInit; headers: Record<string, string> } {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`fetch call #${index} missing`);
  const [input, init] = call;
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return { url, init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
}

function createDs(overrides: Partial<SupabaseDataSourceConfig> = {}) {
  return createSupabaseDataSource({
    mode: 'supabase',
    supabaseUrl: BASE,
    supabaseAnonKey: 'anon-key',
    appScheme: 'dijitalasistan',
    webUrl: 'https://dijitalasistan.app',
    isProduction: false,
    fetch: fetchMock as unknown as typeof fetch,
    storage: new MemoryStorage(),
    secureStorage: new MemoryStorage(),
    now: () => new Date('2026-09-05T09:00:00.000Z'),
    ...overrides,
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const insightRow: InsightRow = {
  id: 'ins-1',
  user_id: 'user-1',
  kind: 'deadline',
  badge: 'deadline',
  title: 'Teklifi gönder',
  subtitle: 'Mehmet Yılmaz',
  reason: 'Son tarih yarın',
  importance: 'high',
  priority_score: 87,
  priority_reasons: ['deadline_soon', 'vip'],
  time_label: 'Yarın 12:00',
  due_at: '2026-09-06T12:00:00+00:00',
  status: 'active',
  snoozed_until: null,
  source: {
    type: 'gmail',
    id: 'msg-1',
    label: 'Gmail',
    person: 'Mehmet Yılmaz',
    timestamp: '2026-09-05T05:42:00Z',
  },
  actions: [{ id: 'a1', label: 'Yanıtla', kind: 'reply', primary: true }],
  entity_type: 'email_thread',
  entity_id: 'thr-1',
  tags: ['important', 'mail'],
  for_date: '2026-09-05',
  confidence: 0.91,
  is_low_confidence: false,
  dedupe_key: 'deadline:thr-1',
  completed_at: null,
  dismissed_at: null,
  deleted_at: null,
  created_at: '2026-09-05T05:43:00.123456+00:00',
  updated_at: '2026-09-05T05:43:00.123456+00:00',
};

const threadRow: EmailThreadRow = {
  id: 'thr-1',
  user_id: 'user-1',
  account_id: 'acc-1',
  external_thread_id: 'gm-thread-1',
  subject: 'Teklif',
  snippet: 'Merhaba, teklif ekte…',
  participants: [{ name: 'Mehmet Yılmaz', email: 'mehmet@example.com' }],
  last_message_at: '2026-09-05T05:42:00+00:00',
  message_count: 3,
  last_from_user: false,
  is_read: false,
  labels: ['INBOX'],
  importance: 'high',
  category: 'action_required',
  analysis: {
    summary: 'Teklif bekleniyor',
    importance: 'high',
    category: 'action_required',
    requiresUserAction: true,
    keyPoints: ['Yarın'],
    people: [],
    commitments: [],
    suggestedActions: [],
    confidence: 0.8,
    producedBy: 'ai_small',
  },
  priority_score: 87,
  priority_reasons: ['vip'],
  triage: 'ai',
  fingerprint: 'fp-1',
  user_dismissed: false,
  user_marked_done: false,
  analyzed_at: '2026-09-05T05:43:00+00:00',
  deleted_at: null,
  created_at: '2026-09-05T05:43:00+00:00',
  updated_at: '2026-09-05T05:43:00+00:00',
};

const approvalRow: ApprovalActionRow = {
  id: 'apr-1',
  user_id: 'user-1',
  type: 'email_send',
  status: 'pending',
  what: 'Mehmet’e yanıt gönder',
  why: 'Teklif bekleniyor',
  change_summary: ['Kime: mehmet@example.com', 'Konu: Re: Teklif'],
  source: null,
  payload: {
    accountId: 'acc-1',
    to: [{ email: 'mehmet@example.com' }],
    subject: 'Re: Teklif',
    bodyText: 'Merhaba',
  },
  original_payload: {
    accountId: 'acc-1',
    to: [{ email: 'mehmet@example.com' }],
    subject: 'Re: Teklif',
    bodyText: 'Merhaba',
  },
  edited_by_user: false,
  idempotency_key: 'idem-1',
  expires_at: '2026-09-08T09:00:00+00:00',
  approved_at: null,
  rejected_at: null,
  executed_at: null,
  execution_result: null,
  failure_reason: null,
  attempt_count: 0,
  requested_by: 'email_detail',
  insight_id: 'ins-1',
  required_scope: null,
  created_at: '2026-09-05T09:00:00+00:00',
  updated_at: '2026-09-05T09:00:00+00:00',
};

beforeEach(() => {
  h.state.reset();
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Edge Function client
// ---------------------------------------------------------------------------

describe('functions client', () => {
  it('GET functions serialise the input as a query string and attach the user token + anon key', async () => {
    fetchMock.mockResolvedValueOnce(ok({ greeting: 'Günaydın' }));
    const ds = createDs();
    const result = await ds.feed.getToday({ date: '2026-09-05' });
    expect(result).toEqual({ greeting: 'Günaydın' });
    const { url, init, headers } = requestOf();
    expect(url).toBe(`${BASE}/functions/v1/today?date=2026-09-05`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers.apikey).toBe('anon-key');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('POST functions send a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ draft: 'Merhaba', subject: 'Re: Teklif', to: [], tone: 'short', basedOn: [] }),
    );
    const ds = createDs();
    await ds.email.draftReply({ threadId: 'thr-1', tone: 'short' });
    const { url, init, headers } = requestOf();
    expect(url).toBe(`${BASE}/functions/v1/email-draft-reply`);
    expect(init.method).toBe('POST');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ threadId: 'thr-1', tone: 'short' });
  });

  it('honours a custom functionsUrl', async () => {
    fetchMock.mockResolvedValueOnce(ok({ totalToday: 0, needsAttention: 0, categories: {} }));
    const ds = createDs({ functionsUrl: 'https://fn.example.com/' });
    await ds.feed.getMailIntelligence();
    expect(requestOf().url).toBe('https://fn.example.com/mail-intelligence');
  });

  it('preserves the server error code, status and retryAfterSec from the envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      fail('quota_exceeded', 402, { retryAfterSec: 60, details: { limit: 10 } }),
    );
    const ds = createDs();
    const err = await ds.assistant
      .ask({ message: 'Bugün ne var?', inputMode: 'text' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClientApiError);
    const apiErr = err as ClientApiError;
    expect(apiErr.code).toBe('quota_exceeded');
    expect(apiErr.status).toBe(402);
    expect(apiErr.retryAfterSec).toBe(60);
    expect(apiErr.details).toEqual({ limit: 10 });
    expect(apiErr.isQuota).toBe(true);
  });

  it('normalises unknown envelope codes to internal', async () => {
    fetchMock.mockResolvedValueOnce(fail('something_new', 500));
    const ds = createDs();
    await expect(ds.billing.getReferralStatus()).rejects.toMatchObject({
      code: 'internal',
      status: 500,
    });
  });

  it('maps a bare HTTP 401 to unauthorized', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Invalid JWT' }, 401));
    const ds = createDs();
    await expect(ds.billing.getEntitlement()).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
    });
  });

  it('maps a network failure to offline and retries GET reads once', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(ok({ items: [], nextCursor: null }));
    const ds = createDs();
    await expect(ds.feed.getFlow({ filter: 'all' })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries writes', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const ds = createDs();
    const err = await ds.accounts.disconnect('acc-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClientApiError);
    expect((err as ClientApiError).isOffline).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts AI calls after 60 s and reports offline (timeout)', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const ds = createDs();
    const pending = ds.assistant.ask({ message: 'Uzun soru', inputMode: 'text' });
    const settled = pending.catch((e: unknown) => e);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    const err = await settled;
    expect(err).toBeInstanceOf(ClientApiError);
    expect((err as ClientApiError).code).toBe('offline');
    expect((err as ClientApiError).details).toEqual({ reason: 'timeout' });
  });

  it('refuses to call a function without a session (no network round-trip)', async () => {
    h.state.session = null;
    const ds = createDs();
    await expect(ds.feed.getToday()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends transcriptions as multipart and returns null when the server defers to the device', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('file://')) return new Response('audio-bytes');
      return ok({ provider: 'device' });
    });
    const ds = createDs();
    await expect(
      ds.assistant.transcribe({
        uri: 'file:///tmp/voice.m4a',
        mimeType: 'audio/m4a',
        durationSec: 4,
      }),
    ).resolves.toBeNull();
    const upload = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('assistant-transcribe'),
    );
    expect(upload).toBeDefined();
    const init = upload?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    const form = init?.body as FormData;
    expect(form.get('durationSec')).toBe('4');
    expect(form.get('file')).toBeInstanceOf(Blob);

    fetchMock.mockImplementation(async (input) =>
      String(input).startsWith('file://')
        ? new Response('audio-bytes')
        : ok({ provider: 'server_stt', text: 'merhaba' }),
    );
    await expect(
      ds.assistant.transcribe({
        uri: 'file:///tmp/voice.m4a',
        mimeType: 'audio/m4a',
        durationSec: 4,
      }),
    ).resolves.toEqual({ text: 'merhaba' });
  });

  it('turns briefing not_found into null', async () => {
    fetchMock.mockResolvedValueOnce(fail('not_found', 404));
    const ds = createDs();
    await expect(
      ds.briefings.getBriefing({ kind: 'morning', date: '2026-09-05' }),
    ).resolves.toBeNull();
    expect(requestOf().url).toBe(`${BASE}/functions/v1/briefing?kind=morning&date=2026-09-05`);
  });
});

// ---------------------------------------------------------------------------
// Table access through the typed facade
// ---------------------------------------------------------------------------

describe('table access', () => {
  it('reads an insight scoped to the user and maps the row', async () => {
    h.state.queue('insights', { data: insightRow, error: null });
    const ds = createDs();
    const insight = await ds.feed.getInsight('ins-1');
    expect(insight.title).toBe('Teklifi gönder');
    expect(insight.dueAt).toBe('2026-09-06T12:00:00.000Z');
    expect(h.state.ops('insights', 'eq').map((c) => c.args)).toEqual([
      ['user_id', 'user-1'],
      ['id', 'ins-1'],
    ]);
    expect(h.state.ops('insights', 'single')).toHaveLength(1);
  });

  it('resolves insights through the resolve_insight RPC', async () => {
    h.state.rpcResults.push({
      data: { ...insightRow, status: 'completed', completed_at: '2026-09-05T09:00:00+00:00' },
      error: null,
    });
    const ds = createDs();
    const insight = await ds.feed.resolveInsight('ins-1', 'completed', 'correct');
    expect(insight.status).toBe('completed');
    expect(h.state.rpcCalls).toEqual([
      {
        fn: 'resolve_insight',
        args: { p_insight: 'ins-1', p_status: 'completed', p_feedback: 'correct' },
      },
    ]);
  });

  it('maps PostgREST errors to client codes', async () => {
    const ds = createDs();
    h.state.queue('insights', {
      data: null,
      error: { code: 'PGRST116', message: 'no rows', details: '', hint: '' },
    });
    await expect(ds.feed.getInsight('missing')).rejects.toMatchObject({ code: 'not_found' });
    h.state.queue('email_threads', {
      data: null,
      error: { code: '42501', message: 'permission denied', details: '', hint: '' },
    });
    await expect(ds.email.markRead('thr-1', true)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('retries a read once when PostgREST reports a network failure', async () => {
    h.state.queue(
      'tasks',
      {
        data: null,
        error: { code: '', message: 'TypeError: fetch failed', details: '', hint: '' },
      },
      { data: [], error: null },
    );
    const ds = createDs();
    await expect(ds.plan.listTasks()).resolves.toEqual([]);
    expect(h.state.ops('tasks', 'select')).toHaveLength(2);
  });

  it('records a post-meeting "handled" decision as an empty note', async () => {
    const ds = createDs();
    await ds.meetings.markPostMeetingHandled('evt-1');
    const insert = h.state.ops('post_meeting_notes', 'insert')[0];
    expect(insert?.args[0]).toMatchObject({
      user_id: 'user-1',
      event_id: 'evt-1',
      text: '',
      input_mode: 'text',
      extracted_commitment_ids: [],
    });
    expect(h.state.ops('calendar_events', 'update')[0]?.args[0]).toEqual({
      post_meeting_handled_at: '2026-09-05T09:00:00.000Z',
    });
    expect(h.state.ops('calendar_events', 'in')[0]?.args).toEqual([
      'source',
      ['apple_calendar', 'device_calendar'],
    ]);
  });

  it('setVip creates the VIP row from the contact and flags the contact', async () => {
    const contact: ContactRow = {
      id: 'c-1',
      user_id: 'user-1',
      display_name: 'Mehmet Yılmaz',
      emails: ['mehmet@example.com'],
      phones: [],
      company: null,
      title: null,
      avatar_url: null,
      last_contact_at: null,
      interaction_count: 3,
      is_vip: false,
      source: 'communication',
      deleted_at: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    };
    h.state.queue('vip_people', { data: null, error: null }, { data: [], error: null });
    h.state.queue('contacts', { data: contact, error: null }, { data: null, error: null });
    const ds = createDs();
    await ds.people.setVip('c-1', true);
    expect(h.state.ops('vip_people', 'insert')[0]?.args[0]).toMatchObject({
      user_id: 'user-1',
      contact_id: 'c-1',
      display_name: 'Mehmet Yılmaz',
      email: 'mehmet@example.com',
    });
    expect(h.state.ops('contacts', 'update')[0]?.args[0]).toEqual({ is_vip: true });
  });

  it('counts pending approvals with a head request', async () => {
    h.state.queue('approval_actions', { data: null, error: null, count: 3 });
    const ds = createDs();
    await expect(ds.approvals.pendingCount()).resolves.toBe(3);
    expect(h.state.ops('approval_actions', 'select')[0]?.args).toEqual([
      'id',
      { count: 'exact', head: true },
    ]);
    expect(h.state.ops('approval_actions', 'eq').map((c) => c.args)).toEqual([
      ['user_id', 'user-1'],
      ['status', 'pending'],
    ]);
  });

  it('subscribes to the user’s approval_actions changes and tears the channel down', async () => {
    const ds = createDs();
    const seen: number[] = [];
    const unsubscribe = ds.approvals.onPendingChange?.((n) => seen.push(n));
    await flush();
    expect(h.state.channels).toHaveLength(1);
    expect(h.state.channels[0]?.name).toBe('approvals:user-1');
    expect(h.state.channels[0]?.subscribed).toBe(true);
    expect(h.state.channels[0]?.filters[0]).toEqual({
      event: '*',
      schema: 'public',
      table: 'approval_actions',
      filter: 'user_id=eq.user-1',
    });
    unsubscribe?.();
    await flush();
    expect(h.state.removedChannels).toBe(1);
    expect(seen).toEqual([]);
  });

  it('uploads capture files to a user-scoped path in the private bucket', async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
    const ds = createDs();
    const { storagePath } = await ds.capture.uploadCaptureFile({
      uri: 'file:///tmp/Fatura 2026.PDF',
      mimeType: 'application/pdf',
      sizeBytes: 3,
      fileName: 'Fatura 2026.PDF',
    });
    expect(storagePath).toBe('user-1/1788598800000-Fatura_2026.PDF');
    expect(h.state.uploads[0]?.path).toBe(storagePath);
    expect(h.state.uploads[0]?.body).toBeInstanceOf(ArrayBuffer);
    expect(h.state.uploads[0]?.options).toEqual({ contentType: 'application/pdf', upsert: false });
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('auth', () => {
  it('signs in with Apple through signInWithIdToken and maps the session', async () => {
    const ds = createDs();
    const session = await ds.auth.signInWithApple({ identityToken: 'id-token', nonce: 'nonce-1' });
    expect(h.state.authCalls[0]).toEqual({
      method: 'signInWithIdToken',
      args: [{ provider: 'apple', token: 'id-token', nonce: 'nonce-1' }],
    });
    expect(session.accessToken).toBe('tok');
    expect(session.user).toEqual({
      id: 'user-1',
      email: 'yunus@example.com',
      displayName: 'Yunus Emre',
      avatarUrl: null,
      provider: 'google',
    });
    expect(session.expiresAt).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it('produces a PKCE OAuth URL without redirecting and exchanges the callback code', async () => {
    const ds = createDs();
    const url = await ds.auth.getOAuthSignInUrl({
      provider: 'azure',
      redirectTo: 'dijitalasistan://oauth/azure',
    });
    expect(url).toContain('/auth/v1/authorize');
    expect(h.state.authCalls[0]?.args[0]).toMatchObject({
      provider: 'azure',
      options: { redirectTo: 'dijitalasistan://oauth/azure', skipBrowserRedirect: true },
    });
    await ds.auth.exchangeCodeForSession('dijitalasistan://oauth/azure?code=abc123&state=s1');
    expect(h.state.authCalls[1]).toEqual({ method: 'exchangeCodeForSession', args: ['abc123'] });
    await expect(
      ds.auth.exchangeCodeForSession(
        'dijitalasistan://oauth/azure?error=access_denied&error_description=User+cancelled',
      ),
    ).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'User cancelled',
    });
  });

  it('signs out locally', async () => {
    const ds = createDs();
    await ds.auth.signOut();
    expect(h.state.authCalls[0]).toEqual({ method: 'signOut', args: [{ scope: 'local' }] });
  });
});

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

describe('search history', () => {
  it('keeps the eight most recent distinct queries and clears them with local state', async () => {
    const ds = createDs();
    for (let i = 1; i <= 9; i++) await ds.search.rememberQuery(`sorgu ${i}`);
    await ds.search.rememberQuery('Sorgu 9');
    await ds.search.rememberQuery('   ');
    const recent = await ds.search.recentQueries();
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe('Sorgu 9');
    expect(recent).not.toContain('sorgu 1');
    expect(recent.filter((q) => q.toLowerCase() === 'sorgu 9')).toHaveLength(1);
    await ds.clearLocalState();
    await expect(ds.search.recentQueries()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

describe('mappers', () => {
  it('maps insight rows', () => {
    const insight = toInsight(insightRow);
    expect(insight).toMatchObject({
      id: 'ins-1',
      userId: 'user-1',
      kind: 'deadline',
      badge: 'deadline',
      priorityScore: 87,
      priorityReasons: ['deadline_soon', 'vip'],
      timeLabel: 'Yarın 12:00',
      dueAt: '2026-09-06T12:00:00.000Z',
      entityType: 'email_thread',
      entityId: 'thr-1',
      tags: ['important', 'mail'],
      forDate: '2026-09-05',
      isLowConfidence: false,
      dedupeKey: 'deadline:thr-1',
      createdAt: '2026-09-05T05:43:00.123Z',
    });
    expect(insight.actions[0]?.kind).toBe('reply');
    expect(insight.source.label).toBe('Gmail');
  });

  it('maps email thread rows including the analysis payload', () => {
    const thread = toEmailThread(threadRow);
    expect(thread).toMatchObject({
      accountId: 'acc-1',
      externalThreadId: 'gm-thread-1',
      lastMessageAt: '2026-09-05T05:42:00.000Z',
      messageCount: 3,
      lastFromUser: false,
      isRead: false,
      priorityScore: 87,
      triage: 'ai',
      userDismissed: false,
      userMarkedDone: false,
    });
    expect(thread.participants[0]?.email).toBe('mehmet@example.com');
    expect(thread.analysis?.producedBy).toBe('ai_small');
  });

  it('maps approval rows with typed payloads', () => {
    const approval = toApprovalAction<'email_send'>(approvalRow);
    expect(approval.type).toBe('email_send');
    expect(approval.payload.subject).toBe('Re: Teklif');
    expect(approval.changeSummary).toHaveLength(2);
    expect(approval.expiresAt).toBe('2026-09-08T09:00:00.000Z');
    expect(approval.editedByUser).toBe(false);
    expect(approval.insightId).toBe('ins-1');
  });

  it('maps preference patches to columns and drops undefined keys', () => {
    expect(
      userPreferencesPatchToRow({
        theme: 'dark',
        learnFromInteractions: false,
        androidAllowedPackages: ['com.whatsapp'],
        timezone: undefined,
      }),
    ).toEqual({
      theme: 'dark',
      learn_from_interactions: false,
      android_allowed_packages: ['com.whatsapp'],
    });
  });

  it('fills defaults for partial jsonb columns', () => {
    const accountRow: ConnectedAccountRow = {
      id: 'acc-1',
      user_id: 'user-1',
      provider: 'google',
      kinds: ['email', 'calendar'],
      external_account_id: 'yunus@gmail.com',
      display_name: 'Gmail',
      email: 'yunus@gmail.com',
      status: 'active',
      granted_scopes: ['gmail.readonly'],
      controls: { readEmail: false },
      last_sync_at: null,
      last_error: null,
      backfill_completed: true,
      is_primary: true,
      deleted_at: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    };
    expect(toConnectedAccount(accountRow).controls).toMatchObject({
      readEmail: false,
      readEvents: true,
      prepareDrafts: true,
    });

    const briefingRow: BriefingRow = {
      id: 'b-1',
      user_id: 'user-1',
      kind: 'morning',
      for_date: '2026-09-05',
      generated_at: '2026-09-05T04:30:00Z',
      headline: 'Bugün bilmen gereken 3 şey var.',
      highlight_number: 3,
      subline: '',
      mood: '',
      narrative: '',
      outlook: null,
      counts: { total: 3 },
      audio: null,
      estimated_read_sec: 60,
      opened_at: null,
      closed_at: null,
      weekly: null,
      has_changes: true,
      version: 1,
      produced_by: 'ai_small',
      created_at: '2026-09-05T04:30:00Z',
      updated_at: '2026-09-05T04:30:00Z',
      items: [
        {
          id: 'i2',
          briefing_id: 'b-1',
          user_id: 'user-1',
          section: 'schedule',
          position: 2,
          icon: 'calendar',
          title: 'B',
          meta: null,
          source: null,
          insight_id: null,
          entity_type: null,
          entity_id: null,
          chapter_index: null,
          status: 'done',
          created_at: '2026-09-05T04:30:00Z',
        },
        {
          id: 'i1',
          briefing_id: 'b-1',
          user_id: 'user-1',
          section: 'priorities',
          position: 1,
          icon: 'mail',
          title: 'A',
          meta: null,
          source: null,
          insight_id: null,
          entity_type: null,
          entity_id: null,
          chapter_index: null,
          status: 'weird',
          created_at: '2026-09-05T04:30:00Z',
        },
      ],
    };
    const briefing = toBriefing(briefingRow);
    expect(briefing.counts).toEqual({
      importantEmails: 0,
      events: 0,
      followUps: 0,
      deadlines: 0,
      total: 3,
      analyzedEmails: 0,
      analyzedCalendars: 0,
      analyzedDays: 0,
    });
    expect(briefing.items.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(briefing.items.map((i) => i.status)).toEqual([null, 'done']);
  });
});

// ---------------------------------------------------------------------------
// Secure storage chunking
// ---------------------------------------------------------------------------

describe('chunked secure storage', () => {
  /** Mimics Expo SecureStore on iOS: rejects any value above 2048 bytes. */
  class StrictSecureStore implements KeyValueStorage {
    private readonly items = new Map<string, string>();
    keys(): string[] {
      return [...this.items.keys()];
    }
    async getItem(key: string): Promise<string | null> {
      return this.items.get(key) ?? null;
    }
    async setItem(key: string, value: string): Promise<void> {
      if (utf8ByteLength(value) > 2048)
        throw new Error(`SecureStore: value for ${key} exceeds 2048 bytes`);
      this.items.set(key, value);
    }
    async removeItem(key: string): Promise<void> {
      this.items.delete(key);
    }
  }

  it('round-trips values above 2048 bytes across chunk keys', async () => {
    const store = new StrictSecureStore();
    const adapter = createChunkedSecureStorage(store);
    const big = JSON.stringify({
      access_token: 'a'.repeat(3000),
      user: { name: 'Yunus Şükrü Çağlayan 🚀'.repeat(40) },
    });
    expect(utf8ByteLength(big)).toBeGreaterThan(2048);
    await adapter.setItem('sb-proj-auth-token', big);
    expect(store.keys()).toContain('sb-proj-auth-token.0');
    expect(store.keys().length).toBeGreaterThan(2);
    await expect(adapter.getItem('sb-proj-auth-token')).resolves.toBe(big);

    const small = '{"access_token":"short"}';
    await adapter.setItem('sb-proj-auth-token', small);
    expect(store.keys()).toEqual(['sb-proj-auth-token']);
    await expect(store.getItem('sb-proj-auth-token')).resolves.toBe(small);

    await adapter.setItem('sb-proj-auth-token', big);
    await adapter.removeItem('sb-proj-auth-token');
    expect(store.keys()).toEqual([]);
    await expect(adapter.getItem('sb-proj-auth-token')).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

describe('url helpers', () => {
  it('builds query strings without null/undefined and parses callback URLs', () => {
    expect(
      buildQuery({
        kind: 'weekly',
        date: undefined,
        regenerate: true,
        cursor: null,
        ids: ['a', 'b'],
        q: 'iş & güç',
      }),
    ).toBe('kind=weekly&regenerate=true&ids=a&ids=b&q=i%C5%9F%20%26%20g%C3%BC%C3%A7');
    expect(
      parseQueryParams('dijitalasistan://oauth?code=abc&state=s%201#access_token=t&code=frag'),
    ).toEqual({ code: 'abc', state: 's 1', access_token: 't' });
  });
});
