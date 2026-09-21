import { describe, expect, it } from 'vitest';
import { bytesToBase64Url, hmacSha256, pkceChallengeS256, utf8Encode } from '../crypto';
import { isAppError } from '../errors';
import {
  GOOGLE_SCOPES,
  MICROSOFT_CONSENT_MANAGE_URL,
  MICROSOFT_SCOPES,
  buildAuthorizationUrl,
  createOAuthState,
  exchangeCode,
  externalAccountIdFrom,
  isAccessTokenExpired,
  isIdTokenExpired,
  mapOAuthError,
  missingScopes,
  parseIdToken,
  parseOAuthCallback,
  parseOAuthErrorBody,
  parseScopeString,
  planOAuthStart,
  providerEndpoints,
  readScopesFor,
  refreshAccessToken,
  requiredScopeFor,
  revokeToken,
  scopeGroupFor,
  scopeSatisfies,
  scopesFor,
  verifyOAuthState,
  type OAuthFetch,
} from './index';

const NOW = new Date('2026-09-05T05:00:00.000Z'); // 08:00 Europe/Istanbul
const SECRET = 'oauth-state-secret-with-at-least-32-bytes-of-entropy';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; form: URLSearchParams }[] = [];
  const fetch: OAuthFetch = async (url, init) => {
    calls.push({ url, init, form: new URLSearchParams(String(init.body ?? '')) });
    return handler(url, init);
  };
  return { fetch, calls };
}

function fakeJwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' },
): string {
  const seg = (v: unknown) => bytesToBase64Url(utf8Encode(JSON.stringify(v)));
  return `${seg(header)}.${seg(payload)}.signature`;
}

describe('oauth/scopes', () => {
  it('builds least-privilege google read scopes per kind', () => {
    expect(readScopesFor('google', ['email', 'calendar'])).toEqual([
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
    ]);
    expect(readScopesFor('google', ['tasks'])).toContain(GOOGLE_SCOPES.tasksReadonly);
    expect(readScopesFor('google', ['tasks'])).not.toContain(GOOGLE_SCOPES.gmailReadonly);
    expect(readScopesFor('google', ['email', 'calendar', 'tasks'])).toHaveLength(6);
  });
  it('builds microsoft read scopes per kind', () => {
    const scopes = readScopesFor('microsoft', ['email', 'calendar']);
    expect(scopes).toEqual(
      expect.arrayContaining([
        'offline_access',
        'User.Read',
        'Mail.Read',
        'Calendars.Read',
        'openid',
      ]),
    );
    expect(scopes).not.toContain('Tasks.Read');
    expect(readScopesFor('microsoft', ['email', 'calendar', 'tasks'])).toContain(
      MICROSOFT_SCOPES.tasksRead,
    );
  });
  it('adds write groups and de-duplicates', () => {
    const google = scopesFor({
      provider: 'google',
      kinds: ['email'],
      groups: ['read', 'mail_send', 'mail_send'],
    });
    expect(google.filter((s) => s === GOOGLE_SCOPES.gmailSend)).toHaveLength(1);
    expect(google).toContain(GOOGLE_SCOPES.gmailReadonly);
    const ms = scopesFor({
      provider: 'microsoft',
      kinds: ['calendar', 'tasks'],
      groups: ['calendar_write', 'tasks_write'],
    });
    expect(ms).toEqual(
      expect.arrayContaining(['Calendars.ReadWrite', 'Tasks.ReadWrite', 'Calendars.Read']),
    );
  });
  it('scopeSatisfies understands implications, prefixes and case', () => {
    expect(
      scopeSatisfies(
        ['https://www.googleapis.com/auth/gmail.readonly'],
        GOOGLE_SCOPES.gmailReadonly,
      ),
    ).toBe(true);
    expect(
      scopeSatisfies(
        ['https://mail.google.com/'],
        [GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.gmailSend],
      ),
    ).toBe(true);
    expect(
      scopeSatisfies(['https://www.googleapis.com/auth/calendar'], GOOGLE_SCOPES.calendarEvents),
    ).toBe(true);
    expect(scopeSatisfies([GOOGLE_SCOPES.calendarReadonly], GOOGLE_SCOPES.calendarEvents)).toBe(
      false,
    );
    expect(
      scopeSatisfies(['https://graph.microsoft.com/Mail.ReadWrite', 'offline_access'], 'mail.read'),
    ).toBe(true);
    expect(scopeSatisfies(['Mail.Read'], 'Mail.Send')).toBe(false);
    expect(scopeSatisfies(['Tasks.ReadWrite'], 'Tasks.Read Tasks.ReadWrite')).toBe(true);
    expect(scopeSatisfies([], '')).toBe(true);
    expect(missingScopes(['Mail.Read', 'openid'], ['openid', 'Mail.Read', 'Mail.Send'])).toEqual([
      'Mail.Send',
    ]);
    expect(parseScopeString(' openid  email ')).toEqual(['openid', 'email']);
    expect(parseScopeString(null)).toEqual([]);
  });
  it('maps approval actions to scopes', () => {
    expect(requiredScopeFor('email_send', 'google')).toBe(GOOGLE_SCOPES.gmailSend);
    expect(requiredScopeFor('email_send', 'microsoft')).toBe('Mail.Send');
    expect(requiredScopeFor('calendar_create', 'google')).toBe(GOOGLE_SCOPES.calendarEvents);
    expect(requiredScopeFor('calendar_update', 'microsoft')).toBe('Calendars.ReadWrite');
    expect(requiredScopeFor('task_create', 'google')).toBe(GOOGLE_SCOPES.tasks);
    expect(requiredScopeFor('task_create', 'microsoft')).toBe('Tasks.ReadWrite');
    expect(requiredScopeFor('reminder_create', 'google')).toBeNull();
    expect(requiredScopeFor('commitment_create', 'microsoft')).toBeNull();
    expect(scopeGroupFor('calendar_update')).toBe('calendar_write');
  });
});

