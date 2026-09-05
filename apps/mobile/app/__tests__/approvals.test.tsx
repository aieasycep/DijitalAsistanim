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
  providerMailUrl: (webUrl: string | null | undefined) => webUrl ?? '',
  mapsUrl: (q: string) => `maps://?q=${q}`,
  telUrl: (p: string) => `tel:${p}`,
}));
jest.mock('@/hooks/useDataSource', () => ({
  useDataSource: () => require('@/features/flow/testing/demoSource').getTestDataSource(),
}));
jest.mock('@/services/notifications', () => ({
  getPermissionStatus: jest.fn(async () => 'granted'),
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: 'cancel' })),
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));
jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event' },
  getDefaultCalendarAsync: jest.fn(async () => ({ id: 'cal-1' })),
  createEventAsync: jest.fn(async () => 'evt-1'),
  updateEventAsync: jest.fn(async () => 'evt-1'),
  getEventAsync: jest.fn(async () => null),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
  useSegments: () => [],
  usePathname: () => '/approvals',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
}));

import { fireEvent, waitFor } from '@testing-library/react-native';
import type { ApprovalAction, DecideApprovalResponse } from '@da/domain';
import ApprovalsScreen from '../approvals/index';
import ApprovalScreen from '../approvals/[id]';
import ReminderSheetScreen from '../reminder';
import OAuthReturnScreen from '../oauth/[provider]';
import { clearApprovalDrafts } from '@/features/approvals/approvalDraft';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';
import { useSessionStore } from '@/store/session';

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const APPROVAL_AHMET_REPLY = '00000000-0000-4000-8000-000000003301';
const APPROVAL_BASVURU_CALENDAR = '00000000-0000-4000-8000-000000003302';
const THREAD_AHMET_REVIZE = '00000000-0000-4000-8000-0000000000e1';
const ACCOUNT_GMAIL = '00000000-0000-4000-8000-0000000000c1';

function resetParams(next: Record<string, string>) {
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  Object.assign(mockParams, next);
}

beforeEach(() => {
  resetTestDataSource();
  clearApprovalDrafts();
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  useSessionStore.setState({ status: 'signedIn', onboardingCompleted: false, profile: null });
});

