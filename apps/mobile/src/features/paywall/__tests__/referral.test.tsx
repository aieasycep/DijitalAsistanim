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
    ...overrides,
  }),
  setupI18n: jest.fn(),
  changeLocale: jest.fn(),
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));
jest.mock('@/hooks/useDeepLinks', () => ({
  readPendingReferral: jest.fn(() => null),
  clearPendingReferral: jest.fn(),
}));
jest.mock('@/services/handoff', () => ({
  openHandoff: jest.fn(async () => ({ ok: true, url: 'https://wa.me/?text=x' })),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const mockBack = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => [],
  usePathname: () => '/referral',
  useFocusEffect: jest.fn(),
}));

import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { createI18n } from '@da/i18n';
import ReferralScreen from '../../../../app/referral';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { openHandoff } from '@/services/handoff';
import { useSessionStore } from '@/store/session';
import {
  isReferralCodeShape,
  normalizeReferralCode,
  rejectionCopy,
} from '../../referral/referralCopy';

const t = createI18n('tr').t;

beforeEach(() => {
  resetTestDataSource();
  mockBack.mockClear();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  useSessionStore.setState({ status: 'signedIn', entitlement: null });
  jest.clearAllMocks();
});

describe('referralCopy', () => {
  it('normalises codes and maps rejection reasons to calm copy', () => {
    expect(normalizeReferralCode(' demo 2026 ')).toBe('DEMO2026');
    expect(isReferralCodeShape('demo2026')).toBe(true);
    expect(isReferralCodeShape('ab')).toBe(false);
    expect(rejectionCopy({ ok: false, reason: 'self_referral' }, t)).toBe(
      'Kendi kodunu kullanamazsın.',
    );
    expect(rejectionCopy({ ok: false, reason: 'already_redeemed' }, t)).toBe(
      'Bu hesap zaten bir davet kodu kullandı.',
    );
    expect(rejectionCopy({ ok: false, reason: 'invalid' }, t)).toBe('Bu kod geçersiz.');
    expect(rejectionCopy({ ok: false, message: 'Sunucu böyle dedi.' }, t)).toBe(
      'Sunucu böyle dedi.',
    );
    expect(rejectionCopy({ ok: false }, t)).toBe('Bu kod kullanılamadı.');
  });
});

describe('Referral screen', () => {
  it('shows the code and shares it through copy, WhatsApp and the system sheet', async () => {
    const ds = getTestDataSource();
    const status = await ds.billing.getReferralStatus();
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: null });
    const screen = renderWithProviders(<ReferralScreen />);
    await screen.findByTestId('referral-code', {}, { timeout: 5000 });
    expect(screen.getByText(status.code)).toBeTruthy();
    expect(screen.getByText(status.inviteUrl)).toBeTruthy();
    expect(screen.getByText('İkiniz de 14 gün Pro kazanın.')).toBeTruthy();
    expect(screen.getByTestId('referral-status')).toBeTruthy();
    expect(screen.getByText(/gün Pro kazandın/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('referral-copy'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(status.inviteUrl));
    await screen.findByText('Kopyalandı', {}, { timeout: 5000 });

    fireEvent.press(screen.getByTestId('referral-whatsapp'));
    await waitFor(() =>
      expect(openHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'whatsapp', text: expect.stringContaining(status.code) }),
      ),
    );

    fireEvent.press(screen.getByTestId('referral-share'));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining(status.inviteUrl) }),
        expect.anything(),
      ),
    );
  });

  it('redeems a valid code and explains rejections calmly', async () => {
    const ds = getTestDataSource();
    const status = await ds.billing.getReferralStatus();
    const redeem = jest.spyOn(ds.billing, 'redeemReferral');
    const screen = renderWithProviders(<ReferralScreen />);
    const input = await screen.findByTestId('referral-input', {}, { timeout: 5000 });

    fireEvent.changeText(input, 'ab');
    fireEvent.press(screen.getByTestId('referral-redeem'));
    await screen.findByText('Bu kod geçersiz.');
    expect(redeem).not.toHaveBeenCalled();

    fireEvent.changeText(input, status.code.toLowerCase());
    fireEvent.press(screen.getByTestId('referral-redeem'));
    await screen.findByText('Kendi kodunu kullanamazsın.', {}, { timeout: 5000 });
    expect(redeem).toHaveBeenCalledWith({ code: status.code });

    fireEvent.changeText(input, 'demo2026');
    fireEvent.press(screen.getByTestId('referral-redeem'));
    await screen.findByText('Kod kullanıldı · 14 gün Pro eklendi', {}, { timeout: 5000 });
    await waitFor(async () => expect((await ds.billing.getEntitlement()).isPro).toBe(true));
    expect(screen.getByTestId('referral-input').props.value ?? '').toBe('');
  }, 15000);

  it('pre-fills the code from the deep link param', async () => {
    mockParams.code = 'DEMO2026';
    const screen = renderWithProviders(<ReferralScreen />);
    await screen.findByTestId('referral-input', {}, { timeout: 5000 });
    expect(screen.getByDisplayValue('DEMO2026')).toBeTruthy();
  });
});