describe('oauth/authorize', () => {
  it('builds a google authorization url with offline access and incremental scopes', () => {
    const url = new URL(
      buildAuthorizationUrl({
        provider: 'google',
        clientId: 'cid',
        redirectUri: 'https://x.supabase.co/functions/v1/oauth-google-callback',
        scopes: scopesFor({ provider: 'google', kinds: ['email'] }),
        state: 'st',
        codeChallenge: 'chal',
        loginHint: 'yunus@gmail.com',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = url.searchParams;
    expect(q.get('client_id')).toBe('cid');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('include_granted_scopes')).toBe('true');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('code_challenge')).toBe('chal');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('login_hint')).toBe('yunus@gmail.com');
    expect(q.get('scope')).toBe(
      'openid email profile https://www.googleapis.com/auth/gmail.readonly',
    );
    expect(q.get('state')).toBe('st');
  });
  it('builds a microsoft authorization url with tenant and prompt rules', () => {
    const base = {
      provider: 'microsoft' as const,
      clientId: 'cid',
      redirectUri: 'https://x/cb',
      scopes: ['openid', 'Mail.Read'],
      state: 's',
      codeChallenge: 'c',
    };
    const first = new URL(buildAuthorizationUrl(base));
    expect(
      first.href.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?'),
    ).toBe(true);
    expect(first.searchParams.get('prompt')).toBe('select_account');
    expect(first.searchParams.get('response_mode')).toBe('query');
    expect(first.searchParams.has('include_granted_scopes')).toBe(false);
    expect(first.searchParams.has('access_type')).toBe(false);

    const upgrade = new URL(
      buildAuthorizationUrl({ ...base, isScopeUpgrade: true, tenant: 'organizations' }),
    );
    expect(upgrade.pathname).toBe('/organizations/oauth2/v2.0/authorize');
    expect(upgrade.searchParams.get('prompt')).toBe('consent');
    expect(() => buildAuthorizationUrl({ ...base, tenant: 'bad tenant' })).toThrow();
    expect(() => buildAuthorizationUrl({ ...base, scopes: [] })).toThrow();
    expect(() => buildAuthorizationUrl({ ...base, state: '' })).toThrow();
  });
  it('exposes provider endpoints', () => {
    expect(providerEndpoints('google').revoke).toBe('https://oauth2.googleapis.com/revoke');
    expect(providerEndpoints('microsoft', 'consumers').token).toBe(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    );
    expect(providerEndpoints('microsoft').revoke).toBeNull();
  });
});