describe('Approval Center', () => {
  beforeEach(() => resetParams({}));

  it('lists pending approvals with type + time meta and opens a card', async () => {
    const screen = renderWithProviders(<ApprovalsScreen />);
    expect(screen.getByTestId('approvals-screen')).toBeTruthy();
    expect(screen.getByText('Onay Bekleyenler')).toBeTruthy();
    await screen.findByTestId(`approval-${APPROVAL_AHMET_REPLY}`, {}, { timeout: 5000 });
    expect(screen.getByTestId(`approval-${APPROVAL_BASVURU_CALENDAR}`)).toBeTruthy();
    expect(
      screen.getByText('2 işlem onayını bekliyor. Hiçbiri sen onaylamadan yapılmaz.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('approvals-history')).toBeNull();
    fireEvent.press(screen.getByTestId(`approval-${APPROVAL_BASVURU_CALENDAR}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/approvals/[id]',
      params: { id: APPROVAL_BASVURU_CALENDAR },
    });
  });

  it('moves decided approvals into the history section', async () => {
    const ds = getTestDataSource();
    await ds.approvals.decideApproval({ approvalId: APPROVAL_AHMET_REPLY, decision: 'reject' });
    const screen = renderWithProviders(<ApprovalsScreen />);
    await screen.findByTestId('approvals-history', {}, { timeout: 5000 });
    expect(screen.getByText('GEÇMİŞ')).toBeTruthy();
    expect(screen.getByText('Reddedildi')).toBeTruthy();
    expect(screen.getByTestId('approvals-pending')).toBeTruthy();
  });

  it('shows the calm empty state when nothing is pending', async () => {
    const ds = getTestDataSource();
    jest.spyOn(ds.approvals, 'listApprovals').mockResolvedValue([]);
    const screen = renderWithProviders(<ApprovalsScreen />);
    await screen.findByTestId('approvals-empty', {}, { timeout: 5000 });
    expect(screen.getByText('Bekleyen onay yok.')).toBeTruthy();
  });
});

describe('Approval card', () => {
  it('renders Ne · Neden · Ne değişecek and executes on Onayla', async () => {
    resetParams({ id: APPROVAL_AHMET_REPLY });
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.approvals, 'decideApproval');
    const screen = renderWithProviders(<ApprovalScreen />);
    await screen.findByTestId('approval-approve', {}, { timeout: 5000 });
    expect(screen.getByText('AI ne yapmak istiyor?')).toBeTruthy();
    expect(screen.getByText('Neden?')).toBeTruthy();
    expect(screen.getByText('Ne değişecek?')).toBeTruthy();
    expect(screen.getByText('Mail gönder')).toBeTruthy();
    expect(screen.getByText("Ahmet Yılmaz'a yanıt gönder")).toBeTruthy();
    fireEvent.press(screen.getByTestId('approval-approve'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        approvalId: APPROVAL_AHMET_REPLY,
        decision: 'approve',
        editedPayload: undefined,
      }),
    );
    await screen.findByText('Tamamlandı', {}, { timeout: 5000 });
    expect(screen.getByTestId('approval-status')).toBeTruthy();
    expect(screen.queryByTestId('approval-approve')).toBeNull();
    expect((await ds.approvals.getApproval(APPROVAL_AHMET_REPLY)).status).toBe('executed');
  });

  it('edits the calendar event title, saves, then approves with the edited payload', async () => {
    resetParams({ id: APPROVAL_BASVURU_CALENDAR });
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.approvals, 'decideApproval');
    const screen = renderWithProviders(<ApprovalScreen />);
    await screen.findByTestId('approval-edit', {}, { timeout: 5000 });
    expect(screen.getByText('Takvim etkinliği oluştur')).toBeTruthy();
    fireEvent.press(screen.getByTestId('approval-edit'));
    for (const name of ['title', 'startAt', 'endAt', 'location'])
      expect(screen.getByTestId(`approval-edit-field-${name}`)).toBeTruthy();
    fireEvent.changeText(
      screen.getByTestId('approval-edit-field-title'),
      'Girişim Programı başvurusu (son kontrol)',
    );
    fireEvent.press(screen.getByTestId('approval-edit-save'));
    await screen.findByText('Değişiklikler kaydedildi', {}, { timeout: 5000 });
    expect(screen.getByText(/Girişim Programı başvurusu \(son kontrol\)/)).toBeTruthy();
    expect(screen.getByTestId('approval-edited')).toBeTruthy();
    fireEvent.press(screen.getByTestId('approval-approve'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'approve',
          editedPayload: expect.objectContaining({
            title: 'Girişim Programı başvurusu (son kontrol)',
          }),
        }),
      ),
    );
    await screen.findByText('Tamamlandı', {}, { timeout: 5000 });
    const stored = await ds.approvals.getApproval(APPROVAL_BASVURU_CALENDAR);
    expect(stored.editedByUser).toBe(true);
    expect((stored.payload as { title: string }).title).toBe(
      'Girişim Programı başvurusu (son kontrol)',
    );
  });

  it('rejects the invalid edit before it reaches the server', async () => {
    resetParams({ id: APPROVAL_BASVURU_CALENDAR });
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.approvals, 'decideApproval');
    const screen = renderWithProviders(<ApprovalScreen />);
    await screen.findByTestId('approval-edit', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('approval-edit'));
    fireEvent.changeText(screen.getByTestId('approval-edit-field-title'), '   ');
    fireEvent.press(screen.getByTestId('approval-edit-save'));
    await screen.findByText('Bu alanı kontrol et.');
    expect(screen.getByTestId('approval-edit-form')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('records Reddet as a learning signal', async () => {
    resetParams({ id: APPROVAL_AHMET_REPLY });
    const ds = getTestDataSource();
    const screen = renderWithProviders(<ApprovalScreen />);
    await screen.findByTestId('approval-reject', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('approval-reject'));
    await screen.findByText('Reddedildi', {}, { timeout: 5000 });
    expect((await ds.approvals.getApproval(APPROVAL_AHMET_REPLY)).status).toBe('rejected');
    expect(screen.queryByTestId('approval-approve')).toBeNull();
  });

  it('shows the failure reason and retries', async () => {
    resetParams({ id: APPROVAL_AHMET_REPLY });
    const ds = getTestDataSource();
    const current = await ds.approvals.getApproval(APPROVAL_AHMET_REPLY);
    const failed: ApprovalAction = {
      ...current,
      status: 'failed',
      failureReason: 'provider_unavailable',
      attemptCount: 1,
    };
    jest
      .spyOn(ds.approvals, 'decideApproval')
      .mockResolvedValueOnce({ approval: failed, status: 'failed' });
    const retrySpy = jest.spyOn(ds.approvals, 'retryApproval').mockResolvedValueOnce({
      approval: { ...failed, status: 'executed', failureReason: null, attemptCount: 2 },
      status: 'executed',
    });
    const screen = renderWithProviders(<ApprovalScreen />);
    await screen.findByTestId('approval-approve', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('approval-approve'));
    await screen.findByText('Uygulanamadı', {}, { timeout: 5000 });
    expect(screen.getByText('Sağlayıcı geçici olarak yanıt vermedi.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('approval-retry'));
    await waitFor(() => expect(retrySpy).toHaveBeenCalledWith(APPROVAL_AHMET_REPLY));
    await screen.findByText('Tamamlandı', {}, { timeout: 5000 });
  });

  it('asks for the missing write scope, grants it through OAuth and approves again', async () => {
    resetParams({ id: APPROVAL_AHMET_REPLY });
    const ds = getTestDataSource();
    const current = await ds.approvals.getApproval(APPROVAL_AHMET_REPLY);
    const original = ds.approvals.decideApproval.bind(ds.approvals);
    const decideSpy = jest
      .spyOn(ds.approvals, 'decideApproval')
      .mockImplementationOnce(async (): Promise<DecideApprovalResponse> => ({
        approval: current,
        status: 'pending',
        requiredScope: 'https://www.googleapis.com/auth/gmail.send',
      }))
      .mockImplementation(original);
    const startSpy = jest.spyOn(ds.accounts, 'startOAuth');
    const screen = renderWithProviders(<ApprovalScreen />);
    await screen.findByTestId('approval-approve', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('approval-approve'));
    await screen.findByText('Ek izin gerekli', {}, { timeout: 5000 });
    await screen.findByTestId('approval-scope-grant', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('approval-scope-grant'));
    await waitFor(() =>
      expect(startSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          scopeGroup: 'mail_send',
          accountId: ACCOUNT_GMAIL,
        }),
      ),
    );
    await waitFor(() => expect(decideSpy).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await screen.findByText('Tamamlandı', {}, { timeout: 5000 });
    const account = (await ds.accounts.listAccounts()).find((a) => a.id === ACCOUNT_GMAIL);
    expect(account?.grantedScopes).toContain('https://www.googleapis.com/auth/gmail.send');
  });
});

describe('Smart reminder sheet', () => {
  beforeEach(() =>
    resetParams({
      targetType: 'email_thread',
      targetId: THREAD_AHMET_REVIZE,
      title: 'Revize teklif',
      dueAt: '2026-09-05T14:00:00.000Z',
    }),
  );

  it('offers six options, explains the smart time and creates a reminder_create approval', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.approvals, 'createApproval');
    const screen = renderWithProviders(<ReminderSheetScreen />);
    await screen.findByTestId('reminder-option-smart', {}, { timeout: 5000 });
    expect(screen.getByText('Ne zaman hatırlatayım?')).toBeTruthy();
    for (const key of [
      'before_30m',
      'before_1h',
      'this_evening',
      'tomorrow_morning',
      'smart',
      'custom',
    ])
      expect(screen.getByTestId(`reminder-option-${key}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('reminder-option-this_evening'));
    fireEvent.press(screen.getByTestId('reminder-option-smart'));
    expect(screen.getByText(/Takviminde .* boş/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('reminder-confirm'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'reminder_create',
          requestedBy: 'reminder',
          payload: expect.objectContaining({
            title: 'Revize teklif',
            option: 'smart',
            targetType: 'email_thread',
            targetId: THREAD_AHMET_REVIZE,
            smartReason: expect.stringContaining('Takviminde'),
          }),
        }),
      ),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/approvals/[id]' }),
      ),
    );
  });

  it('opens the custom picker for Kendin seç', async () => {
    const screen = renderWithProviders(<ReminderSheetScreen />);
    await screen.findByTestId('reminder-option-custom', {}, { timeout: 5000 });
    fireEvent.press(screen.getByTestId('reminder-option-custom'));
    expect(screen.getByTestId('reminder-custom-picker')).toBeTruthy();
    fireEvent.press(screen.getByTestId('reminder-custom-done'));
    await screen.findByTestId('reminder-option-custom');
    expect(screen.getByTestId('reminder-confirm').props.accessibilityState?.disabled).toBe(false);
  });
});

describe('OAuth return', () => {
  async function startDemoOAuth() {
    const ds = getTestDataSource();
    const start = await ds.accounts.startOAuth({
      provider: 'google',
      kinds: ['calendar'],
      redirectTo: 'dijitalasistan://oauth/google',
    });
    const query = start.authorizationUrl.split('?')[1] ?? '';
    const params = Object.fromEntries(
      query.split('&').map((p) => p.split('=') as [string, string]),
    );
    return { state: start.state, accountId: params.accountId ?? '' };
  }

  it('completes the connection and returns to onboarding while onboarding is open', async () => {
    const { state, accountId } = await startDemoOAuth();
    resetParams({ provider: 'google', state, status: 'ok', accountId });
    const screen = renderWithProviders(<OAuthReturnScreen />);
    expect(screen.getByTestId('oauth-status')).toBeTruthy();
    await screen.findByTestId('oauth-done', {}, { timeout: 5000 });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/connect'), {
      timeout: 3000,
    });
  });

  it('returns to Integrations once onboarding is completed', async () => {
    useSessionStore.setState({ onboardingCompleted: true });
    const { state, accountId } = await startDemoOAuth();
    resetParams({ provider: 'google', state, status: 'ok', accountId });
    renderWithProviders(<OAuthReturnScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/settings/integrations'), {
      timeout: 3000,
    });
  });

  it('shows the calm error state with a retry when the state is unknown', async () => {
    resetParams({ provider: 'google', state: 'nope', status: 'ok' });
    const screen = renderWithProviders(<OAuthReturnScreen />);
    await screen.findByTestId('oauth-error', {}, { timeout: 5000 });
    expect(screen.getByText('Bağlantı kurulamadı.')).toBeTruthy();
    fireEvent.press(screen.getByText('Tekrar dene'));
    await screen.findByTestId('oauth-error', {}, { timeout: 5000 });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
