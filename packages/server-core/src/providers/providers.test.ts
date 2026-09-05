import { describe, expect, it } from 'vitest';
import { isAppError } from '../errors';
import type { FetchLike } from '../safefetch/fetch';
import {
  buildRawMessage,
  createGmailClient,
  createGoogleCalendarClient,
  createGraphClient,
  decodeBase64Url,
  decodeEncodedWords,
  decodeGraphMailCursor,
  decodeQuotedPrintable,
  detectMeetingLink,
  encodeBase64Url,
  htmlToText,
  mapProviderError,
  normalizeGmailMessage,
  normalizeGoogleEvent,
  normalizeGraphEvent,
  normalizeGraphMessage,
  normalizeGraphTask,
  parseAddressList,
  parseGraphDateTime,
  providerClients,
  providerRequest,
  stripQuotedReply,
  type GmailMessage,
  type GoogleCalendarEvent,
  type GraphEvent,
  type GraphMessage,
} from './index';

// --- Test helpers -----------------------------------------------------------------------------------

interface Route {
  match: RegExp;
  method?: string;
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>;
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function empty(status = 204): Response {
  return new Response(null, { status });
}

/** Deterministic fetch: first matching route (by regex + optional method) answers, calls are recorded. */
function stubFetch(routes: Route[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const method = init.method ?? 'GET';
    let body: unknown = init.body;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, method, headers: (init.headers ?? {}) as Record<string, string>, body });
    for (const route of routes) {
      if (route.method && route.method !== method) continue;
      if (route.match.test(url)) return route.handler(new URL(url), init);
    }
    throw new TypeError(`no route for ${method} ${url}`);
  };
  return { fetch, calls };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected rejection');
}

const TOKEN = 'ya29.test-token';
const USER = 'ayse@example.com';
const NOW = '2026-09-05T08:00:00.000Z';

// --- MIME -----------------------------------------------------------------------------------------

describe('providers/mime', () => {
  it('round-trips UTF-8 text through base64url', () => {
    const text = 'Günaydın İstanbul — şğüçöı ÇĞÜŞÖİ';
    const encoded = encodeBase64Url(text);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeBase64Url(encoded)).toBe(text);
    // Standard base64 with padding and whitespace decodes too.
    expect(decodeBase64Url('R8O8bmF5\nZMSxbg==')).toBe('Günaydın');
  });

  it('decodes legacy charsets when the part declares them', () => {
    // ISO-8859-9: 0xFE = ş, 0xF0 = ğ
    const bytes = new Uint8Array([0xfe, 0xf0]);
    const base64 = btoa(String.fromCharCode(...bytes));
    expect(decodeBase64Url(base64, 'ISO-8859-9')).toBe('şğ');
  });

  it('decodes quoted-printable bodies and encoded words', () => {
    expect(decodeQuotedPrintable('G=C3=BCnayd=C4=B1n=\r\n Ay=C5=9Fe')).toBe('Günaydın Ayşe');
    expect(decodeEncodedWords('=?UTF-8?Q?G=C3=BCnayd=C4=B1n_Ay=C5=9Fe?=')).toBe('Günaydın Ayşe');
    expect(decodeEncodedWords('=?UTF-8?B?VGVrbGlmIGRvc3lhc8Sx?= =?UTF-8?B?IGhhesSxcg==?=')).toBe(
      'Teklif dosyası hazır',
    );
    expect(decodeEncodedWords('plain subject')).toBe('plain subject');
  });

  it('builds an RFC 5322 message with encoded headers, threading and multipart/alternative', () => {
    const raw = buildRawMessage({
      from: USER,
      fromName: 'Ayşe Demir',
      to: [{ name: 'Yılmaz, Ahmet', email: 'ahmet@example.com' }],
      cc: [{ name: null, email: 'selin@example.com' }],
      subject: 'Ynt: Teklif dosyası',
      bodyText: 'Merhaba Ahmet,\nteklifi ekte gönderiyorum.',
      bodyHtml: '<p>Merhaba Ahmet,<br>teklifi ekte gönderiyorum.</p>',
      inReplyToMessageId: 'orig-1@example.com',
      references: ['<root@example.com>'],
      date: new Date(NOW),
      boundary: 'test-boundary',
    });
    const lines = raw.split('\r\n');
    expect(raw).not.toMatch(/(?<!\r)\n/);
    expect(lines).toContain('From: =?UTF-8?B?QXnFn2UgRGVtaXI=?= <ayse@example.com>');
    expect(lines).toContain('To: =?UTF-8?B?WcSxbG1heiwgQWhtZXQ=?= <ahmet@example.com>');
    expect(lines).toContain('Cc: selin@example.com');
    expect(lines).toContain('Date: Sat, 05 Sep 2026 08:00:00 +0000');
    expect(lines).toContain('In-Reply-To: <orig-1@example.com>');
    expect(lines).toContain('References: <root@example.com>');
    expect(lines).toContain(' <orig-1@example.com>');
    expect(lines).toContain('Content-Type: multipart/alternative; boundary="test-boundary"');
    const subject = lines.find((l) => l.startsWith('Subject: ')) ?? '';
    expect(decodeEncodedWords(subject.slice('Subject: '.length))).toBe('Ynt: Teklif dosyası');
    expect(raw.split('--test-boundary')).toHaveLength(4);
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"');
    const plainBody = raw.split('--test-boundary')[1]?.split('\r\n\r\n')[1]?.trim() ?? '';
    expect(decodeBase64Url(plainBody)).toBe('Merhaba Ahmet,\nteklifi ekte gönderiyorum.');
  });

  it('keeps plain-text sends single part and quotes ASCII names with specials', () => {
    const raw = buildRawMessage({
      to: [{ name: 'Smith, John', email: 'john@example.com' }],
      subject: 'Hello',
      bodyText: 'Hi',
      date: new Date(NOW),
    });
    expect(raw).toContain('To: "Smith, John" <john@example.com>');
    expect(raw).not.toContain('From:');
    expect(raw).not.toContain('multipart');
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
  });

  it('parses address lists with quoted names, encoded words and bare addresses', () => {
    const list = parseAddressList(
      '"Yılmaz, Ahmet" <Ahmet@Example.com>, selin@example.com, =?UTF-8?B?U2VsaW4gS2F5YQ==?= <selin.kaya@x.com>; <bare@x.com>, undisclosed-recipients:;',
    );
    expect(list).toEqual([
      { name: 'Yılmaz, Ahmet', email: 'ahmet@example.com' },
      { name: null, email: 'selin@example.com' },
      { name: 'Selin Kaya', email: 'selin.kaya@x.com' },
      { name: null, email: 'bare@x.com' },
    ]);
    expect(parseAddressList(null)).toEqual([]);
  });

  it('strips quoted replies in English, Turkish and Outlook formats', () => {
    const english =
      'Tamam, yarın gönderirim.\n\nOn Fri, Sep 4, 2026 at 5:12 PM Ahmet Yılmaz\n<ahmet@example.com> wrote:\n> Teklifi ne zaman alırız?\n> Teşekkürler';
    expect(stripQuotedReply(english)).toBe('Tamam, yarın gönderirim.');
    const turkish =
      'Tamam, yarın gönderirim.\n\n4 Eyl 2026 Cum 17:12 tarihinde Ahmet Yılmaz <ahmet@example.com> şunu yazdı:\n> Teklifi ne zaman alırız?';
    expect(stripQuotedReply(turkish)).toBe('Tamam, yarın gönderirim.');
    const outlook =
      'Ekte bulabilirsin.\r\n\r\n________________________________\r\nFrom: Ahmet\r\nSent: Friday\r\nTo: Ayşe\r\nSubject: Teklif\r\n\r\nMerhaba';
    expect(stripQuotedReply(outlook)).toBe('Ekte bulabilirsin.');
    expect(stripQuotedReply('> sadece alıntı\n> ikinci satır')).toBe('');
    expect(stripQuotedReply('Plain body without quotes')).toBe('Plain body without quotes');
  });

  it('converts HTML bodies to readable text', () => {
    const text = htmlToText(
      '<html><body><style>p{}</style><p>Merhaba&nbsp;Ay&#351;e,</p><p>Teklifi <b>Cuma</b> g&ouml;nder.</p></body></html>',
    );
    expect(text).toBe('Merhaba Ayşe,\n\nTeklifi Cuma gönder.');
    expect(htmlToText('no tags &amp; entities')).toBe('no tags & entities');
  });

  it('detects conference links', () => {
    expect(detectMeetingLink('Toplantı: https://meet.google.com/abc-defg-hij')).toEqual({
      url: 'https://meet.google.com/abc-defg-hij',
      provider: 'google_meet',
    });
    expect(
      detectMeetingLink(null, 'Join https://us02web.zoom.us/j/123456789?pwd=x.')?.provider,
    ).toBe('zoom');
    expect(
      detectMeetingLink('https://teams.microsoft.com/l/meetup-join/19%3ameeting_x')?.provider,
    ).toBe('teams');
    expect(detectMeetingLink('Ofis, kat 3')).toBeNull();
  });
});

