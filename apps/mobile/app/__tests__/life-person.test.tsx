import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@/lib/monitoring', () => ({
  captureError: jest.fn(),
  setupMonitoring: jest.fn(),
  wrapWithMonitoring: (c: unknown) => c,
}));
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  trackScreen: jest.fn(),
  resetAnalytics: jest.fn(),
}));
jest.mock('@/lib/i18n', () => ({
  formatCtx: (overrides: Record<string, unknown> = {}) => ({
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    now: new Date('2026-09-05T06:41:00Z'),
    ...overrides,
  }),
  setupI18n: jest.fn(),
  changeLocale: jest.fn(),
}));
jest.mock('@/lib/openExternal', () => ({
  openExternal: jest.fn(async () => true),
  providerMailUrl: (webUrl: string | null | undefined) => webUrl ?? '',
  mapsUrl: (q: string) => `maps://?q=${encodeURIComponent(q)}`,
  telUrl: (p: string) => `tel:${p}`,
}));
jest.mock('@/services/handoff', () => ({
  openAppSettings: jest.fn(async () => true),
  openHandoff: jest.fn(async () => ({ ok: true, url: 'maps://?q=Kar%C3%A7k%C3%B6y' })),
  detectMeetingProvider: () => 'other',
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => [],
  usePathname: () => '/life',
  useFocusEffect: jest.fn(),
}));

import type { ReactElement } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { PRO_QUOTAS, type EntitlementState } from '@da/domain';
import { track } from '@/lib/analytics';
import { openExternal } from '@/lib/openExternal';
import { openHandoff } from '@/services/handoff';
import LifeEventScreen from '../life/[id]';
import PersonScreen from '../person/[id]';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { useSessionStore } from '@/store/session';

/** Mutations must not keep 5-minute GC timers alive after a test (would stall Jest's exit). */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

function renderScreen(ui: ReactElement) {
  return renderWithProviders(ui, { queryClient: makeClient() });
}

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const seed = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const CONTACT_AHMET = seed('2201');
const CONTACT_MEHMET = seed('2202');
const THREAD_AHMET_REVIZE = seed('e1');
const THREAD_MEHMET_TEKLIF_V2 = seed('e4');
const THREAD_TRENDYOL = seed('e5');
const THREAD_MEHMET_TOPLANTI = seed('eb');
const EVENT_MEHMET_MEETING = seed('d1');
const LIFE_TRENDYOL = seed('3001');
const LIFE_THY = seed('3002');
const LIFE_CK_FATURA = seed('3003');
const LIFE_GOOGLE_SECURITY = seed('3005');

/** Hand-off links carried by the demo fixtures (packages/api-client/src/demo/fixtures/lifeEvents.ts). */
const TRACKING_URL =
  'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=1234567890123';
const CHECK_IN_URL = 'https://www.turkishairlines.com/tr-tr/ucak-bileti/online-check-in/';
const PAYMENT_URL = 'https://www.ckbogazicielektrik.com.tr/online-islemler';
const SECURITY_URL = 'https://myaccount.google.com/notifications';

const FIND = { timeout: 5000 };

const PRO: EntitlementState = {
  plan: 'pro',
  isPro: true,
  source: 'demo',
  isTrial: false,
  quotas: PRO_QUOTAS,
  usage: { assistantQueriesToday: 0, capturesToday: 0, emailAccounts: 1, calendarAccounts: 1 },
};

function resetParams(next: Record<string, string>) {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, next);
}

/** status 'loading' keeps the entitlement query disabled so the store's entitlement decides the gate. */
function setEntitlement(entitlement: EntitlementState | null) {
  useSessionStore.setState({ preferences: null, entitlement, status: 'loading' });
}

/**
 * Detail rows are plain (non-pressable) ListRows, so they carry no testID; read the "Label · value"
 * pairs from the `life-details` group in render order instead.
 */
