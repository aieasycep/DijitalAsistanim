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
jest.mock('@/lib/openExternal', () => ({
  openExternal: jest.fn(async () => true),
  providerMailUrl: (webUrl: string | null | undefined, provider: 'gmail' | 'outlook') =>
    webUrl ??
    (provider === 'gmail'
      ? 'https://mail.google.com/mail/u/0/#inbox'
      : 'https://outlook.live.com/mail/0/'),
  mapsUrl: (q: string) => `maps://?q=${encodeURIComponent(q)}`,
  telUrl: (p: string) => `tel:${p}`,
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));

const mockPush = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => [],
  usePathname: () => '/email',
  useFocusEffect: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';
import { openExternal } from '@/lib/openExternal';
import EmailDetailScreen from '../email/[id]/index';
import ReplyScreen from '../email/[id]/reply';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

/** Seed id of "Revize teklif" thread from Ahmet Yılmaz (mirrors packages/api-client/src/demo/ids.ts). */
const THREAD_AHMET_REVIZE = '00000000-0000-4000-8000-0000000000e1';

describe('Email detail', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockParams.id = THREAD_AHMET_REVIZE;
    delete mockParams.followUpId;
  });

  it('shows the AI summary first, the five actions and the collapsed original', async () => {
    const screen = renderWithProviders(<EmailDetailScreen />);
    expect(screen.getByTestId('email-screen')).toBeTruthy();
    await screen.findByTestId('email-subject', {}, { timeout: 5000 });
    expect(screen.getByText('AI ÖZETİ')).toBeTruthy();
    for (const id of ['reply', 'task', 'calendar', 'remind', 'open'])
      expect(screen.getByTestId(`email-action-${id}`)).toBeTruthy();
    expect(screen.queryByTestId('email-original-body')).toBeNull();
    fireEvent.press(screen.getByTestId('email-original-toggle'));
    expect(screen.getByTestId('email-original-body')).toBeTruthy();
  });

  it('marks the thread as read and creates a task approval on Görev Oluştur', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.approvals, 'createApproval');
    const screen = renderWithProviders(<EmailDetailScreen />);
    await screen.findByTestId('email-subject', {}, { timeout: 5000 });
    await waitFor(async () =>
      expect((await ds.email.getThread(THREAD_AHMET_REVIZE)).thread.isRead).toBe(true),
    );
    fireEvent.press(screen.getByTestId('email-action-task'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'task_create', requestedBy: 'email_detail' }),
      ),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/approvals/[id]' }),
      ),
    );
  });

  it('opens the original mail in the provider', async () => {
    const screen = renderWithProviders(<EmailDetailScreen />);
    await screen.findByTestId('email-subject', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('email-action-open'));
    await waitFor(() => expect(openExternal).toHaveBeenCalled());
  });
});

describe('Reply composer', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockParams.id = THREAD_AHMET_REVIZE;
    delete mockParams.followUpId;
  });

  it('drafts per tone into an editable field and submits an email_send approval', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.approvals, 'createApproval');
    const screen = renderWithProviders(<ReplyScreen />);
    const editor = await screen.findByTestId('reply-editor', {}, { timeout: 5000 });
    expect(editor).toBeTruthy();
    for (const tone of ['short', 'professional', 'friendly', 'detailed'])
      expect(screen.getByTestId(`reply-tone-${tone}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('reply-tone-friendly'));
    await waitFor(() => expect(screen.getByText('AI TASLAĞI · Samimi')).toBeTruthy());
    await waitFor(
      () =>
        expect(screen.getByTestId('reply-approve').props.accessibilityState?.disabled).toBe(false),
      { timeout: 5000 },
    );
    fireEvent.press(screen.getByTestId('reply-approve'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'email_send',
          payload: expect.objectContaining({
            threadId: THREAD_AHMET_REVIZE,
            tone: 'friendly',
            to: expect.any(Array),
          }),
        }),
      ),
    );
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/approvals/[id]' }));
  });
});