// --- HTTP / error mapping ---------------------------------------------------------------------------

describe('providers/http', () => {
  it('maps provider status codes to the API error contract', () => {
    expect(mapProviderError({ status: 401 }).code).toBe('oauth_expired');
    const scope = mapProviderError({
      status: 403,
      text: JSON.stringify({
        error: { code: 403, errors: [{ reason: 'insufficientPermissions' }] },
      }),
      requiredScope: 'https://www.googleapis.com/auth/gmail.send',
    });
    expect(scope.code).toBe('scope_required');
    expect(scope.requiredScope).toBe('https://www.googleapis.com/auth/gmail.send');
    expect(scope.details).toMatchObject({ status: 403, providerReason: 'insufficientPermissions' });
    const graphDenied = mapProviderError({
      status: 403,
      text: JSON.stringify({ error: { code: 'ErrorAccessDenied', message: 'Access is denied.' } }),
    });
    expect(graphDenied.code).toBe('scope_required');
    expect(graphDenied.message).not.toContain('Access is denied');
    const rate = mapProviderError({
      status: 403,
      text: JSON.stringify({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }),
    });
    expect(rate.code).toBe('provider_unavailable');
    expect(rate.retryAfterSec).toBe(60);
    expect(mapProviderError({ status: 403 }).code).toBe('forbidden');
    expect(mapProviderError({ status: 404 }).code).toBe('not_found');
    const gone = mapProviderError({ status: 410 });
    expect(gone.code).toBe('not_found');
    expect(gone.details?.status).toBe(410);
    const throttled = mapProviderError({ status: 429, retryAfter: '17' });
    expect(throttled.code).toBe('provider_unavailable');
    expect(throttled.retryAfterSec).toBe(17);
    expect(mapProviderError({ status: 503 }).retryAfterSec).toBe(30);
    expect(mapProviderError({ status: 400 }).code).toBe('validation');
    expect(mapProviderError({ status: 409 }).code).toBe('conflict');
  });

  it('sends bearer auth, parses JSON and maps failures', async () => {
    const { fetch, calls } = stubFetch([
      { match: /\/ok$/, handler: () => json({ ok: true }) },
      {
        match: /\/expired$/,
        handler: () => json({ error: { code: 'InvalidAuthenticationToken' } }, 401),
      },
      { match: /\/empty$/, handler: () => empty(200) },
    ]);
    const result = await providerRequest<{ ok: boolean }>(fetch, {
      url: 'https://api.test/ok',
      token: TOKEN,
    });
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    const expired = await rejection(
      providerRequest(fetch, { url: 'https://api.test/expired', token: TOKEN }),
    );
    expect(isAppError(expired) && expired.code).toBe('oauth_expired');
    const emptyBody = await rejection(
      providerRequest(fetch, { url: 'https://api.test/empty', token: TOKEN }),
    );
    expect(isAppError(emptyBody) && emptyBody.code).toBe('internal');
  });

  it('aborts slow calls and reports a timeout', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    const error = await rejection(
      providerRequest(fetch, { url: 'https://api.test/slow', token: TOKEN, timeoutMs: 10 }),
    );
    expect(isAppError(error) && error.code).toBe('provider_unavailable');
    expect(isAppError(error) && error.details?.reason).toBe('timeout');
  });
});

