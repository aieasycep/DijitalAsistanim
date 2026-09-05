jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { universalHosts: ['dijitalasistan.app', 'www.dijitalasistan.app'], appGroup: 'group.com.dijitalasistan.app' }, version: '1.0.0' },
    executionEnvironment: 'bare',
  },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

import {
  AUTH_CALLBACK_HREF,
  deepLinkKind,
  isValidEntityId,
  openDeepLink,
  parseDeepLink,
  parseQueryString,
  pendingDeepLinkCount,
  setDeepLinkHandler,
} from '@/services/deeplinks';

const ID = '3f2a9b1c-6d4e-4f8a-9b0c-1d2e3f4a5b6c';

describe('parseDeepLink — scheme URLs', () => {
  it('routes today (with and without triple slash)', () => {
    expect(parseDeepLink('dijitalasistan://today')).toEqual({ href: '/(tabs)/today' });
    expect(parseDeepLink('dijitalasistan:///today')).toEqual({ href: '/(tabs)/today' });
    expect(parseDeepLink('dijitalasistan://')).toEqual({ href: '/(tabs)/today' });
  });

  it('validates the flow filter and plan date', () => {
    expect(parseDeepLink('dijitalasistan://flow?filter=mail')).toEqual({ href: '/(tabs)/flow', params: { filter: 'mail' } });
    expect(parseDeepLink('dijitalasistan://flow?filter=spam')).toEqual({ href: '/(tabs)/flow' });
    expect(parseDeepLink('dijitalasistan://plan?date=2026-09-05')).toEqual({ href: '/(tabs)/plan', params: { date: '2026-09-05' } });
    expect(parseDeepLink('dijitalasistan://plan?date=tomorrow')).toEqual({ href: '/(tabs)/plan' });
  });

  it('decodes free-text queries', () => {
    expect(parseDeepLink('dijitalasistan://assistant?q=Bug%C3%BCn%20ne%20var')).toEqual({ href: '/(tabs)/assistant', params: { q: 'Bugün ne var' } });
    expect(parseDeepLink('dijitalasistan://search?q=teklif+v2')).toEqual({ href: '/search', params: { q: 'teklif v2' } });
  });

  it('routes briefings by kind, audio requires an id', () => {
    expect(parseDeepLink(`dijitalasistan://briefing/morning?id=${ID}&autoplay=1`)).toEqual({ href: '/briefing/morning', params: { id: ID, autoplay: '1' } });
    expect(parseDeepLink('dijitalasistan://briefing/evening')).toEqual({ href: '/briefing/evening' });
    expect(parseDeepLink(`dijitalasistan://briefing/audio?id=${ID}`)).toEqual({ href: '/briefing/audio', params: { id: ID } });
    expect(parseDeepLink('dijitalasistan://briefing/audio')).toBeNull();
    expect(parseDeepLink('dijitalasistan://briefing/night')).toBeNull();
  });

  it('routes email detail and reply, rejects other sub-paths and malformed ids', () => {
    expect(parseDeepLink(`dijitalasistan://email/${ID}`)).toEqual({ href: `/email/${ID}`, params: { id: ID } });
    expect(parseDeepLink(`dijitalasistan://email/${ID}/reply`)).toEqual({ href: `/email/${ID}/reply`, params: { id: ID } });
    expect(parseDeepLink('dijitalasistan://email/thread-demo-3')).toEqual({ href: '/email/thread-demo-3', params: { id: 'thread-demo-3' } });
    expect(parseDeepLink(`dijitalasistan://email/${ID}/forward`)).toBeNull();
    expect(parseDeepLink('dijitalasistan://email/../settings')).toBeNull();
    expect(parseDeepLink('dijitalasistan://email/%2F%2Fevil')).toBeNull();
  });

  it('routes meeting prep / post only', () => {
    expect(parseDeepLink(`dijitalasistan://meeting/${ID}/prep`)).toEqual({ href: `/meeting/${ID}/prep`, params: { id: ID } });
    expect(parseDeepLink(`dijitalasistan://meeting/${ID}/post`)).toEqual({ href: `/meeting/${ID}/post`, params: { id: ID } });
    expect(parseDeepLink(`dijitalasistan://meeting/${ID}`)).toBeNull();
    expect(parseDeepLink(`dijitalasistan://meeting/${ID}/join`)).toBeNull();
  });

  it('routes entity screens and lists', () => {
    expect(parseDeepLink(`dijitalasistan://conflict/${ID}`)).toEqual({ href: `/conflict/${ID}`, params: { id: ID } });
    expect(parseDeepLink(`dijitalasistan://person/${ID}`)).toEqual({ href: `/person/${ID}`, params: { id: ID } });
    expect(parseDeepLink(`dijitalasistan://life/${ID}`)).toEqual({ href: `/life/${ID}`, params: { id: ID } });
    expect(parseDeepLink('dijitalasistan://approvals')).toEqual({ href: '/approvals' });
    expect(parseDeepLink(`dijitalasistan://approvals/${ID}`)).toEqual({ href: `/approvals/${ID}`, params: { id: ID } });
    expect(parseDeepLink('dijitalasistan://followups')).toEqual({ href: '/followups' });
    expect(parseDeepLink('dijitalasistan://waiting')).toEqual({ href: '/waiting' });
    expect(parseDeepLink('dijitalasistan://commitments')).toEqual({ href: '/commitments' });
    expect(parseDeepLink('dijitalasistan://followups/extra')).toBeNull();
  });

  it('routes capture, settings, paywall and referral with validated params', () => {
    expect(parseDeepLink(`dijitalasistan://capture?id=${ID}`)).toEqual({ href: '/capture', params: { id: ID } });
    expect(parseDeepLink('dijitalasistan://capture')).toEqual({ href: '/capture' });
    expect(parseDeepLink('dijitalasistan://settings')).toEqual({ href: '/settings' });
    expect(parseDeepLink('dijitalasistan://settings/notifications')).toEqual({ href: '/settings/notifications' });
    expect(parseDeepLink('dijitalasistan://settings/secret')).toBeNull();
    expect(parseDeepLink('dijitalasistan://paywall?context=meeting_prep')).toEqual({ href: '/paywall', params: { context: 'meeting_prep' } });
    expect(parseDeepLink('dijitalasistan://paywall?context=<script>')).toEqual({ href: '/paywall' });
    expect(parseDeepLink('dijitalasistan://referral?code=YUNUS-14')).toEqual({ href: '/referral', params: { code: 'YUNUS-14' } });
  });

  it('routes OAuth returns with state/status/accountId/error', () => {
    expect(parseDeepLink(`dijitalasistan://oauth/google?state=abc&status=ok&accountId=${ID}`)).toEqual({
      href: '/oauth/google',
      params: { provider: 'google', state: 'abc', status: 'ok', accountId: ID },
    });
    expect(parseDeepLink('dijitalasistan://oauth/microsoft?state=xyz&error=access_denied')).toEqual({
      href: '/oauth/microsoft',
      params: { provider: 'microsoft', state: 'xyz', status: 'error', error: 'access_denied' },
    });
    expect(parseDeepLink('dijitalasistan://oauth/google')).toBeNull();
    expect(parseDeepLink('dijitalasistan://oauth/apple?state=abc')).toBeNull();
  });

  it('returns the auth callback pseudo-route with query and fragment merged', () => {
    const parsed = parseDeepLink('dijitalasistan://auth/callback?code=pkce-code#access_token=at&refresh_token=rt');
    expect(parsed?.href).toBe(AUTH_CALLBACK_HREF);
    expect(parsed?.params).toEqual({ code: 'pkce-code', access_token: 'at', refresh_token: 'rt' });
    expect(deepLinkKind(parsed as NonNullable<typeof parsed>)).toBe('auth_callback');
  });

  it('rejects share-extension payloads, dev-client launch URLs and unknown paths', () => {
    expect(parseDeepLink('dijitalasistan://dataUrl=ShareKey')).toBeNull();
    expect(parseDeepLink('dijitalasistan://expo-development-client/?url=http%3A%2F%2F10.0.0.2%3A8081')).toBeNull();
    expect(parseDeepLink('dijitalasistan://admin')).toBeNull();
    expect(parseDeepLink('dijitalasistan://today/extra')).toBeNull();
    expect(parseDeepLink('mailto:a@b.com')).toBeNull();
    expect(parseDeepLink('not a url')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink(null)).toBeNull();
  });
});

