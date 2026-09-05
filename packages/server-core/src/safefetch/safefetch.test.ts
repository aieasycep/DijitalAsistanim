import { describe, expect, it } from 'vitest';
import {
  classifyIp,
  decodeHtmlEntities,
  extractReadableText,
  isBlockedHostname,
  parseContentType,
  parseIPv6,
  safeFetch,
  safeFetchError,
  safeFetchOrThrow,
  validateOutboundUrl,
  validateResolvedAddresses,
  type FetchLike,
  type SafeFetchRejectReason,
} from './index';

type Route = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Response factory so a route can be hit more than once (bodies are single-use). */
function respond(body: BodyInit | null, init: ResponseInit): Route {
  return () => new Response(body, init);
}

function html(body: string, init: ResponseInit = {}): Route {
  return respond(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

function redirect(location: string, status = 302): Route {
  return respond(null, { status, headers: { location } });
}

/** Deterministic fetch mock: records calls, serves routes by exact URL. */
function mockFetch(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: no route for ${url}`);
    return route(url, init);
  };
  return { fetch, calls };
}

async function expectReject(
  url: string,
  reason: SafeFetchRejectReason,
  opts: Parameters<typeof safeFetch>[1] = {},
) {
  const { fetch, calls } = mockFetch({});
  const result = await safeFetch(url, { fetch, ...opts });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toBe(reason);
  expect(calls).toHaveLength(0);
}

describe('safefetch/ip', () => {
  it('classifies IPv4 ranges', () => {
    const blocked = [
      '127.0.0.1',
      '127.255.255.254',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1',
      '100.127.255.255',
      '169.254.169.254',
      '0.0.0.0',
      '224.0.0.1',
      '239.255.255.255',
      '255.255.255.255',
      '192.0.2.10',
      '198.18.0.1',
      '203.0.113.5',
      '192.0.0.1',
    ];
    for (const ip of blocked)
      expect(classifyIp(ip), ip).toMatchObject({ version: 4, blocked: true });
    const allowed = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '11.0.0.1', '193.140.1.1'];
    for (const ip of allowed)
      expect(classifyIp(ip), ip).toMatchObject({ version: 4, blocked: false });
    expect(classifyIp('256.1.1.1')).toBeNull();
    expect(classifyIp('example.com')).toBeNull();
  });
  it('parses and classifies IPv6 forms', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6('2001:db8::1')?.[1]).toBe(0xdb8);
    expect(parseIPv6('1:2:3:4:5:6:7:8:9')).toBeNull();
    expect(parseIPv6('1::2::3')).toBeNull();
    expect(parseIPv6('gggg::1')).toBeNull();
    expect(parseIPv6('fe80::1%eth0')?.[0]).toBe(0xfe80);

    const blocked: [string, string][] = [
      ['::1', 'loopback'],
      ['::', 'unspecified'],
      ['[::1]', 'loopback'],
      ['::ffff:127.0.0.1', 'loopback'],
      ['::ffff:10.0.0.1', 'private'],
      ['::ffff:8.8.8.8', 'ipv4_mapped'],
      ['::8.8.8.8', 'ipv4_mapped'],
      ['fc00::1', 'unique_local'],
      ['fdab:1234::1', 'unique_local'],
      ['fe80::1', 'link_local'],
      ['febf::1', 'link_local'],
      ['fec0::1', 'site_local'],
      ['ff02::1', 'multicast'],
      ['2001:db8::1', 'documentation'],
      ['64:ff9b::7f00:1', 'nat64'],
      ['64:ff9b::10.0.0.1', 'nat64'],
      ['64:ff9b:1::1', 'nat64'],
      ['2002:7f00:1::1', 'tunnel'],
      ['2002:c0a8:101::1', 'tunnel'],
      ['2001::1', 'tunnel'],
      ['2001:10::1', 'reserved'],
      ['100::1', 'reserved'],
    ];
    for (const [ip, reason] of blocked)
      expect(classifyIp(ip), ip).toMatchObject({ version: 6, blocked: true, reason });
    for (const ip of [
      '2606:4700::1111',
      '2a00:1450:4001::1',
      '64:ff9b::808:808',
      '2002:808:808::1',
    ]) {
      expect(classifyIp(ip), ip).toMatchObject({ version: 6, blocked: false });
    }
  });
});

describe('safefetch/url', () => {
  it('accepts ordinary public urls and strips fragments', () => {
    const v = validateOutboundUrl('https://www.hurriyet.com.tr/gundem/haber-42#top');
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.url.href).toBe('https://www.hurriyet.com.tr/gundem/haber-42');
      expect(v.port).toBe(443);
      expect(v.isIpLiteral).toBe(false);
    }
    expect(validateOutboundUrl('http://8.8.8.8/x')).toMatchObject({ ok: true, isIpLiteral: true });
    expect(validateOutboundUrl('https://xn--trkiye-3ya.com/')).toMatchObject({ ok: true });
    expect(validateOutboundUrl('https://türkiye.com/')).toMatchObject({
      ok: true,
      hostname: 'xn--trkiye-3ya.com',
    });
  });
  it('rejects schemes, credentials, ports and malformed input', () => {
    expect(validateOutboundUrl('ftp://example.com/file')).toMatchObject({
      ok: false,
      reason: 'unsupported_scheme',
    });
    expect(validateOutboundUrl('file:///etc/passwd')).toMatchObject({
      ok: false,
      reason: 'unsupported_scheme',
    });
    expect(validateOutboundUrl('data:text/html,hi')).toMatchObject({
      ok: false,
      reason: 'unsupported_scheme',
    });
    expect(validateOutboundUrl('javascript:alert(1)')).toMatchObject({
      ok: false,
      reason: 'unsupported_scheme',
    });
    expect(validateOutboundUrl('http://user:pw@example.com/')).toMatchObject({
      ok: false,
      reason: 'credentials_in_url',
    });
    expect(validateOutboundUrl('http://user@example.com/')).toMatchObject({
      ok: false,
      reason: 'credentials_in_url',
    });
    expect(validateOutboundUrl('http://example.com:8080/')).toMatchObject({
      ok: false,
      reason: 'blocked_port',
    });
    expect(validateOutboundUrl('https://example.com:80/')).toMatchObject({ ok: true, port: 80 });
    expect(
      validateOutboundUrl('http://example.com:8443/', { allowedPorts: [80, 443, 8443] }),
    ).toMatchObject({ ok: true });
    expect(validateOutboundUrl('not a url')).toMatchObject({ ok: false, reason: 'invalid_url' });
    expect(validateOutboundUrl('')).toMatchObject({ ok: false, reason: 'invalid_url' });
  });
  it('rejects loopback / private / link-local hosts including obfuscated IPv4 forms', () => {
    const cases = [
      'http://localhost/',
      'http://LOCALHOST./',
      'http://127.0.0.1/',
      'http://127.1/',
      'http://0x7f000001/',
      'http://2130706433/',
      'http://0177.0.0.1/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:10.0.0.1]/',
      'http://[fc00::1]/',
      'http://[fe80::1]/',
      'http://10.0.0.1/',
      'http://192.168.0.10/',
      'http://172.16.5.4/',
      'http://100.64.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://224.0.0.1/',
      'http://0.0.0.0/',
    ];
    for (const url of cases) {
      const v = validateOutboundUrl(url);
      expect(v.ok, url).toBe(false);
      if (!v.ok) expect(['blocked_ip', 'blocked_host'], url).toContain(v.reason);
    }
  });
  it('rejects intranet-looking hostnames', () => {
    for (const url of [
      'http://printer.local/',
      'http://db.internal/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://intranet/',
      'http://metadata/',
      'http://instance-data/',
      'http://host.localdomain/',
      'http://wiki.corp/',
      'http://server.lan/',
      'http://foo.test/',
      'http://kubernetes/',
    ]) {
      expect(validateOutboundUrl(url), url).toMatchObject({ ok: false, reason: 'blocked_host' });
    }
    expect(isBlockedHostname('sub.example.com')).toBe(false);
    expect(isBlockedHostname('sub.example.com', ['example.com'])).toBe(true);
    expect(
      validateOutboundUrl('https://intra.firma.com.tr/', {
        blockedHostSuffixes: ['.firma.com.tr'],
      }),
    ).toMatchObject({
      ok: false,
      reason: 'blocked_host',
    });
  });
  it('validates resolver output', () => {
    expect(validateResolvedAddresses([])).toMatchObject({ ok: false, reason: 'dns_failed' });
    expect(validateResolvedAddresses(['8.8.8.8', '10.0.0.1'])).toMatchObject({
      ok: false,
      reason: 'dns_blocked',
      address: '10.0.0.1',
    });
    expect(validateResolvedAddresses(['garbage'])).toMatchObject({
      ok: false,
      reason: 'dns_blocked',
    });
    expect(validateResolvedAddresses(['8.8.8.8', '2606:4700::1111'])).toEqual({ ok: true });
  });
});

describe('safefetch/fetch', () => {
  it('fetches html with manual redirects and decodes text', async () => {
    const { fetch, calls } = mockFetch({
      'https://example.com/a': redirect('/b', 301),
      'https://example.com/b': redirect('https://cdn.example.org/c', 303),
      'https://cdn.example.org/c': html(
        '<html><head><title>Merhaba</title></head><body><p>Dünya</p></body></html>',
      ),
    });
    const result = await safeFetch('https://example.com/a#frag', { fetch });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe('https://example.com/a');
    expect(result.finalUrl).toBe('https://cdn.example.org/c');
    expect(result.redirects).toEqual(['https://example.com/b', 'https://cdn.example.org/c']);
    expect(result.mimeType).toBe('text/html');
    expect(result.charset).toBe('utf-8');
    expect(result.text).toContain('Dünya');
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.init.redirect === 'manual')).toBe(true);
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['user-agent']).toContain('DijitalAsistan');
    expect(headers.accept).toContain('text/html');
  });
  it('rejects every policy violation before touching the network', async () => {
    await expectReject('ftp://example.com/', 'unsupported_scheme');
    await expectReject('file:///etc/hosts', 'unsupported_scheme');
    await expectReject('data:text/plain,hi', 'unsupported_scheme');
    await expectReject('http://localhost/', 'blocked_host');
    await expectReject('http://127.0.0.1/', 'blocked_ip');
    await expectReject('http://[::1]/', 'blocked_ip');
    await expectReject('http://10.1.2.3/', 'blocked_ip');
    await expectReject('http://192.168.1.1/', 'blocked_ip');
    await expectReject('http://172.20.0.1/', 'blocked_ip');
    await expectReject('http://100.64.0.9/', 'blocked_ip');
    await expectReject('http://169.254.169.254/', 'blocked_ip');
    await expectReject('http://[fe80::1]/', 'blocked_ip');
    await expectReject('http://[fd12::1]/', 'blocked_ip');
    await expectReject('http://[::ffff:192.168.0.1]/', 'blocked_ip');
    await expectReject('http://foo.local/', 'blocked_host');
    await expectReject('http://api.internal/', 'blocked_host');
    await expectReject('http://example.com:8080/', 'blocked_port');
    await expectReject('http://u:p@example.com/', 'credentials_in_url');
    await expectReject('nope', 'invalid_url');
  });
  it('re-validates each redirect hop', async () => {
    const { fetch } = mockFetch({
      'https://example.com/go': redirect('http://169.254.169.254/latest/meta-data/'),
      'https://example.com/go6': redirect('http://[::ffff:127.0.0.1]/'),
      'https://example.com/local': redirect('http://localhost:80/admin'),
      'https://example.com/port': redirect('https://example.com:9000/'),
      'https://example.com/scheme': redirect('file:///etc/passwd'),
      'https://example.com/noloc': respond(null, { status: 302 }),
    });
    expect(await safeFetch('https://example.com/go', { fetch })).toMatchObject({
      ok: false,
      reason: 'blocked_ip',
      status: 302,
    });
    expect(await safeFetch('https://example.com/go6', { fetch })).toMatchObject({
      ok: false,
      reason: 'blocked_ip',
    });
    expect(await safeFetch('https://example.com/local', { fetch })).toMatchObject({
      ok: false,
      reason: 'blocked_host',
    });
    expect(await safeFetch('https://example.com/port', { fetch })).toMatchObject({
      ok: false,
      reason: 'blocked_port',
    });
    expect(await safeFetch('https://example.com/scheme', { fetch })).toMatchObject({
      ok: false,
      reason: 'unsupported_scheme',
    });
    expect(await safeFetch('https://example.com/noloc', { fetch })).toMatchObject({
      ok: false,
      reason: 'redirect_missing_location',
    });
  });
  it('stops after max redirects', async () => {
    const { fetch, calls } = mockFetch({
      'https://example.com/1': redirect('/2'),
      'https://example.com/2': redirect('/3'),
      'https://example.com/3': redirect('/4'),
      'https://example.com/4': redirect('/5'),
      'https://example.com/5': html('done'),
    });
    const result = await safeFetch('https://example.com/1', { fetch });
    expect(result).toMatchObject({ ok: false, reason: 'too_many_redirects' });
    expect(calls).toHaveLength(4);
    const ok = await safeFetch('https://example.com/1', { fetch, maxRedirects: 4 });
    expect(ok.ok).toBe(true);
  });
  it('uses the resolver hook to block private addresses behind public names', async () => {
    const { fetch, calls } = mockFetch({ 'https://evil.example.com/': html('x') });
    const blocked = await safeFetch('https://evil.example.com/', {
      fetch,
      resolve: async () => ['93.184.216.34', '10.0.0.5'],
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'dns_blocked' });
    expect(calls).toHaveLength(0);

    expect(
      await safeFetch('https://evil.example.com/', { fetch, resolve: async () => [] }),
    ).toMatchObject({ ok: false, reason: 'dns_failed' });
    expect(
      await safeFetch('https://evil.example.com/', {
        fetch,
        resolve: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    ).toMatchObject({ ok: false, reason: 'dns_failed' });

    const resolved: string[] = [];
    const ok = await safeFetch('https://evil.example.com/', {
      fetch,
      resolve: async (host) => {
        resolved.push(host);
        return ['93.184.216.34'];
      },
    });
    expect(ok.ok).toBe(true);
    expect(resolved).toEqual(['evil.example.com']);

    // IP literals are not resolved again.
    const ipRoutes = mockFetch({ 'http://8.8.8.8/': html('x') });
    let resolverCalls = 0;
    await safeFetch('http://8.8.8.8/', {
      fetch: ipRoutes.fetch,
      resolve: async () => {
        resolverCalls++;
        return [];
      },
    });
    expect(resolverCalls).toBe(0);
  });
  it('times out using the abort signal', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const result = await safeFetch('https://slow.example.com/', { fetch, timeoutMs: 20 });
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
  });
  it('enforces the byte limit from content-length and while streaming', async () => {
    const declared = mockFetch({
      'https://example.com/big': html('x', {
        headers: { 'content-type': 'text/html', 'content-length': '5000000' },
      }),
    });
    expect(await safeFetch('https://example.com/big', { fetch: declared.fetch })).toMatchObject({
      ok: false,
      reason: 'too_large',
    });

    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024).fill(65));
      },
    });
    const streamed = mockFetch({
      'https://example.com/stream': respond(stream, {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    });
    const result = await safeFetch('https://example.com/stream', {
      fetch: streamed.fetch,
      maxBytes: 4096,
    });
    expect(result).toMatchObject({ ok: false, reason: 'too_large' });
    expect(pulled).toBeLessThan(20);

    const small = mockFetch({ 'https://example.com/small': html('a'.repeat(100)) });
    expect(
      await safeFetch('https://example.com/small', { fetch: small.fetch, maxBytes: 100 }),
    ).toMatchObject({ ok: true });
    expect(
      await safeFetch('https://example.com/small', { fetch: small.fetch, maxBytes: 99 }),
    ).toMatchObject({ ok: false, reason: 'too_large' });
  });
  it('enforces the content-type allowlist and http status', async () => {
    const { fetch } = mockFetch({
      'https://example.com/img': respond(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
      'https://example.com/json': respond('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      'https://example.com/pdf': respond(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
      'https://example.com/missing': respond('nope', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      }),
      'https://example.com/none': respond('x', { status: 200 }),
    });
    expect(await safeFetch('https://example.com/img', { fetch })).toMatchObject({
      ok: false,
      reason: 'unsupported_content_type',
    });
    expect(await safeFetch('https://example.com/json', { fetch })).toMatchObject({
      ok: false,
      reason: 'unsupported_content_type',
    });
    expect(
      await safeFetch('https://example.com/json', {
        fetch,
        allowedContentTypes: ['application/json'],
      }),
    ).toMatchObject({ ok: true, text: null });
    const pdf = await safeFetch('https://example.com/pdf', { fetch });
    expect(pdf).toMatchObject({ ok: true, mimeType: 'application/pdf', text: null });
    if (pdf.ok) expect(Array.from(pdf.bytes)).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(await safeFetch('https://example.com/missing', { fetch })).toMatchObject({
      ok: false,
      reason: 'http_error',
      status: 404,
    });
    // Node's Response defaults an empty content-type for string bodies to text/plain; missing header is rejected.
    const none = await safeFetch('https://example.com/none', { fetch });
    expect(none.ok ? none.mimeType : none.reason).toMatch(/text\/plain|unsupported_content_type/);
  });
  it('maps network failures and supports HEAD', async () => {
    const { fetch } = mockFetch({ 'https://example.com/head': html('ignored') });
    expect(await safeFetch('https://example.com/unknown', { fetch })).toMatchObject({
      ok: false,
      reason: 'network_error',
    });
    const head = await safeFetch('https://example.com/head', { fetch, method: 'HEAD' });
    expect(head).toMatchObject({ ok: true, text: null });
    if (head.ok) expect(head.bytes.byteLength).toBe(0);
  });
  it('decodes legacy Turkish charsets from the header or meta tag', async () => {
    // windows-1254: 0xFE = ş, 0xFC = ü
    const bytes = new Uint8Array([0x54, 0x65, 0xfe, 0x65, 0x6b, 0x6b, 0xfc, 0x72]);
    const { fetch } = mockFetch({
      'https://example.com/header': respond(bytes, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=windows-1254' },
      }),
      'https://example.com/meta': respond(
        new Uint8Array([
          ...new TextEncoder().encode('<html><head><meta charset="windows-1254"></head><body>'),
          ...bytes,
        ]),
        { status: 200, headers: { 'content-type': 'text/html' } },
      ),
      'https://example.com/bad': respond(bytes, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=nonsense' },
      }),
    });
    expect(
      (await safeFetch('https://example.com/header', { fetch })) as { text?: string },
    ).toMatchObject({ text: 'Teşekkür' });
    const meta = await safeFetch('https://example.com/meta', { fetch });
    expect(meta.ok && meta.text?.includes('Teşekkür')).toBe(true);
    const bad = await safeFetch('https://example.com/bad', { fetch });
    expect(bad.ok).toBe(true);
  });
  it('safeFetchOrThrow converts failures to AppError', async () => {
    const { fetch } = mockFetch({
      'https://example.com/ok': html('ok'),
      'https://example.com/404': respond('', { status: 404 }),
    });
    await expect(safeFetchOrThrow('https://example.com/ok', { fetch })).resolves.toMatchObject({
      ok: true,
    });
    await expect(safeFetchOrThrow('http://127.0.0.1/', { fetch })).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'blocked_ip' },
    });
    await expect(safeFetchOrThrow('https://example.com/404', { fetch })).rejects.toMatchObject({
      code: 'provider_unavailable',
      details: { reason: 'http_error', status: 404 },
    });
    expect(
      safeFetchError({ ok: false, reason: 'timeout', message: 'x', url: 'u', redirects: [] }).code,
    ).toBe('provider_unavailable');
  });
  it('parses content-type headers', () => {
    expect(parseContentType('Text/HTML; Charset="ISO-8859-9"')).toEqual({
      mimeType: 'text/html',
      charset: 'iso-8859-9',
    });
    expect(parseContentType('application/pdf')).toEqual({
      mimeType: 'application/pdf',
      charset: null,
    });
    expect(parseContentType(null)).toEqual({ mimeType: '', charset: null });
  });
});

describe('safefetch/readable', () => {
  const page = `<!doctype html>
<html lang="tr">
<head>
  <title> Kargo &amp; Teslimat &ndash; Firma </title>
  <meta name="description" content="Siparişiniz yola &ccedil;ıktı.">
  <style>body { color: red }</style>
  <script>window.track = function () { return 'nav'; }</script>
</head>
<body>
  <nav><a href="/">Ana sayfa</a><a href="/hesap">Hesabım</a></nav>
  <header><h1>Site başlığı</h1></header>
  <main>
    <h1>Sipari&#351;iniz yola &#x00E7;ıktı</h1>
    <p>Teslimat   tarihi: <b>8 Eylül 2026</b>, saat 14:00&ndash;18:00.</p>
    <ul><li>Kargo: Yurtiçi</li><li>Takip no: 123456</li></ul>
    <script>alert('x')</script>
    <table><tr><td>Tutar</td><td>1.250 TL</td></tr></table>
  </main>
  <aside>Reklam</aside>
  <footer>© 2026 Firma</footer>
</body>
</html>`;

  it('extracts title, description, lang and main text without chrome', () => {
    const r = extractReadableText(page);
    expect(r.title).toBe('Kargo & Teslimat – Firma');
    expect(r.description).toBe('Siparişiniz yola çıktı.');
    expect(r.lang).toBe('tr');
    expect(r.text).toContain('Siparişiniz yola çıktı');
    expect(r.text).toContain('Teslimat tarihi: 8 Eylül 2026, saat 14:00–18:00.');
    expect(r.text).toContain('Kargo: Yurtiçi\nTakip no: 123456');
    expect(r.text).toContain('Tutar 1.250 TL');
    expect(r.text).not.toContain('Ana sayfa');
    expect(r.text).not.toContain('Reklam');
    expect(r.text).not.toContain('Firma\n');
    expect(r.text).not.toContain('alert');
    expect(r.text).not.toContain('color: red');
    expect(r.truncated).toBe(false);
  });
  it('falls back to body / whole document and og:title', () => {
    const r = extractReadableText(
      '<html><head><meta property="og:title" content="OG Başlık"></head><body><div>Merhaba</div><div>Dünya</div></body></html>',
    );
    expect(r.title).toBe('OG Başlık');
    expect(r.text).toBe('Merhaba\nDünya');
    expect(r.lang).toBeNull();
    const bare = extractReadableText('Sadece düz metin <br> ikinci satır');
    expect(bare.title).toBe('');
    expect(bare.text).toBe('Sadece düz metin\nikinci satır');
  });
  it('truncates to maxLength and strips unterminated scripts', () => {
    const long = `<html><body><p>${'a'.repeat(1000)}</p><script>never closed`;
    const r = extractReadableText(long, { maxLength: 300 });
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(300);
    expect(r.text.endsWith('…')).toBe(true);
    expect(r.text).not.toContain('never closed');
  });
  it('decodes html entities incl. Turkish named ones and rejects bad code points', () => {
    expect(decodeHtmlEntities('&Ccedil;ay &amp; &scedil;eker &#199; &#x131; &euro;')).toBe(
      'Çay & şeker Ç ı €',
    );
    expect(decodeHtmlEntities('&#0; &#xD800; &#1114112; &unknown;')).toBe(
      '&#0; &#xD800; &#1114112; &unknown;',
    );
  });
});