function detailPairs(screen: ReturnType<typeof renderScreen>): Array<[string, string]> {
  const texts = within(screen.getByTestId('life-details'))
    .getAllByText(/./)
    .map((node) => String(node.props.children));
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < texts.length; i += 2) pairs.push([texts[i] ?? '', texts[i + 1] ?? '']);
  return pairs;
}

function fieldValue(screen: ReturnType<typeof renderScreen>, label: string): string {
  const pair = detailPairs(screen).find(([l]) => l === label);
  if (!pair) throw new Error(`Detail row "${label}" not rendered`);
  return pair[1];
}

describe('Life event detail', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
    (openExternal as jest.Mock).mockClear();
    (openHandoff as jest.Mock).mockClear();
    resetParams({ id: LIFE_TRENDYOL });
  });

  it('renders the shipment with evidence-only fields and its hand-off actions', async () => {
    const screen = renderScreen(<LifeEventScreen />);
    expect(screen.getByTestId('life-screen')).toBeTruthy();
    await screen.findByTestId('life-title', {}, FIND);
    expect(screen.getByText('Trendyol siparişin bugün geliyor.')).toBeTruthy();
    expect(screen.getByText('KARGO')).toBeTruthy();
    expect(screen.getByText('DETAYLAR')).toBeTruthy();
    expect(screen.queryByTestId('life-status-done')).toBeNull();

    // Fields in the order the shipment layout defines, all taken from the source.
    expect(detailPairs(screen).map(([label]) => label)).toEqual([
      'Satıcı',
      'Kargo firması',
      'Takip numarası',
      'Teslimat aralığı',
    ]);
    expect(fieldValue(screen, 'Satıcı')).toBe('Trendyol');
    expect(fieldValue(screen, 'Kargo firması')).toBe('Yurtiçi Kargo');
    expect(fieldValue(screen, 'Takip numarası')).toBe('1234567890123');
    expect(fieldValue(screen, 'Teslimat aralığı')).toMatch(/14:00.*18:00/);
    expect(screen.queryByText('Kaynakta belirtilmemiş')).toBeNull();

    // Actions: Takip Et (tracking link) · Hatırlat · Tamamlandı — nothing else.
    expect(screen.getAllByTestId(/^life-action-/).map((b) => b.props.testID)).toEqual([
      'life-action-track',
      'life-action-remind',
      'life-action-done',
    ]);
    fireEvent.press(screen.getByTestId('life-action-track'));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith(TRACKING_URL));
    expect(screen.queryByText('Uygulama açılamadı.')).toBeNull();

    fireEvent.press(screen.getByTestId('life-action-remind'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/reminder',
      params: expect.objectContaining({
        targetType: 'life_event',
        targetId: LIFE_TRENDYOL,
        title: 'Trendyol siparişin bugün geliyor.',
        dueAt: expect.any(String),
        sourceLabel: 'Kargo',
      }),
    });

    fireEvent.press(screen.getByTestId('life-source'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_TRENDYOL },
    });
  });

  it('marks the event as done and hides the action afterwards', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.feed, 'setLifeEventStatus');
    const screen = renderScreen(<LifeEventScreen />);
    await screen.findByTestId('life-action-done', {}, FIND);

    fireEvent.press(screen.getByTestId('life-action-done'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(LIFE_TRENDYOL, 'done'));
    await screen.findByTestId('life-status-done', {}, FIND);
    await screen.findByText('Tamamlandı olarak işaretlendi', {}, FIND);
    expect(screen.queryByTestId('life-action-done')).toBeNull();
    expect(screen.getByTestId('life-action-track')).toBeTruthy();
    expect((await ds.feed.getLifeEvent(LIFE_TRENDYOL)).status).toBe('done');
  });

  it('shows flight check-in, security link and the missing-field placeholder', async () => {
    resetParams({ id: LIFE_THY });
    const flight = renderScreen(<LifeEventScreen />);
    await flight.findByTestId('life-title', {}, FIND);
    expect(flight.getByText('TK2412 · İstanbul → Antalya')).toBeTruthy();
    expect(flight.getByText('UÇUŞ')).toBeTruthy();
    expect(fieldValue(flight, 'Uçuş')).toBe('TK2412');
    expect(fieldValue(flight, 'Havayolu')).toBe('THY');
    expect(fieldValue(flight, 'Rota')).toBe('İstanbul (IST) → Antalya (AYT)');
    expect(fieldValue(flight, 'PNR')).toBe('ABC123');
    expect(flight.queryByTestId('life-action-track')).toBeNull();
    fireEvent.press(flight.getByTestId('life-action-check_in'));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith(CHECK_IN_URL));
    flight.unmount();

    resetParams({ id: LIFE_GOOGLE_SECURITY });
    const security = renderScreen(<LifeEventScreen />);
    await security.findByTestId('life-title', {}, FIND);
    expect(security.getByText('Google hesabında yeni giriş.')).toBeTruthy();
    expect(security.getByText('GÜVENLİK')).toBeTruthy();
    // The mail never named the service: the field says so instead of guessing.
    expect(fieldValue(security, 'Servis')).toBe('Kaynakta belirtilmemiş');
    expect(fieldValue(security, 'Olay')).toBe('Yeni cihazdan giriş');
    expect(fieldValue(security, 'Cihaz')).toBe('Windows');
    expect(fieldValue(security, 'Konum')).toBe('Ankara');
    // Security events cannot be "reminded"; they open the provider's page.
    expect(security.getAllByTestId(/^life-action-/).map((b) => b.props.testID)).toEqual([
      'life-action-open_link',
      'life-action-done',
    ]);
    fireEvent.press(security.getByTestId('life-action-open_link'));
    await waitFor(() => expect(openExternal).toHaveBeenLastCalledWith(SECURITY_URL));
  });

  it('never pays in-app: the payment hands off to the provider and reports failures', async () => {
    resetParams({ id: LIFE_CK_FATURA });
    (openExternal as jest.Mock).mockResolvedValueOnce(false);
    const screen = renderScreen(<LifeEventScreen />);
    await screen.findByTestId('life-title', {}, FIND);
    expect(screen.getByText('Elektrik faturası · 1.842 TL')).toBeTruthy();
    expect(screen.getByText('ÖDEME')).toBeTruthy();
    expect(
      screen.getByText('Ödeme uygulama içinden yapılmaz; yalnızca kaynağa yönlendirilirsin.'),
    ).toBeTruthy();
    expect(fieldValue(screen, 'Alıcı')).toBe('CK Enerji');
    expect(fieldValue(screen, 'Tutar')).toMatch(/1\.842/);
    fireEvent.press(screen.getByTestId('life-action-pay'));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith(PAYMENT_URL));
    await screen.findByText('Uygulama açılamadı.', {}, FIND);
  });

  it('shows the error state and recovers on retry', async () => {
    const ds = getTestDataSource();
    jest.spyOn(ds.feed, 'getLifeEvent').mockRejectedValueOnce(new Error('boom'));
    const screen = renderScreen(<LifeEventScreen />);
    await screen.findAllByText('Bir şeyler ters gitti.', {}, FIND);
    expect(screen.queryByTestId('life-title')).toBeNull();
    fireEvent.press(screen.getByText('Tekrar dene'));
    await screen.findByTestId('life-title', {}, FIND);
    fireEvent.press(screen.getByLabelText('Geri'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('Person intelligence', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
    (track as jest.Mock).mockClear();
    resetParams({ id: CONTACT_MEHMET });
    setEntitlement(PRO);
  });

  it('renders Mehmet: stats, upcoming meeting, topics, both commitment directions and mails', async () => {
    const screen = renderScreen(<PersonScreen />);
    expect(screen.getByTestId('person-screen')).toBeTruthy();
    await screen.findByTestId('person-vip', {}, FIND);
    expect(screen.getByText('Mehmet Yılmaz')).toBeTruthy();
    expect(screen.getByText('Müşteri Ltd. · Genel Müdür')).toBeTruthy();
    expect(screen.getByTestId('person-vip').props.accessibilityLabel).toBe('VIP');
    expect(screen.queryByTestId('person-empty')).toBeNull();

    // Stat tiles: last contact · upcoming meeting · open loops (2 commitments + 1 follow-up).
    expect(screen.getByLabelText(/^Son iletişim: /)).toBeTruthy();
    expect(screen.getByLabelText(/^Yaklaşan toplantı: /)).toBeTruthy();
    const loops = within(screen.getByTestId('person-stat-loops'));
    expect(loops.getByText('Açık konular')).toBeTruthy();
    expect(loops.getByText('3')).toBeTruthy();

    // Sections (kickers are upper-cased with Turkish casing rules by the Text primitive).
    expect(screen.getByText('YAKLAŞAN ETKİNLİKLER')).toBeTruthy();
    expect(
      within(screen.getByTestId(`person-event-${EVENT_MEHMET_MEETING}`)).getByText(
        'Mehmet ile müşteri toplantısı',
      ),
    ).toBeTruthy();
    expect(screen.getByText('SON KONUŞULANLAR')).toBeTruthy();
    expect(screen.getByTestId('person-topic-0')).toBeTruthy();
    expect(screen.getByText('SENDEN BEKLENENLER')).toBeTruthy();
    expect(
      within(screen.getByTestId('person-owes-0')).getByText("Mehmet'e teklif gönder"),
    ).toBeTruthy();
    expect(screen.getByText('SENİN BEKLEDİKLERİN')).toBeTruthy();
    expect(
      within(screen.getByTestId('person-owed-0')).getByText(
        'Mehmet Teklif v2 geri bildirimi gönderecek',
      ),
    ).toBeTruthy();
    expect(screen.getByText('İLGİLİ MESAJLAR')).toBeTruthy();
    expect(screen.getByText('2 mail')).toBeTruthy();
    expect(
      within(screen.getByTestId('person-message-0')).getByText('Re: Bugünkü toplantı'),
    ).toBeTruthy();
    expect(within(screen.getByTestId('person-message-1')).getByText('Teklif v2')).toBeTruthy();
    expect(screen.getByTestId('person-last-contact')).toBeTruthy();
    expect(screen.getByTestId('person-ask').props.accessibilityLabel).toBe('Mehmet hakkında sor…');
  });

  it('navigates from messages, commitments, the meeting and "hakkında sor"', async () => {
    const screen = renderScreen(<PersonScreen />);
    await screen.findByTestId('person-message-0', {}, FIND);

    fireEvent.press(screen.getByTestId('person-message-0'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_MEHMET_TOPLANTI },
    });
    fireEvent.press(screen.getByTestId('person-message-1'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_MEHMET_TEKLIF_V2 },
    });
    fireEvent.press(screen.getByTestId('person-owes-0'));
    expect(mockPush).toHaveBeenLastCalledWith('/commitments');
    fireEvent.press(screen.getByTestId('person-last-contact'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_MEHMET_TOPLANTI },
    });
    // "Hazırlan" on the upcoming meeting is Pro-gated; the PRO entitlement lets it through.
    fireEvent.press(
      within(screen.getByTestId(`person-event-${EVENT_MEHMET_MEETING}`)).getByLabelText('Hazırlan'),
    );
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/meeting/[id]/prep',
      params: { id: EVENT_MEHMET_MEETING },
    });
    fireEvent.press(screen.getByTestId('person-stat-upcoming'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/meeting/[id]/prep',
      params: { id: EVENT_MEHMET_MEETING },
    });
    fireEvent.press(screen.getByTestId('person-ask'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/assistant',
      params: { contactId: CONTACT_MEHMET },
    });
    expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
  });

  it('toggles VIP off and back on, keeping the data source in sync', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.people, 'setVip');
    const screen = renderScreen(<PersonScreen />);
    const vip = await screen.findByTestId('person-vip', {}, FIND);
    expect(vip.props.accessibilityState?.selected).toBe(true);

    fireEvent.press(vip);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(CONTACT_MEHMET, false));
    await waitFor(() =>
      expect(screen.getByTestId('person-vip').props.accessibilityLabel).toBe('VIP yap'),
    );
    expect((await ds.people.listVips()).some((v) => v.contactId === CONTACT_MEHMET)).toBe(false);
    expect((await ds.people.getPerson(CONTACT_MEHMET)).contact.isVip).toBe(false);

    fireEvent.press(screen.getByTestId('person-vip'));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(CONTACT_MEHMET, true));
    await screen.findByText('Öğrendim · Mehmet Yılmaz artık VIP.', {}, FIND);
    await waitFor(() =>
      expect(screen.getByTestId('person-vip').props.accessibilityLabel).toBe('VIP'),
    );
    expect((await ds.people.listVips()).some((v) => v.contactId === CONTACT_MEHMET)).toBe(true);
    expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
  });

  it('sends free users to the paywall before making someone VIP', async () => {
    setEntitlement(null);
    resetParams({ id: CONTACT_AHMET });
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.people, 'setVip');
    const screen = renderScreen(<PersonScreen />);
    const vip = await screen.findByTestId('person-vip', {}, FIND);
    expect(screen.getByText('Ahmet Yılmaz')).toBeTruthy();
    expect(vip.props.accessibilityLabel).toBe('VIP yap');
    expect(within(screen.getByTestId('person-message-0')).getByText('Revize teklif')).toBeTruthy();

    fireEvent.press(vip);
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/paywall', params: { context: 'vip' } }),
    );
    expect(track).toHaveBeenCalledWith('paywall_viewed', { context: 'vip' });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('person-vip').props.accessibilityLabel).toBe('VIP yap');

    fireEvent.press(screen.getByTestId('person-message-0'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_AHMET_REVIZE },
    });
  });

  it('shows the no-history state for a contact without any interaction', async () => {
    const ds = getTestDataSource();
    const created = await ds.people.addVip({
      displayName: 'Burak Tan',
      email: 'burak@example.com',
    });
    const contactId = created.contactId;
    if (!contactId) throw new Error('addVip did not create a contact');
    resetParams({ id: contactId });
    const screen = renderScreen(<PersonScreen />);
    await screen.findByTestId('person-empty', {}, FIND);
    expect(screen.getByText('Burak Tan')).toBeTruthy();
    expect(screen.getByText('Bu kişiyle henüz kayıtlı bir iletişim yok.')).toBeTruthy();
    expect(within(screen.getByTestId('person-stat-last')).getByText('—')).toBeTruthy();
    expect(within(screen.getByTestId('person-stat-upcoming')).getByText('—')).toBeTruthy();
    expect(within(screen.getByTestId('person-stat-loops')).getByText('0')).toBeTruthy();
    expect(screen.queryByTestId('person-message-0')).toBeNull();
    expect(screen.getByTestId('person-ask').props.accessibilityLabel).toBe('Burak hakkında sor…');
  });

  it('shows the error state and recovers on retry', async () => {
    const ds = getTestDataSource();
    jest.spyOn(ds.people, 'getPerson').mockRejectedValueOnce(new Error('boom'));
    const screen = renderScreen(<PersonScreen />);
    await screen.findAllByText('Bir şeyler ters gitti.', {}, FIND);
    expect(screen.queryByTestId('person-vip')).toBeNull();
    fireEvent.press(screen.getByText('Tekrar dene'));
    await screen.findByTestId('person-vip', {}, FIND);
    expect(screen.getByText('Mehmet Yılmaz')).toBeTruthy();
  });
});