// --- Gmail ----------------------------------------------------------------------------------------

function gmailFixture(overrides: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: '18f3a2b1c9d0e7f6',
    threadId: '18f3a2b1c9d0e000',
    labelIds: ['UNREAD', 'IMPORTANT', 'CATEGORY_PERSONAL', 'INBOX'],
    snippet: 'Merhaba Ay&#351;e, teklifi Cuma g&#252;n&#252;ne kadar g&#246;nderebilir misin?',
    historyId: '4521987',
    internalDate: String(Date.UTC(2026, 8, 5, 7, 59, 30)),
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'From', value: 'Ahmet Yılmaz <ahmet.yilmaz@example.com>' },
        { name: 'To', value: 'Ayşe Demir <ayse@example.com>' },
        { name: 'Cc', value: 'selin@example.com' },
        { name: 'Subject', value: '=?UTF-8?B?WW50OiBUZWtsaWYgZG9zeWFzxLE=?=' },
        { name: 'Date', value: 'Sat, 05 Sep 2026 10:59:30 +0300' },
        { name: 'Message-ID', value: '<CAF+abc123@mail.gmail.com>' },
        { name: 'In-Reply-To', value: '<orig-1@example.com>' },
        { name: 'References', value: '<root@example.com> <orig-1@example.com>' },
      ],
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }],
              body: {
                size: 70,
                data: encodeBase64Url(
                  'Merhaba Ayşe,\n\nteklifi Cuma gününe kadar gönderebilir misin?\n\nAhmet',
                ),
              },
            },
            {
              mimeType: 'text/html',
              body: {
                size: 90,
                data: encodeBase64Url('<div>Merhaba Ayşe,<br>teklifi Cuma gününe kadar…</div>'),
              },
            },
          ],
        },
        {
          mimeType: 'application/pdf',
          filename: 'teklif.pdf',
          body: { attachmentId: 'ANGjdJ8x', size: 48211 },
        },
      ],
    },
    ...overrides,
  };
}