describe('oauth/tokens', () => {
  it('exchanges a google code with pkce and computes expiresAt', async () => {
    const { fetch, calls } = mockFetch(() =>
      jsonResponse({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3599,
        scope: 'openid https://www.googleapis.com/auth/gmail.readonly',
        token_type: 'Bearer',
        id_token: 'id',
      }),
    );
    const tokens = await exchangeCode(fetch, {
      provider: 'google',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'https://x/cb',
      code: 'code123',
      codeVerifier: 'verifier',
      now: () => NOW,
    });
    expect(tokens).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date(NOW.getTime() + (3599 - 60) * 1000).toISOString(),
      scope: ['openid', 'https://www.googleapis.com/auth/gmail.readonly'],
      idToken: 'id',
      tokenType: 'Bearer',
    });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe('https://oauth2.googleapis.com/token');
    expect(call?.init.method).toBe('POST');
    expect(call?.form.get('grant_type')).toBe('authorization_code');
    expect(call?.form.get('code')).toBe('code123');
    expect(call?.form.get('code_verifier')).toBe('verifier');
    expect(call?.form.get('client_secret')).toBe('sec');
    expect(call?.form.get('redirect_uri')).toBe('https://x/cb');
  });
  it('exchanges a microsoft code (expires_in as string, tenant path)', async () => {
    const { fetch, calls } = mockFetch(() =>
      jsonResponse({ access_token: 'at', expires_in: '3600', scope: 'Mail.Read User.Read' }),
    );
    const tokens = await exchangeCode(fetch, {
      provider: 'microsoft',
      tenant: 'consumers',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'https://x/cb',
      code: 'c',
      codeVerifier: 'v',
      now: () => NOW,
    });
    expect(calls[0]?.url).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
    expect(tokens.refreshToken).toBeNull();
    expect(tokens.idToken).toBeNull();
    expect(tokens.scope).toEqual(['Mail.Read', 'User.Read']);
    expect(tokens.expiresAt).toBe(new Date(NOW.getTime() + 3540 * 1000).toISOString());
  });
  it('refresh keeps the old refresh token for google and takes the rotated one for microsoft', async () => {
    const google = mockFetch(() =>
      jsonResponse({ access_token: 'new-at', expires_in: 3600, scope: 'openid' }),
    );
    const g = await refreshAccessToken(google.fetch, {
      provider: 'google',
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'old-rt',
      now: () => NOW,
    });
    expect(g.refreshToken).toBe('old-rt');
    expect(g.refreshTokenRotated).toBe(false);
    expect(google.calls[0]?.form.get('grant_type')).toBe('refresh_token');
    expect(google.calls[0]?.form.get('refresh_token')).toBe('old-rt');
    expect(google.calls[0]?.form.has('scope')).toBe(false);

    const ms = mockFetch(() =>
      jsonResponse({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600 }),
    );
    const m = await refreshAccessToken(ms.fetch, {
      provider: 'microsoft',
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'old-rt',
      scopes: ['Mail.Read', 'offline_access'],
      now: () => NOW,
    });
    expect(m.refreshToken).toBe('new-rt');
    expect(m.refreshTokenRotated).toBe(true);
    expect(ms.calls[0]?.form.get('scope')).toBe('Mail.Read offline_access');

    const same = mockFetch(() =>
      jsonResponse({ access_token: 'a', refresh_token: 'old-rt', expires_in: 10 }),
    );
    const s = await refreshAccessToken(same.fetch, {
      provider: 'microsoft',
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'old-rt',
      now: () => NOW,
    });
    expect(s.refreshTokenRotated).toBe(false);
    expect(s.expiresAt).toBe(NOW.toISOString());
  });
  it('maps invalid_grant to oauth_expired and other failures sensibly', async () => {
    const expired = mockFetch(() =>
      jsonResponse(
        { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
        400,
      ),
    );
    const err = await refreshAccessToken(expired.fetch, {
      provider: 'google',
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'rt',
    }).catch((e: unknown) => e);
    expect(isAppError(err)).toBe(true);
    if (!isAppError(err)) return;
    expect(err.code).toBe('oauth_expired');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Hesap bağlantısının süresi dolmuş. Yeniden bağlaman gerekiyor.');
    expect(err.details).toMatchObject({ oauthError: 'invalid_grant', status: 400 });

    const msInteraction = mockFetch(() =>
      jsonResponse({ error: 'interaction_required', error_codes: [50076] }, 400),
    );
    await expect(
      refreshAccessToken(msInteraction.fetch, {
        provider: 'microsoft',
        clientId: 'c',
        clientSecret: 's',
        refreshToken: 'rt',
        locale: 'en',
      }),
    ).rejects.toMatchObject({
      code: 'oauth_expired',
      message: 'The account connection has expired. Please reconnect it.',
      details: { errorCodes: [50076] },
    });

    const badClient = mockFetch(() => jsonResponse({ error: 'invalid_client' }, 401));
    await expect(
      exchangeCode(badClient.fetch, {
        provider: 'google',
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'r',
        code: 'x',
        codeVerifier: 'v',
      }),
    ).rejects.toMatchObject({ code: 'internal' });

    const down = mockFetch(() => new Response('<html>502</html>', { status: 502 }));
    await expect(
      exchangeCode(down.fetch, {
        provider: 'google',
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'r',
        code: 'x',
        codeVerifier: 'v',
      }),
    ).rejects.toMatchObject({ code: 'provider_unavailable' });

    const network = mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(
      exchangeCode(network.fetch, {
        provider: 'google',
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'r',
        code: 'x',
        codeVerifier: 'v',
      }),
    ).rejects.toMatchObject({ code: 'provider_unavailable', details: { reason: 'network' } });

    const garbage = mockFetch(() => new Response('not json', { status: 200 }));
    await expect(
      exchangeCode(garbage.fetch, {
        provider: 'google',
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'r',
        code: 'x',
        codeVerifier: 'v',
      }),
    ).rejects.toSatisfy(isAppError);

    const missingToken = mockFetch(() => jsonResponse({ token_type: 'Bearer' }));
    await expect(
      exchangeCode(missingToken.fetch, {
        provider: 'google',
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'r',
        code: 'x',
        codeVerifier: 'v',
      }),
    ).rejects.toSatisfy(isAppError);
  });
  it('revokes google tokens and reports manual revocation for microsoft', async () => {
    const ok = mockFetch(() => new Response('', { status: 200 }));
    expect(await revokeToken(ok.fetch, { provider: 'google', token: 'rt' })).toEqual({
      supported: true,
      revoked: true,
      status: 200,
    });
    expect(ok.calls[0]?.url).toBe('https://oauth2.googleapis.com/revoke');
    expect(ok.calls[0]?.form.get('token')).toBe('rt');

    const already = mockFetch(() => jsonResponse({ error: 'invalid_token' }, 400));
    expect(await revokeToken(already.fetch, { provider: 'google', token: 'rt' })).toMatchObject({
      supported: true,
      revoked: true,
    });
    const failed = mockFetch(() => new Response('', { status: 503 }));
    expect(await revokeToken(failed.fetch, { provider: 'google', token: 'rt' })).toMatchObject({
      supported: true,
      revoked: false,
      status: 503,
    });

    const ms = mockFetch(() => new Response('', { status: 200 }));
    expect(await revokeToken(ms.fetch, { provider: 'microsoft', token: 'rt' })).toEqual({
      supported: false,
      manualUrl: MICROSOFT_CONSENT_MANAGE_URL,
    });
    expect(ms.calls).toHaveLength(0);
    expect(MICROSOFT_CONSENT_MANAGE_URL).toBe('https://account.live.com/consent/Manage');
  });
  it('error helpers', () => {
    expect(parseOAuthErrorBody('nope')).toEqual({});
    expect(parseOAuthErrorBody('{"error":"access_denied","error_codes":[1,"x"]}')).toEqual({
      error: 'access_denied',
      error_codes: [1],
    });
    expect(mapOAuthError({ body: { error: 'access_denied' } }).code).toBe('forbidden');
    expect(mapOAuthError({ body: { error: 'temporarily_unavailable' } }).code).toBe(
      'provider_unavailable',
    );
    expect(mapOAuthError({ body: { error: 'invalid_request' } }).code).toBe('validation');
    expect(mapOAuthError({ status: 429 }).retryAfterSec).toBe(30);
    expect(mapOAuthError({ status: 404 }).code).toBe('validation');
    expect(mapOAuthError({}).code).toBe('provider_unavailable');
    expect(isAccessTokenExpired(new Date(NOW.getTime() + 1000).toISOString(), NOW)).toBe(false);
    expect(isAccessTokenExpired(new Date(NOW.getTime() + 1000).toISOString(), NOW, 5)).toBe(true);
    expect(isAccessTokenExpired('garbage', NOW)).toBe(true);
  });
});

