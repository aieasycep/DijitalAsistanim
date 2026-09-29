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
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/mail-intelligence',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { MAIL_INTELLIGENCE_CATEGORIES } from '@da/domain';
import MailIntelligenceScreen from '../mail-intelligence';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const seed = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const THREAD_AHMET_REVIZE = seed('e1');
const THREAD_NETFLIX = seed('e8');

const FIND = { timeout: 5000 };

describe('Mail intelligence', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('renders the hero, the six categories with their counts and the important threads first', async () => {
    const data = await getTestDataSource().feed.getMailIntelligence();
    const screen = renderWithProviders(<MailIntelligenceScreen />);
    expect(screen.getByTestId('mailintel-screen')).toBeTruthy();
    expect(screen.getByText('MAİL ZEKÂSI · BUGÜN')).toBeTruthy();
    await screen.findByTestId('mailintel-categories', {}, FIND);

    // Hero: "<N> mail geldi" · "<n> tanesi dikkat gerektiriyor." · read-for-you line.
    expect(data.totalToday).toBeGreaterThan(0);
    expect(data.needsAttention).toBeGreaterThan(0);
    expect(screen.getByText('mail geldi')).toBeTruthy();
    expect(screen.getByText(`${data.needsAttention} tanesi dikkat gerektiriyor.`)).toBeTruthy();
    const read = Math.max(0, data.totalToday - data.needsAttention);
    expect(
      screen.getByText(
        `${read} tanesini senin için okudum; ${data.categories.low_priority.count} düşük öncelikli, ${data.categories.information.count} bilgilendirme.`,
      ),
    ).toBeTruthy();

    // Six category rows, each with the count of the demo data source.
    for (const key of MAIL_INTELLIGENCE_CATEGORIES) {
      const row = screen.getByTestId(`mailintel-category-${key}`);
      expect(within(row).getByText(String(data.categories[key].count))).toBeTruthy();
    }
    expect(
      within(screen.getByTestId('mailintel-category-important')).getByText('Önemli'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('mailintel-category-waiting_for_user')).getByText(
        'Senden Cevap Bekleyen',
      ),
    ).toBeTruthy();

    // "Önemli" is selected by default: Ahmet's critical thread with a deadline leads the list.
    expect(screen.getAllByTestId(/^mailintel-thread-\d+$/)).toHaveLength(
      data.categories.important.count,
    );
    expect(screen.getByText(`${data.categories.important.count} konu`)).toBeTruthy();
    expect(screen.getByLabelText('Ahmet Yılmaz · Revize teklif')).toBeTruthy();
    const first = screen.getByTestId('mailintel-thread-0');
    expect(within(first).getByText('Ahmet Yılmaz')).toBeTruthy();
    expect(within(first).getByText('ACİL')).toBeTruthy();
    expect(within(first).getByText('SON TARİH')).toBeTruthy();
    expect(
      within(first).getByText("Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor."),
    ).toBeTruthy();
  });

  it('switches categories and opens a thread in the email detail', async () => {
    const screen = renderWithProviders(<MailIntelligenceScreen />);
    await screen.findByTestId('mailintel-thread-0', {}, FIND);
    fireEvent.press(screen.getByTestId('mailintel-thread-0'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_AHMET_REVIZE },
    });

    fireEvent.press(screen.getByTestId('mailintel-category-low_priority'));
    await waitFor(() =>
      expect(screen.getByLabelText('Netflix · Üyeliğiniz yenileniyor')).toBeTruthy(),
    );
    expect(screen.getAllByTestId(/^mailintel-thread-\d+$/)).toHaveLength(2);
    expect(screen.getByText('2 konu')).toBeTruthy();
    expect(screen.getByLabelText('Moda Mağazası · %40 indirim sadece bugün!')).toBeTruthy();
    expect(screen.queryByText('ACİL')).toBeNull();
    expect(screen.queryByLabelText('Ahmet Yılmaz · Revize teklif')).toBeNull();

    fireEvent.press(screen.getByTestId('mailintel-thread-0'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_NETFLIX },
    });
  });

  it('shows the calm hero and the empty filter state when a category has nothing', async () => {
    const ds = getTestDataSource();
    const real = await ds.feed.getMailIntelligence();
    jest.spyOn(ds.feed, 'getMailIntelligence').mockResolvedValue({
      ...real,
      needsAttention: 0,
      categories: { ...real.categories, information: { count: 0, threads: [] } },
    });
    const screen = renderWithProviders(<MailIntelligenceScreen />);
    await screen.findByTestId('mailintel-categories', {}, FIND);
    expect(screen.getByText('Bugün dikkat gerektiren mail yok.')).toBeTruthy();
    expect(screen.queryByText(/tanesi dikkat gerektiriyor\./)).toBeNull();

    fireEvent.press(screen.getByTestId('mailintel-category-information'));
    await screen.findByTestId('mailintel-empty', {}, FIND);
    expect(screen.getByText('Bu filtrede bir şey yok.')).toBeTruthy();
    expect(screen.getByText('0 konu')).toBeTruthy();
    expect(screen.queryByTestId('mailintel-thread-0')).toBeNull();
  });

  it('shows the error state, recovers on retry and goes back from the header', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.feed, 'getMailIntelligence').mockRejectedValueOnce(new Error('boom'));
    const screen = renderWithProviders(<MailIntelligenceScreen />);
    await screen.findAllByText('Bir şeyler ters gitti.', {}, FIND);
    expect(screen.queryByTestId('mailintel-categories')).toBeNull();

    fireEvent.press(screen.getByText('Tekrar dene'));
    await screen.findByTestId('mailintel-categories', {}, FIND);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Bir şeyler ters gitti.')).toBeNull();

    fireEvent.press(screen.getByLabelText('Geri'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