describe('providers/gmail', () => {
  it('normalises a full-format message', () => {
    const draft = normalizeGmailMessage(gmailFixture(), { userEmail: USER });
    expect(draft.externalMessageId).toBe('18f3a2b1c9d0e7f6');
    expect(draft.externalThreadId).toBe('18f3a2b1c9d0e000');
    expect(draft.from).toEqual({ name: 'Ahmet Yılmaz', email: 'ahmet.yilmaz@example.com' });
    expect(draft.to).toEqual([{ name: 'Ayşe Demir', email: 'ayse@example.com' }]);
    expect(draft.cc).toEqual([{ name: null, email: 'selin@example.com' }]);
    expect(draft.subject).toBe('Ynt: Teklif dosyası');
    expect(draft.bodyText).toBe(
      'Merhaba Ayşe,\n\nteklifi Cuma gününe kadar gönderebilir misin?\n\nAhmet',
    );
    expect(draft.snippet).toBe('Merhaba Ayşe, teklifi Cuma gününe kadar gönderebilir misin?');
    expect(draft.sentAt).toBe('2026-09-05T07:59:30.000Z');
    expect(draft.receivedAt).toBe('2026-09-05T07:59:30.000Z');
    expect(draft.isRead).toBe(false);
    expect(draft.isStarred).toBe(false);
    expect(draft.isFromUser).toBe(false);
    expect(draft.hasAttachments).toBe(true);
    expect(draft.attachments).toEqual([
      { id: 'ANGjdJ8x', filename: 'teklif.pdf', mimeType: 'application/pdf', size: 48211 },
    ]);
    expect(draft.labels).toContain('INBOX');
    expect(draft.rfcMessageId).toBe('CAF+abc123@mail.gmail.com');
    expect(draft.inReplyTo).toBe('orig-1@example.com');
    expect(draft.references).toEqual(['root@example.com', 'orig-1@example.com']);
    expect(draft.webUrl).toContain('18f3a2b1c9d0e7f6');
  });

  it('falls back to html→text and marks sent mail as from the user', () => {
    const raw = gmailFixture({
      labelIds: ['SENT'],
      payload: {
        mimeType: 'text/html',
        headers: [
          { name: 'From', value: 'Ayşe Demir <AYSE@example.com>' },
          { name: 'Subject', value: 'Plan' },
        ],
        body: { data: encodeBase64Url('<p>Yarın 10:00 uygun mu?</p>') },
      },
    });
    const draft = normalizeGmailMessage(raw, { userEmail: USER });
    expect(draft.bodyText).toBe('Yarın 10:00 uygun mu?');
    expect(draft.isFromUser).toBe(true);
    expect(draft.isRead).toBe(true);
    expect(draft.attachments).toEqual([]);
  });

  it('syncs from history, fetching changed messages and reporting deletions', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/history\?/,
        handler: (url) => {
          expect(url.searchParams.get('startHistoryId')).toBe('4521000');
          expect(url.searchParams.getAll('historyTypes')).toContain('messageDeleted');
          return json({
            history: [
              { id: '4521100', messagesAdded: [{ message: { id: 'm1', threadId: 't1' } }] },
              { id: '4521200', messagesDeleted: [{ message: { id: 'm0', threadId: 't0' } }] },
              {
                id: '4521300',
                labelsAdded: [{ message: { id: 'm2', threadId: 't2' }, labelIds: ['TRASH'] }],
              },
            ],
            historyId: '4522000',
          });
        },
      },
      {
        match: /\/messages\/m1\?/,
        handler: () => json(gmailFixture({ id: 'm1', threadId: 't1' })),
      },
      {
        match: /\/messages\/m2\?/,
        handler: () => json(gmailFixture({ id: 'm2', threadId: 't2', labelIds: ['TRASH'] })),
      },
    ]);
    const client = createGmailClient(fetch, TOKEN, { userEmail: USER });
    const delta = await client.syncMail({ cursor: '4521000' });
    expect(delta.messages.map((m) => m.externalMessageId)).toEqual(['m1']);
    expect(delta.deletedExternalIds.sort()).toEqual(['m0', 'm2']);
    expect(delta.nextCursor).toBe('4522000');
    expect(delta.hasMore).toBe(false);
    expect(delta.fullResyncRequired).toBeUndefined();
    expect(calls.every((c) => c.headers.authorization === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('asks for a full resync when the history id is gone (404)', async () => {
    const { fetch } = stubFetch([
      {
        match: /\/history\?/,
        handler: () =>
          json({ error: { code: 404, message: 'Requested entity was not found.' } }, 404),
      },
    ]);
    const client = createGmailClient(fetch, TOKEN);
    const delta = await client.syncMail({ cursor: '1' });
    expect(delta).toMatchObject({
      fullResyncRequired: true,
      messages: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('backfills without a cursor and anchors the cursor before listing', async () => {
    const order: string[] = [];
    const { fetch } = stubFetch([
      {
        match: /\/profile$/,
        handler: () => {
          order.push('profile');
          return json({ emailAddress: USER, historyId: '9000' });
        },
      },
      {
        match: /\/messages\?/,
        handler: (url) => {
          order.push('list');
          expect(url.searchParams.get('q')).toBe(
            'newer_than:3d -in:spam -in:trash -in:chats -category:promotions -category:social',
          );
          expect(url.searchParams.get('maxResults')).toBe('2');
          return json({ messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'page-2' });
        },
      },
      { match: /\/messages\/a\?/, handler: () => json(gmailFixture({ id: 'a' })) },
      {
        match: /\/messages\/b\?/,
        handler: () => json(gmailFixture({ id: 'b', labelIds: ['CATEGORY_PROMOTIONS', 'INBOX'] })),
      },
    ]);
    const client = createGmailClient(fetch, TOKEN);
    const delta = await client.syncMail({ cursor: null, maxMessages: 2, backfillWindowHours: 72 });
    expect(order).toEqual(['profile', 'list']);
    expect(delta.messages.map((m) => m.externalMessageId)).toEqual(['a']);
    expect(delta.nextCursor).toBe('9000');
    expect(delta.nextPageToken).toBe('page-2');
    expect(delta.hasMore).toBe(true);
    // Continuation pages keep the cursor (null = unchanged) and do not hit the profile again.
    const { fetch: fetch2, calls } = stubFetch([
      { match: /\/messages\?/, handler: () => json({ messages: [] }) },
    ]);
    const next = await createGmailClient(fetch2, TOKEN).syncMail({
      cursor: '9000',
      pageToken: 'page-2',
    });
    expect(next.nextCursor).toBeNull();
    expect(next.hasMore).toBe(false);
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/gmail/v1/users/me/messages']);
  });

  it('threads replies by looking up the original headers and sends in the thread', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/messages\/orig-id\?/,
        handler: (url) => {
          expect(url.searchParams.get('format')).toBe('metadata');
          expect(url.searchParams.getAll('metadataHeaders')).toEqual([
            'Message-ID',
            'References',
            'In-Reply-To',
            'Subject',
          ]);
          return json({
            id: 'orig-id',
            threadId: 't-1',
            payload: {
              headers: [
                { name: 'Message-ID', value: '<orig-mid@example.com>' },
                { name: 'References', value: '<root@example.com>' },
                { name: 'Subject', value: 'Teklif' },
              ],
            },
          });
        },
      },
      {
        match: /\/messages\/send$/,
        method: 'POST',
        handler: () => json({ id: 'sent-1', threadId: 't-1' }),
      },
    ]);
    const client = createGmailClient(fetch, TOKEN, { userEmail: USER });
    const result = await client.sendMessage({
      to: [{ name: 'Ahmet Yılmaz', email: 'ahmet@example.com' }],
      subject: 'Ynt: Teklif',
      bodyText: 'Ekte.',
      inReplyToExternalMessageId: 'orig-id',
    });
    expect(result).toEqual({ externalMessageId: 'sent-1', externalThreadId: 't-1' });
    const send = calls.find((c) => c.url.endsWith('/messages/send'));
    const body = send?.body as { raw: string; threadId?: string };
    expect(body.threadId).toBe('t-1');
    const raw = decodeBase64Url(body.raw);
    expect(raw).toContain('From: ayse@example.com');
    expect(raw).toContain('In-Reply-To: <orig-mid@example.com>');
    expect(raw).toContain('References: <root@example.com>\r\n <orig-mid@example.com>');
  });

  it('maps a 403 on modify to scope_required with the modify scope', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/modify$/,
        method: 'POST',
        handler: () =>
          json({ error: { code: 403, errors: [{ reason: 'insufficientPermissions' }] } }, 403),
      },
    ]);
    const client = createGmailClient(fetch, TOKEN);
    const error = await rejection(client.markRead('m1'));
    expect(isAppError(error) && error.code).toBe('scope_required');
    expect(isAppError(error) && error.requiredScope).toBe(
      'https://www.googleapis.com/auth/gmail.modify',
    );
    expect(calls[0]?.body).toEqual({ addLabelIds: [], removeLabelIds: ['UNREAD'] });
  });

  it('starts and stops watches', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/watch$/,
        method: 'POST',
        handler: () => json({ historyId: '123', expiration: String(Date.parse(NOW)) }),
      },
      { match: /\/stop$/, method: 'POST', handler: () => empty() },
    ]);
    const client = createGmailClient(fetch, TOKEN);
    const watch = await client.watch({
      topicName: 'projects/da/topics/gmail',
      labelIds: ['INBOX'],
    });
    expect(watch).toEqual({
      subscriptionId: 'projects/da/topics/gmail',
      expiresAt: NOW,
      historyId: '123',
    });
    expect(calls[0]?.body).toEqual({ topicName: 'projects/da/topics/gmail', labelIds: ['INBOX'] });
    await client.stopWatch();
    expect(calls[1]?.method).toBe('POST');
  });
});