describe('oauth/idToken', () => {
  it('reads claims without verifying the signature', () => {
    const token = fakeJwt({
      iss: 'https://accounts.google.com',
      sub: '1234567890',
      aud: 'cid',
      exp: Math.floor(NOW.getTime() / 1000) + 3600,
      iat: Math.floor(NOW.getTime() / 1000),
      email: 'Yunus.Ç@Gmail.com ',
      email_verified: 'true',
      name: ' Yunus Ç. ',
      picture: 'https://p/x.png',
    });
    const claims = parseIdToken(token);
    expect(claims).not.toBeNull();
    expect(claims).toMatchObject({
      iss: 'https://accounts.google.com',
      sub: '1234567890',
      aud: ['cid'],
      email: 'yunus.ç@gmail.com',
      emailVerified: true,
      name: 'Yunus Ç.',
      tid: null,
      preferredUsername: null,
    });
    if (!claims) return;
    expect(isIdTokenExpired(claims, NOW)).toBe(false);
    expect(isIdTokenExpired(claims, new Date(NOW.getTime() + 3700 * 1000))).toBe(true);
    expect(externalAccountIdFrom(claims)).toBe('yunus.ç@gmail.com');
  });
  it('handles microsoft claims and malformed tokens', () => {
    const ms = parseIdToken(
      fakeJwt({
        iss: 'https://login.microsoftonline.com/9188040d/v2.0',
        sub: 'abc',
        aud: ['cid'],
        exp: 1,
        tid: '9188040d',
        preferred_username: 'Yunus@Outlook.com',
      }),
    );
    expect(ms).toMatchObject({
      tid: '9188040d',
      preferredUsername: 'yunus@outlook.com',
      email: null,
      emailVerified: null,
    });
    if (ms) expect(externalAccountIdFrom(ms)).toBe('yunus@outlook.com');
    expect(parseIdToken('')).toBeNull();
    expect(parseIdToken('a.b')).toBeNull();
    expect(parseIdToken('a.b.c')).toBeNull();
    expect(parseIdToken(fakeJwt({ sub: 'x' }))).toBeNull();
    expect(
      parseIdToken(
        `${bytesToBase64Url(utf8Encode('"str"'))}.${bytesToBase64Url(utf8Encode('{}'))}.s`,
      ),
    ).toBeNull();
  });
});