describe('parseDeepLink — universal links and Expo dev URLs', () => {
  it('accepts allow-listed hosts under /app', () => {
    expect(parseDeepLink(`https://dijitalasistan.app/app/email/${ID}`)).toEqual({ href: `/email/${ID}`, params: { id: ID } });
    expect(parseDeepLink('https://www.dijitalasistan.app/app')).toEqual({ href: '/(tabs)/today' });
    expect(parseDeepLink('https://dijitalasistan.app/app/flow?filter=calendar')).toEqual({ href: '/(tabs)/flow', params: { filter: 'calendar' } });
  });

  it('rejects foreign hosts, plain http and paths outside /app', () => {
    expect(parseDeepLink('https://evil.example/app/today')).toBeNull();
    expect(parseDeepLink('https://dijitalasistan.app.evil.example/app/today')).toBeNull();
    expect(parseDeepLink('http://dijitalasistan.app/app/today')).toBeNull();
    expect(parseDeepLink(`https://dijitalasistan.app/email/${ID}`)).toBeNull();
  });

  it('handles exp:// URLs with the /--/ separator', () => {
    expect(parseDeepLink(`exp://192.168.1.4:8081/--/email/${ID}`)).toEqual({ href: `/email/${ID}`, params: { id: ID } });
    expect(parseDeepLink('exp://192.168.1.4:8081/--/today')).toEqual({ href: '/(tabs)/today' });
    expect(parseDeepLink('exp://192.168.1.4:8081')).toBeNull();
    expect(parseDeepLink('dijitalasistan://192.168.1.4:8081/--/approvals')).toEqual({ href: '/approvals' });
  });
});

