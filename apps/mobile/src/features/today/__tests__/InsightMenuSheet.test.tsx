import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DataSource } from '@da/api-client';
import { InsightMenuSheet } from '../InsightMenuSheet';
import { makeInsight, renderWithProviders, setupTestI18n } from './testUtils';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View };
});
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
// jest.setup's expo-router mock `requireActual`s the real package (ESM deps); a self-contained mock is enough here.
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/',
}));

const mockSendFeedback = jest.fn(async () => undefined);
const mockAddVip = jest.fn(async (input: { displayName: string }) => ({
  id: 'vip-1',
  displayName: input.displayName,
}));
const mockResolveInsight = jest.fn(async () => ({}));
const mockPendingCount = jest.fn(async () => 0);
const mockGetEntitlement = jest.fn(async () => ({
  plan: 'pro',
  isPro: true,
  source: 'demo',
  isTrial: false,
  quotas: {},
  usage: {},
}));

jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: (): Partial<DataSource> =>
    ({
      mode: 'demo',
      feed: {
        sendFeedback: mockSendFeedback,
        resolveInsight: mockResolveInsight,
        snoozeInsight: jest.fn(),
      },
      people: { addVip: mockAddVip },
      approvals: {
        pendingCount: mockPendingCount,
        createApproval: jest.fn(),
        decideApproval: jest.fn(),
        retryApproval: jest.fn(),
      },
      billing: { getEntitlement: mockGetEntitlement },
    }) as unknown as DataSource,
}));

beforeAll(() => setupTestI18n());
beforeEach(() => jest.clearAllMocks());

describe('InsightMenuSheet', () => {
  it('sends show_more feedback and closes', async () => {
    const insight = makeInsight({ id: 'ins-menu' });
    const onClose = jest.fn();
    renderWithProviders(<InsightMenuSheet insight={insight} visible onClose={onClose} />);

    fireEvent.press(await screen.findByTestId('insight-menu-show-more'));
    await waitFor(() =>
      expect(mockSendFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'show_more',
          entityType: 'insight',
          entityId: 'ins-menu',
          contactId: 'contact-1',
        }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('adds the source person as VIP', async () => {
    const insight = makeInsight({
      source: {
        type: 'gmail',
        id: 't',
        label: 'Gmail',
        person: 'Mehmet Yılmaz',
        personId: 'contact-2',
        timestamp: '2026-09-05T05:00:00.000Z',
      },
    });
    renderWithProviders(<InsightMenuSheet insight={insight} visible onClose={jest.fn()} />);

    fireEvent.press(await screen.findByTestId('insight-menu-vip'));
    await waitFor(() =>
      expect(mockAddVip).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: 'contact-2', displayName: 'Mehmet Yılmaz' }),
      ),
    );
  });

  it('dismisses with not_important feedback', async () => {
    const insight = makeInsight({ id: 'ins-dismiss' });
    renderWithProviders(<InsightMenuSheet insight={insight} visible onClose={jest.fn()} />);

    fireEvent.press(await screen.findByTestId('insight-menu-not-important'));
    await waitFor(() =>
      expect(mockResolveInsight).toHaveBeenCalledWith('ins-dismiss', 'dismissed', 'not_important'),
    );
  });

  it('shows the reason inline for "Neden önemli?"', async () => {
    const insight = makeInsight({ reason: 'Bu mailde bugün 17:00 son tarih var.' });
    renderWithProviders(<InsightMenuSheet insight={insight} visible onClose={jest.fn()} />);

    fireEvent.press(await screen.findByTestId('insight-menu-why'));
    expect(await screen.findByText('Bu mailde bugün 17:00 son tarih var.')).toBeTruthy();
  });
});