// --- Google Calendar --------------------------------------------------------------------------------

function googleEventFixture(overrides: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return {
    id: 'evt-1',
    status: 'confirmed',
    htmlLink: 'https://www.google.com/calendar/event?eid=abc',
    summary: 'Teklif görüşmesi',
    description: 'Gündem: fiyatlandırma',
    location: 'Levent Ofis',
    start: { dateTime: '2026-09-05T14:00:00+03:00', timeZone: 'Europe/Istanbul' },
    end: { dateTime: '2026-09-05T15:00:00+03:00', timeZone: 'Europe/Istanbul' },
    attendees: [
      {
        email: 'ahmet@example.com',
        displayName: 'Ahmet Yılmaz',
        organizer: true,
        responseStatus: 'accepted',
      },
      { email: USER, self: true, responseStatus: 'needsAction' },
      { email: 'room-3@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
    ],
    organizer: { email: 'ahmet@example.com', displayName: 'Ahmet Yılmaz' },
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    updated: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('providers/gcal', () => {
  it('normalises timed events with attendees and conference links', () => {
    const draft = normalizeGoogleEvent(googleEventFixture(), { userEmail: USER });
    expect(draft.externalEventId).toBe('evt-1');
    expect(draft.calendarId).toBe('primary');
    expect(draft.title).toBe('Teklif görüşmesi');
    expect(draft.startAt).toBe('2026-09-05T11:00:00.000Z');
    expect(draft.endAt).toBe('2026-09-05T12:00:00.000Z');
    expect(draft.allDay).toBe(false);
    expect(draft.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(draft.meetingProvider).toBe('google_meet');
    expect(draft.attendees).toEqual([
      {
        name: 'Ahmet Yılmaz',
        email: 'ahmet@example.com',
        contactId: null,
        isOrganizer: true,
        responseStatus: 'accepted',
      },
      {
        name: null,
        email: USER,
        contactId: null,
        isOrganizer: false,
        responseStatus: 'needsAction',
      },
    ]);
    expect(draft.organizerIsUser).toBe(false);
    expect(draft.status).toBe('confirmed');
    expect(draft.providerUpdatedAt).toBe('2026-09-01T10:00:00.000Z');
    expect(draft.source).toBe('google_calendar');
    expect(draft.isAiCreated).toBe(false);
    expect(draft.webUrl).toContain('eid=abc');
  });

  it('anchors all-day events at local midnight and flags the organiser', () => {
    const draft = normalizeGoogleEvent(
      googleEventFixture({
        start: { date: '2026-09-07' },
        end: { date: '2026-09-08' },
        organizer: { email: USER, self: true },
        hangoutLink: undefined,
        conferenceData: {
          conferenceSolution: { key: { type: 'addOn' } },
          entryPoints: [{ entryPointType: 'video', uri: 'https://us02web.zoom.us/j/123' }],
        },
        recurringEventId: 'series-1',
      }),
      { userEmail: USER, defaultTimezone: 'Europe/Istanbul' },
    );
    expect(draft.allDay).toBe(true);
    expect(draft.startAt).toBe('2026-09-06T21:00:00.000Z');
    expect(draft.endAt).toBe('2026-09-07T21:00:00.000Z');
    expect(draft.organizerIsUser).toBe(true);
    expect(draft.meetingProvider).toBe('zoom');
    expect(draft.recurringEventId).toBe('series-1');
  });

  it('syncs with a time window first, then with the sync token, and handles 410', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/calendars\/primary\/events\?/,
        handler: (url) => {
          if (url.searchParams.get('syncToken') === 'stale') {
            return json({ error: { code: 410, errors: [{ reason: 'fullSyncRequired' }] } }, 410);
          }
          expect(url.searchParams.get('singleEvents')).toBe('true');
          expect(url.searchParams.get('showDeleted')).toBe('true');
          expect(url.searchParams.get('timeMin')).toBe('2026-08-06T08:00:00.000Z');
          expect(url.searchParams.get('timeMax')).toBe('2026-12-04T08:00:00.000Z');
          return json({
            items: [
              googleEventFixture(),
              googleEventFixture({ id: 'evt-gone', status: 'cancelled' }),
            ],
            nextSyncToken: 'sync-1',
          });
        },
      },
    ]);
    const client = createGoogleCalendarClient(fetch, TOKEN, { userEmail: USER });
    const delta = await client.syncCalendar({ cursor: null, now: NOW });
    expect(delta.events.map((e) => e.externalEventId)).toEqual(['evt-1']);
    expect(delta.deletedExternalIds).toEqual(['evt-gone']);
    expect(delta.nextCursor).toBe('sync-1');
    expect(delta.hasMore).toBe(false);
    expect(new URL(calls[0]?.url ?? '').searchParams.has('syncToken')).toBe(false);

    const stale = await client.syncCalendar({ cursor: 'stale', now: NOW });
    expect(stale.fullResyncRequired).toBe(true);
    expect(stale.events).toEqual([]);
  });

  it('creates events with attendees and Meet requests', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/events\?/,
        method: 'POST',
        handler: () => json({ id: 'new-1', htmlLink: 'https://cal/new-1' }),
      },
    ]);
    const client = createGoogleCalendarClient(fetch, TOKEN);
    const result = await client.createEvent({
      title: 'Planlama',
      startAt: '2026-09-08T07:00:00.000Z',
      endAt: '2026-09-08T08:00:00.000Z',
      attendees: [{ name: 'Selin Kaya', email: 'selin@example.com' }],
      timezone: 'Europe/Istanbul',
      conferenceRequested: true,
    });
    expect(result).toEqual({ externalEventId: 'new-1', htmlLink: 'https://cal/new-1' });
    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('sendUpdates')).toBe('all');
    expect(url.searchParams.get('conferenceDataVersion')).toBe('1');
    expect(calls[0]?.body).toMatchObject({
      summary: 'Planlama',
      start: { dateTime: '2026-09-08T07:00:00.000Z', timeZone: 'Europe/Istanbul' },
      attendees: [{ email: 'selin@example.com', displayName: 'Selin Kaya' }],
      conferenceData: { createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    });
  });
});