describe('oauth/state', () => {
  const base = {
    secret: SECRET,
    userId: 'user-1',
    provider: 'google' as const,
    kinds: ['calendar', 'email'] as const,
    redirectTo: 'dijitalasistan://oauth/done',
    now: NOW,
  };

  it('round-trips a signed, expiring state', async () => {
    const created = await createOAuthState({
      ...base,
      accountId: 'acc-1',
      scopeGroup: 'mail_send',
    });
    expect(created.state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(created.expiresAt).toBe(new Date(NOW.getTime() + 600_000).toISOString());
    expect(created.payload.kinds).toEqual(['email', 'calendar']);
    expect(created.payload.nonce.length).toBeGreaterThanOrEqual(16);

    const verified = await verifyOAuthState({
      secret: SECRET,
      state: created.state,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.payload).toEqual(created.payload);
    expect(verified.payload.accountId).toBe('acc-1');
    expect(verified.payload.scopeGroup).toBe('mail_send');
    expect(verified.payload.redirectTo).toBe('dijitalasistan://oauth/done');
  });
  it('rejects expired, tampered, foreign-secret and malformed states', async () => {
    const created = await createOAuthState({ ...base, ttlSec: 60 });
    expect(
      await verifyOAuthState({
        secret: SECRET,
        state: created.state,
        now: new Date(NOW.getTime() + 60_000),
      }),
    ).toEqual({ ok: false, reason: 'expired' });
    expect(
      await verifyOAuthState({ secret: `${SECRET}-other`, state: created.state, now: NOW }),
    ).toEqual({ ok: false, reason: 'bad_signature' });

    const [payload, sig] = created.state.split('.') as [string, string];
    const tamperedPayload = bytesToBase64Url(
      utf8Encode(JSON.stringify({ ...created.payload, v: 1, userId: 'user-2' })),
    );
    expect(
      await verifyOAuthState({ secret: SECRET, state: `${tamperedPayload}.${sig}`, now: NOW }),
    ).toEqual({ ok: false, reason: 'bad_signature' });
    expect(
      await verifyOAuthState({
        secret: SECRET,
        state: `${payload}.${sig.slice(0, -2)}AA`,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifyOAuthState({ secret: SECRET, state: 'garbage', now: NOW })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(await verifyOAuthState({ secret: SECRET, state: '.', now: NOW })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(await verifyOAuthState({ secret: SECRET, state: `${payload}.***`, now: NOW })).toEqual({
      ok: false,
      reason: 'malformed',
    });

    await expect(createOAuthState({ ...base, secret: 'short' })).rejects.toThrow();
    await expect(createOAuthState({ ...base, kinds: [] })).rejects.toThrow();
  });
  it('flags a validly signed but semantically invalid payload', async () => {
    // Sign with the module's scheme (`oauth-state:` prefix) so only payload validation can fail.
    const signed = async (payload: unknown) => {
      const segment = bytesToBase64Url(utf8Encode(JSON.stringify(payload)));
      const signature = bytesToBase64Url(await hmacSha256(SECRET, `oauth-state:${segment}`));
      return `${segment}.${signature}`;
    };
    const created = await createOAuthState({ ...base, nonce: 'nonce-1234567890abcdef' });
    expect(
      await verifyOAuthState({
        secret: SECRET,
        state: await signed({ v: 1, ...created.payload }),
        now: NOW,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await verifyOAuthState({
        secret: SECRET,
        state: await signed({ v: 1, ...created.payload, provider: 'apple' }),
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid_payload' });
    expect(
      await verifyOAuthState({
        secret: SECRET,
        state: await signed({ v: 2, ...created.payload }),
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid_payload' });
    expect(
      await verifyOAuthState({ secret: SECRET, state: await signed('not-an-object'), now: NOW }),
    ).toEqual({ ok: false, reason: 'invalid_payload' });
    const notJson = bytesToBase64Url(utf8Encode('{oops'));
    const notJsonSig = bytesToBase64Url(await hmacSha256(SECRET, `oauth-state:${notJson}`));
    expect(
      await verifyOAuthState({ secret: SECRET, state: `${notJson}.${notJsonSig}`, now: NOW }),
    ).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('oauth/plan', () => {
  it('produces a complete start plan for a first google connection', async () => {
    const plan = await planOAuthStart({
      request: {
        provider: 'google',
        kinds: ['email', 'calendar'],
        redirectTo: 'dijitalasistan://oauth/done',
      },
      userId: 'user-1',
      clientId: 'cid',
      redirectUri: 'https://x.supabase.co/functions/v1/oauth-google-callback',
      stateSecret: SECRET,
      loginHint: 'yunus@gmail.com',
      now: NOW,
    });
    expect(plan.isScopeUpgrade).toBe(false);
    expect(plan.scopes).toEqual(readScopesFor('google', ['email', 'calendar']));
    expect(plan.newScopes).toEqual(plan.scopes);
    expect(plan.codeChallenge).toBe(await pkceChallengeS256(plan.codeVerifier));
    const url = new URL(plan.authorizationUrl);
    expect(url.searchParams.get('state')).toBe(plan.state);
    expect(url.searchParams.get('code_challenge')).toBe(plan.codeChallenge);
    expect(url.searchParams.get('login_hint')).toBe('yunus@gmail.com');
    expect(plan.authorizationUrl).not.toContain(plan.codeVerifier);
    expect(plan.state).not.toContain(plan.codeVerifier);
    const verified = await verifyOAuthState({ secret: SECRET, state: plan.state, now: NOW });
    expect(verified.ok && verified.payload.nonce).toBe(plan.nonce);
    expect(verified.ok && verified.payload.scopeGroup).toBe('read');
  });
  it('plans a scope upgrade requesting only the missing write scope on top of existing grants', async () => {
    const existing = readScopesFor('microsoft', ['email']);
    const plan = await planOAuthStart({
      request: {
        provider: 'microsoft',
        kinds: ['email'],
        scopeGroup: 'mail_send',
        redirectTo: 'dijitalasistan://oauth/done',
        accountId: '6f1c2a4e-0000-4000-8000-000000000001',
      },
      userId: 'user-1',
      clientId: 'cid',
      redirectUri: 'https://x/cb',
      stateSecret: SECRET,
      existingGrantedScopes: existing,
      now: NOW,
    });
    expect(plan.isScopeUpgrade).toBe(true);
    expect(plan.newScopes).toEqual(['Mail.Send']);
    expect(plan.scopes).toEqual(expect.arrayContaining([...existing, 'Mail.Send']));
    expect(new URL(plan.authorizationUrl).searchParams.get('prompt')).toBe('consent');
    const verified = await verifyOAuthState({ secret: SECRET, state: plan.state, now: NOW });
    expect(verified.ok && verified.payload.accountId).toBe('6f1c2a4e-0000-4000-8000-000000000001');
    expect(verified.ok && verified.payload.scopeGroup).toBe('mail_send');
  });
  it('parses callbacks and maps provider errors', () => {
    expect(parseOAuthCallback(new URLSearchParams('code=abc&state=xyz'))).toEqual({
      code: 'abc',
      state: 'xyz',
    });
    expect(parseOAuthCallback({ code: 'abc', state: 'xyz' })).toEqual({
      code: 'abc',
      state: 'xyz',
    });
    expect(() =>
      parseOAuthCallback(new URLSearchParams('error=access_denied&error_description=User+denied')),
    ).toThrow(
      expect.objectContaining({
        code: 'forbidden',
        message: 'İzin verilmedi. İstersen daha sonra tekrar deneyebilirsin.',
      }),
    );
    expect(() => parseOAuthCallback({ state: 'x' })).toThrow(
      expect.objectContaining({ code: 'validation', details: { missing: ['code'] } }),
    );
    expect(() => parseOAuthCallback({}, 'en')).toThrow(
      expect.objectContaining({ message: 'The connection response is incomplete.' }),
    );
  });
});