describe('helpers', () => {
  it('parseQueryString keeps the first value, decodes + and %xx, skips broken escapes', () => {
    expect(parseQueryString('a=1&a=2&b=x+y&c=%E2%9C%93&bad=%E0%A4%A&empty=')).toEqual({ a: '1', b: 'x y', c: '✓', empty: '' });
    expect(parseQueryString('')).toEqual({});
  });

  it('isValidEntityId accepts uuids and demo ids only', () => {
    expect(isValidEntityId(ID)).toBe(true);
    expect(isValidEntityId('ins-001')).toBe(true);
    expect(isValidEntityId('thread_ahmet_3')).toBe(true);
    expect(isValidEntityId('../x')).toBe(false);
    expect(isValidEntityId('a b')).toBe(false);
    expect(isValidEntityId('x'.repeat(65))).toBe(false);
    expect(isValidEntityId('')).toBe(false);
  });

  it('deepLinkKind classifies routes', () => {
    expect(deepLinkKind({ href: '/oauth/google' })).toBe('oauth');
    expect(deepLinkKind({ href: '/referral' })).toBe('referral');
    expect(deepLinkKind({ href: `/email/${ID}` })).toBe('email');
    expect(deepLinkKind({ href: '/(tabs)/today' })).toBe('route');
  });
});

describe('dispatcher', () => {
  afterEach(() => setDeepLinkHandler(null));

  it('queues URLs until a handler is installed, then flushes in order', () => {
    openDeepLink('dijitalasistan://today');
    openDeepLink('dijitalasistan://approvals');
    expect(pendingDeepLinkCount()).toBe(2);
    const seen: string[] = [];
    setDeepLinkHandler((url) => seen.push(url));
    expect(seen).toEqual(['dijitalasistan://today', 'dijitalasistan://approvals']);
    expect(pendingDeepLinkCount()).toBe(0);
    openDeepLink('dijitalasistan://waiting');
    expect(seen).toHaveLength(3);
  });

  it('queues again after the handler is removed', () => {
    setDeepLinkHandler(() => undefined);
    setDeepLinkHandler(null);
    openDeepLink('dijitalasistan://followups');
    expect(pendingDeepLinkCount()).toBe(1);
    setDeepLinkHandler(() => undefined);
    expect(pendingDeepLinkCount()).toBe(0);
  });
});