// --- Microsoft Graph --------------------------------------------------------------------------------

function graphMessageFixture(overrides: Partial<GraphMessage> = {}): GraphMessage {
  return {
    id: 'AAMkAGI2',
    conversationId: 'AAQkAGI2',
    subject: 'RE: Sözleşme taslağı',
    bodyPreview: 'Merhaba Ayşe, taslağı inceledim; iki küçük not ekledim.',
    body: {
      contentType: 'text',
      content: 'Merhaba Ayşe,\n\ntaslağı inceledim; iki küçük not ekledim.\n\nMehmet',
    },
    from: { emailAddress: { name: 'Mehmet Yılmaz', address: 'Mehmet.Yilmaz@contoso.com' } },
    toRecipients: [{ emailAddress: { name: 'Ayşe Demir', address: USER } }],
    ccRecipients: [],
    receivedDateTime: '2026-09-05T07:45:12Z',
    sentDateTime: '2026-09-05T07:45:00Z',
    isRead: false,
    isDraft: false,
    hasAttachments: true,
    internetMessageId: '<abc@contoso.com>',
    webLink: 'https://outlook.office365.com/owa/?ItemID=AAMkAGI2',
    flag: { flagStatus: 'flagged' },
    categories: ['Müşteri'],
    attachments: [
      {
        id: 'att-1',
        name: 'sozlesme.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 20480,
      },
      { id: 'att-2', name: 'logo.png', contentType: 'image/png', size: 900, isInline: true },
    ],
    ...overrides,
  };
}

function graphEventFixture(overrides: Partial<GraphEvent> = {}): GraphEvent {
  return {
    id: 'AAMkEvt1',
    subject: 'Haftalık planlama',
    bodyPreview: 'Gündem',
    body: { contentType: 'html', content: '<p>Gündem: <b>Q4</b></p>' },
    start: { dateTime: '2026-09-08T07:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-09-08T08:00:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    isCancelled: false,
    isOrganizer: false,
    location: { displayName: 'Microsoft Teams Meeting' },
    attendees: [
      {
        emailAddress: { name: 'Mehmet Yılmaz', address: 'mehmet@contoso.com' },
        type: 'required',
        status: { response: 'organizer' },
      },
      {
        emailAddress: { name: 'Ayşe Demir', address: USER },
        type: 'required',
        status: { response: 'tentativelyAccepted' },
      },
      {
        emailAddress: { name: 'Oda 3', address: 'oda3@contoso.com' },
        type: 'resource',
        status: { response: 'accepted' },
      },
    ],
    organizer: { emailAddress: { name: 'Mehmet Yılmaz', address: 'mehmet@contoso.com' } },
    onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x' },
    onlineMeetingProvider: 'teamsForBusiness',
    webLink: 'https://outlook.office365.com/calendar/item/AAMkEvt1',
    lastModifiedDateTime: '2026-09-02T09:00:00Z',
    seriesMasterId: 'AAMkSeries',
    type: 'occurrence',
    showAs: 'busy',
    responseStatus: { response: 'tentativelyAccepted' },
    ...overrides,
  };
}

describe('providers/graph', () => {
  it('normalises messages, events and tasks', () => {
    const message = normalizeGraphMessage(graphMessageFixture(), { userEmail: USER });
    expect(message.externalMessageId).toBe('AAMkAGI2');
    expect(message.externalThreadId).toBe('AAQkAGI2');
    expect(message.from).toEqual({ name: 'Mehmet Yılmaz', email: 'mehmet.yilmaz@contoso.com' });
    expect(message.to).toEqual([{ name: 'Ayşe Demir', email: USER }]);
    expect(message.subject).toBe('RE: Sözleşme taslağı');
    expect(message.bodyText).toContain('iki küçük not ekledim');
    expect(message.snippet).toBe('Merhaba Ayşe, taslağı inceledim; iki küçük not ekledim.');
    expect(message.sentAt).toBe('2026-09-05T07:45:00.000Z');
    expect(message.receivedAt).toBe('2026-09-05T07:45:12.000Z');
    expect(message.isRead).toBe(false);
    expect(message.isStarred).toBe(true);
    expect(message.isFromUser).toBe(false);
    expect(message.attachments).toEqual([
      {
        id: 'att-1',
        filename: 'sozlesme.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 20480,
      },
    ]);
    expect(message.labels).toEqual(['Müşteri']);
    expect(message.rfcMessageId).toBe('abc@contoso.com');
    const htmlMessage = normalizeGraphMessage(
      graphMessageFixture({
        body: { contentType: 'html', content: '<p>Selam<br>d&uuml;nya</p>' },
        from: { emailAddress: { address: USER } },
      }),
      { userEmail: USER },
    );
    expect(htmlMessage.bodyText).toBe('Selam\ndünya');
    expect(htmlMessage.isFromUser).toBe(true);

    const event = normalizeGraphEvent(graphEventFixture(), {
      userEmail: USER,
      defaultTimezone: 'Europe/Istanbul',
    });
    expect(event.startAt).toBe('2026-09-08T07:00:00.000Z');
    expect(event.endAt).toBe('2026-09-08T08:00:00.000Z');
    expect(event.title).toBe('Haftalık planlama');
    expect(event.description).toBe('Gündem: Q4');
    expect(event.meetingUrl).toContain('teams.microsoft.com');
    expect(event.meetingProvider).toBe('teams');
    expect(event.attendees).toEqual([
      {
        name: 'Mehmet Yılmaz',
        email: 'mehmet@contoso.com',
        contactId: null,
        isOrganizer: true,
        responseStatus: 'accepted',
      },
      {
        name: 'Ayşe Demir',
        email: USER,
        contactId: null,
        isOrganizer: false,
        responseStatus: 'tentative',
      },
    ]);
    expect(event.organizerIsUser).toBe(false);
    expect(event.status).toBe('tentative');
    expect(event.recurringEventId).toBe('AAMkSeries');
    expect(event.source).toBe('microsoft_calendar');
    const allDay = normalizeGraphEvent(
      graphEventFixture({
        isAllDay: true,
        start: { dateTime: '2026-09-10T00:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-09-11T00:00:00.0000000', timeZone: 'UTC' },
        isCancelled: true,
      }),
      { defaultTimezone: 'Europe/Istanbul' },
    );
    expect(allDay.allDay).toBe(true);
    expect(allDay.startAt).toBe('2026-09-09T21:00:00.000Z');
    expect(allDay.endAt).toBe('2026-09-10T21:00:00.000Z');
    expect(allDay.status).toBe('cancelled');
    expect(
      parseGraphDateTime({
        dateTime: '2026-09-05T10:30:00.0000000',
        timeZone: 'Turkey Standard Time',
      }),
    ).toBe('2026-09-05T07:30:00.000Z');

    const task = normalizeGraphTask(
      {
        id: 'task-1',
        title: 'Teklifi gönder',
        body: { contentType: 'text', content: 'PDF olarak' },
        status: 'notStarted',
        importance: 'high',
        dueDateTime: { dateTime: '2026-09-06T00:00:00.0000000', timeZone: 'UTC' },
        lastModifiedDateTime: '2026-09-05T06:00:00Z',
      },
      { listId: 'L1' },
    );
    expect(task).toMatchObject({
      externalTaskId: 'task-1',
      externalListId: 'L1',
      title: 'Teklifi gönder',
      notes: 'PDF olarak',
      dueAt: '2026-09-06T00:00:00.000Z',
      status: 'open',
      completedAt: null,
      provider: 'microsoft',
      priority: 'high',
      providerUpdatedAt: '2026-09-05T06:00:00.000Z',
    });
  });

  it('follows nextLink pages across folders and persists a JSON cursor of delta links', async () => {
    const inboxDelta =
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=inboxDelta';
    const sentDelta =
      'https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages/delta?$deltatoken=sentDelta';
    const { fetch, calls } = stubFetch([
      {
        match: /skiptoken=page2/,
        handler: () =>
          json({
            value: [
              graphMessageFixture({ id: 'm2' }),
              { id: 'gone', '@removed': { reason: 'deleted' } },
            ],
            '@odata.deltaLink': inboxDelta,
          }),
      },
      {
        match: /deltatoken=inboxDelta/,
        handler: () => json({ value: [], '@odata.deltaLink': inboxDelta }),
      },
      {
        match: /\/mailFolders\/inbox\/messages\/delta/,
        handler: (url) => {
          expect(url.searchParams.get('$filter')).toBe(
            'receivedDateTime ge 2026-09-02T08:00:00.000Z',
          );
          expect(url.searchParams.get('$select')).toContain('conversationId');
          return json({
            value: [
              graphMessageFixture({ id: 'm1' }),
              graphMessageFixture({ id: 'draft', isDraft: true }),
            ],
            '@odata.nextLink':
              'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$skiptoken=page2',
          });
        },
      },
      {
        match: /\/mailFolders\/sentitems\/messages\/delta/,
        handler: () => json({ value: [], '@odata.deltaLink': sentDelta }),
      },
    ]);
    const client = createGraphClient(fetch, TOKEN, { userEmail: USER });
    const delta = await client.mail.sync({ cursor: null, now: NOW });
    expect(delta.messages.map((m) => m.externalMessageId)).toEqual(['m1', 'm2']);
    expect(delta.deletedExternalIds).toEqual(['gone']);
    expect(delta.hasMore).toBe(false);
    expect(decodeGraphMailCursor(delta.nextCursor)).toEqual({
      inbox: inboxDelta,
      sentitems: sentDelta,
    });
    expect(calls[0]?.headers.prefer).toContain('outlook.body-content-type="text"');
    expect(calls.map((c) => c.url)).toHaveLength(3);

    const second = await client.mail.sync({ cursor: delta.nextCursor, now: NOW });
    expect(second.messages).toEqual([]);
    expect(calls[3]?.url).toBe(inboxDelta);
    expect(decodeGraphMailCursor(second.nextCursor)).toEqual({
      inbox: inboxDelta,
      sentitems: sentDelta,
    });
  });

  it('flags a full resync when the delta state is gone (410)', async () => {
    const { fetch } = stubFetch([
      {
        match: /\/messages\/delta/,
        handler: () => json({ error: { code: 'SyncStateNotFound', message: 'gone' } }, 410),
      },
      {
        match: /\/calendarView\/delta/,
        handler: () => json({ error: { code: 'SyncStateNotFound' } }, 410),
      },
    ]);
    const client = createGraphClient(fetch, TOKEN);
    expect(
      (
        await client.mail.sync({
          cursor:
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=x',
        })
      ).fullResyncRequired,
    ).toBe(true);
    expect(
      (
        await client.calendar.sync({
          cursor: 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=y',
        })
      ).fullResyncRequired,
    ).toBe(true);
  });

  it('replies through createReply → PATCH → send so the id is real', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/me\/messages\/orig-id\/createReply$/,
        method: 'POST',
        handler: () =>
          json({
            id: 'draft-1',
            conversationId: 'conv-1',
            body: { contentType: 'html', content: '<div>quoted</div>' },
          }),
      },
      {
        match: /\/me\/messages\/draft-1$/,
        method: 'PATCH',
        handler: () => json({ id: 'draft-1' }),
      },
      { match: /\/me\/messages\/draft-1\/send$/, method: 'POST', handler: () => empty(202) },
    ]);
    const client = createGraphClient(fetch, TOKEN);
    const result = await client.mail.send({
      to: [{ name: 'Mehmet', email: 'mehmet@contoso.com' }],
      subject: 'RE: Sözleşme',
      bodyText: 'Notları gördüm,\nteşekkürler.',
      inReplyToExternalMessageId: 'orig-id',
      externalThreadId: 'ignored-when-known',
    });
    expect(result).toEqual({ externalMessageId: 'draft-1', externalThreadId: 'conv-1' });
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'POST /v1.0/me/messages/orig-id/createReply',
      'PATCH /v1.0/me/messages/draft-1',
      'POST /v1.0/me/messages/draft-1/send',
    ]);
    const patch = calls[1]?.body as {
      body: { contentType: string; content: string };
      toRecipients: unknown[];
    };
    expect(patch.body.contentType).toBe('html');
    expect(patch.body.content).toBe('<p>Notları gördüm,<br>teşekkürler.</p><br><div>quoted</div>');
    expect(patch.toRecipients).toEqual([
      { emailAddress: { address: 'mehmet@contoso.com', name: 'Mehmet' } },
    ]);
    expect(calls.every((c) => c.headers.prefer?.includes('IdType="ImmutableId"'))).toBe(true);
  });

  it('sends new mail via a draft and creates tasks in the default list', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/me\/messages$/,
        method: 'POST',
        handler: () => json({ id: 'new-1', conversationId: 'conv-new' }),
      },
      { match: /\/me\/messages\/new-1\/send$/, method: 'POST', handler: () => empty(202) },
      {
        match: /\/me\/todo\/lists$/,
        handler: () =>
          json({
            value: [
              { id: 'L1', wellknownListName: 'none' },
              { id: 'L2', wellknownListName: 'defaultList' },
            ],
          }),
      },
      {
        match: /\/me\/todo\/lists\/L2\/tasks$/,
        method: 'POST',
        handler: () => json({ id: 'task-9' }),
      },
    ]);
    const client = createGraphClient(fetch, TOKEN);
    const sent = await client.mail.send({
      to: [{ email: 'a@b.c' }],
      subject: 'Merhaba',
      bodyText: 'Selam',
      bodyHtml: '<p>Selam</p>',
    });
    expect(sent).toEqual({ externalMessageId: 'new-1', externalThreadId: 'conv-new' });
    expect(calls[0]?.body).toMatchObject({
      subject: 'Merhaba',
      body: { contentType: 'html', content: '<p>Selam</p>' },
    });
    const task = await client.tasks.createTask(null, {
      title: 'Teklif',
      notes: null,
      dueAt: '2026-09-06T15:00:00Z',
    });
    expect(task).toEqual({ externalTaskId: 'task-9', listId: 'L2' });
    expect(calls[3]?.body).toEqual({
      title: 'Teklif',
      dueDateTime: { dateTime: '2026-09-06T00:00:00', timeZone: 'UTC' },
    });
  });

  it('creates calendar events in the user zone and manages subscriptions', async () => {
    const { fetch, calls } = stubFetch([
      {
        match: /\/me\/events$/,
        method: 'POST',
        handler: () => json({ id: 'evt-new', webLink: 'https://outlook/evt-new' }),
      },
      {
        match: /\/subscriptions$/,
        method: 'POST',
        handler: () =>
          json({
            id: 'sub-1',
            resource: "me/mailFolders('inbox')/messages",
            changeType: 'created',
            expirationDateTime: '2026-09-08T06:30:00.0000000Z',
            notificationUrl: 'https://x/y',
          }),
      },
      { match: /\/subscriptions\/sub-1$/, method: 'DELETE', handler: () => empty() },
    ]);
    const client = createGraphClient(fetch, TOKEN);
    const created = await client.calendar.createEvent({
      title: 'Planlama',
      startAt: '2026-09-08T07:00:00.000Z',
      endAt: '2026-09-08T08:00:00.000Z',
      timezone: 'Europe/Istanbul',
      attendees: [{ email: 'selin@example.com', name: 'Selin' }],
      conferenceRequested: true,
    });
    expect(created).toEqual({ externalEventId: 'evt-new', htmlLink: 'https://outlook/evt-new' });
    expect(calls[0]?.body).toMatchObject({
      subject: 'Planlama',
      start: { dateTime: '2026-09-08T10:00:00', timeZone: 'Europe/Istanbul' },
      end: { dateTime: '2026-09-08T11:00:00', timeZone: 'Europe/Istanbul' },
      isAllDay: false,
      attendees: [
        { emailAddress: { address: 'selin@example.com', name: 'Selin' }, type: 'required' },
      ],
      isOnlineMeeting: true,
    });
    const sub = await client.subscriptions.create({
      resource: "me/mailFolders('inbox')/messages",
      changeType: 'created',
      notificationUrl: 'https://x/y',
      clientState: 'secret',
      expirationMinutes: 99999,
      now: NOW,
    });
    expect(sub).toEqual({ subscriptionId: 'sub-1', expiresAt: '2026-09-08T06:30:00.000Z' });
    expect((calls[1]?.body as { expirationDateTime: string }).expirationDateTime).toBe(
      '2026-09-08T06:30:00.000Z',
    );
    await client.subscriptions.delete('sub-1');
    expect(calls[2]?.method).toBe('DELETE');
  });
});

// --- Factory ------------------------------------------------------------------------------------------

describe('providers/providerClients', () => {
  it('exposes a uniform surface for both providers', async () => {
    const { fetch } = stubFetch([
      { match: /\/messages\/m1\?/, handler: () => json(gmailFixture({ id: 'm1' })) },
      { match: /\/me\/messages\/AAMkAGI2\?/, handler: () => json(graphMessageFixture()) },
    ]);
    const google = providerClients('google', fetch, TOKEN, { userEmail: USER });
    const microsoft = providerClients('microsoft', fetch, TOKEN, { userEmail: USER });
    for (const clients of [google, microsoft]) {
      expect(typeof clients.mail.sync).toBe('function');
      expect(typeof clients.mail.send).toBe('function');
      expect(typeof clients.mail.markRead).toBe('function');
      expect(typeof clients.calendar.createEvent).toBe('function');
      expect(typeof clients.calendar.updateEvent).toBe('function');
      expect(typeof clients.calendar.deleteEvent).toBe('function');
      expect(typeof clients.tasks.createTask).toBe('function');
    }
    expect((await google.mail.getMessage('m1')).externalMessageId).toBe('m1');
    expect((await microsoft.mail.getMessage('AAMkAGI2')).externalThreadId).toBe('AAQkAGI2');
  });
});
