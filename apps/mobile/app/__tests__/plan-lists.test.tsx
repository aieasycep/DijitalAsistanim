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
  usePathname: () => '/followups',
  useFocusEffect: jest.fn(),
}));

import type { ReactElement } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { track } from '@/lib/analytics';
import CommitmentsScreen from '../commitments';
import FollowUpsScreen from '../followups';
import WaitingScreen from '../waiting';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

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
const THREAD_AHMET_REVIZE = seed('e1');
const THREAD_SELIN_SOZLESME = seed('e2');
const THREAD_MEHMET_TEKLIF_V2 = seed('e4');
const THREAD_HUKUK_SOZLESME = seed('ec');
const COMMITMENT_MEHMET_TEKLIF = seed('2701');
const COMMITMENT_SELIN_YORUM = seed('2702');
const COMMITMENT_MEHMET_FEEDBACK = seed('2703');
const FOLLOWUP_MEHMET_TEKLIF = seed('2801');
const FOLLOWUP_HUKUK_SOZLESME = seed('2802');
const INSIGHT_AHMET_REVIZE = seed('3101');
const INSIGHT_SELIN_WAITING = seed('3106');
const POST_MEETING_NOTE_MEHMET = seed('3901');

/** Postpone options are 09:00 Europe/Istanbul (UTC+3) on the target day; the clock is Sat 5 Sep 2026. */
const TOMORROW_0900 = '2026-09-06T06:00:00.000Z';
const NEXT_WEEK_0900 = '2026-09-12T06:00:00.000Z';

const FIND = { timeout: 5000 };

describe('Follow-ups screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
    (track as jest.Mock).mockClear();
  });

  it('lists unanswered mails oldest first with draft / snooze / close actions', async () => {
    const screen = renderScreen(<FollowUpsScreen />);
    expect(screen.getByTestId('followups-screen')).toBeTruthy();
    expect(screen.getByText('Takip Etmen Gerekenler')).toBeTruthy();
    await screen.findByTestId(`followup-${FOLLOWUP_HUKUK_SOZLESME}`, {}, FIND);
    expect(screen.getByTestId(`followup-${FOLLOWUP_MEHMET_TEKLIF}`)).toBeTruthy();
    expect(screen.getByText(/^2 gönderdiğin mail yanıtsız\. En eskisi \d+ gün\.$/)).toBeTruthy();

    // Oldest (Hukuk, 14 days) before the newest (Mehmet, 3 days).
    const cards = screen.getAllByTestId(/^followup-00000000/);
    expect(cards.map((c) => c.props.testID)).toEqual([
      `followup-${FOLLOWUP_HUKUK_SOZLESME}`,
      `followup-${FOLLOWUP_MEHMET_TEKLIF}`,
    ]);
    expect(screen.getByText('Hukuk Ekibi')).toBeTruthy();
    expect(screen.getByText('Sözleşme yorumu')).toBeTruthy();
    expect(screen.getByText('Mehmet Yılmaz')).toBeTruthy();
    expect(screen.getByText('Teklif v2')).toBeTruthy();
    expect(screen.getAllByText('Henüz yanıt gelmedi.')).toHaveLength(2);
    expect(screen.getAllByText(/^\d+ gündür bekliyor$/)).toHaveLength(2);
    for (const id of [FOLLOWUP_HUKUK_SOZLESME, FOLLOWUP_MEHMET_TEKLIF]) {
      expect(screen.getByTestId(`followup-draft-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`followup-snooze-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`followup-close-${id}`)).toBeTruthy();
    }
    expect(screen.getByText(/Bir kişiyi “Takip etme” dersen/)).toBeTruthy();

    // "Takip Mesajı Hazırla" opens the reply composer for that thread + follow-up.
    fireEvent.press(screen.getByTestId(`followup-draft-${FOLLOWUP_MEHMET_TEKLIF}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/email/[id]/reply',
      params: { id: THREAD_MEHMET_TEKLIF_V2, followUpId: FOLLOWUP_MEHMET_TEKLIF },
    });
    // The person card itself opens the original thread.
    fireEvent.press(screen.getByLabelText(/^Hukuk Ekibi · Sözleşme yorumu · /));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_HUKUK_SOZLESME },
    });
  });

  it('closes follow-ups (Takibi Kapat) until the list is empty', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.email, 'closeFollowUp');
    const screen = renderScreen(<FollowUpsScreen />);
    await screen.findByTestId(`followup-close-${FOLLOWUP_HUKUK_SOZLESME}`, {}, FIND);

    fireEvent.press(screen.getByTestId(`followup-close-${FOLLOWUP_HUKUK_SOZLESME}`));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(FOLLOWUP_HUKUK_SOZLESME));
    await screen.findByText('Takip kapatıldı', {}, FIND);
    await waitFor(() =>
      expect(screen.queryByTestId(`followup-${FOLLOWUP_HUKUK_SOZLESME}`)).toBeNull(),
    );
    expect(track).toHaveBeenCalledWith('followup_completed', { daysWaited: expect.any(Number) });
    expect(screen.getByText(/^1 gönderdiğin mail yanıtsız\./)).toBeTruthy();

    fireEvent.press(screen.getByTestId(`followup-close-${FOLLOWUP_MEHMET_TEKLIF}`));
    await screen.findByTestId('followups-empty', {}, FIND);
    expect(screen.getAllByText('Bekleyen takip yok.').length).toBeGreaterThan(0);
    expect(screen.getByText('Gönderdiğin tüm maillere yanıt gelmiş.')).toBeTruthy();
    expect(await ds.email.listFollowUps()).toHaveLength(0);
  });

  it('snoozes a follow-up until tomorrow 09:00 through the postpone sheet', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.email, 'snoozeFollowUp');
    const screen = renderScreen(<FollowUpsScreen />);
    await screen.findByTestId(`followup-snooze-${FOLLOWUP_MEHMET_TEKLIF}`, {}, FIND);
    expect(screen.queryByTestId('followup-snooze-tomorrow')).toBeNull();

    fireEvent.press(screen.getByTestId(`followup-snooze-${FOLLOWUP_MEHMET_TEKLIF}`));
    const tomorrow = await screen.findByTestId('followup-snooze-tomorrow', {}, FIND);
    expect(screen.getByText('Ne zaman hatırlatayım?')).toBeTruthy();
    expect(screen.getByTestId('followup-snooze-threeDays')).toBeTruthy();
    expect(screen.getByTestId('followup-snooze-week')).toBeTruthy();
    fireEvent.press(tomorrow);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(FOLLOWUP_MEHMET_TEKLIF, TOMORROW_0900));
    await waitFor(() =>
      expect(screen.getAllByText(/^Takip ertelendi · /).length).toBeGreaterThan(0),
    );
    const stored = (await ds.email.listFollowUps()).find((f) => f.id === FOLLOWUP_MEHMET_TEKLIF);
    expect(stored?.status).toBe('snoozed');
    expect(stored?.snoozedUntil).toBe(TOMORROW_0900);
  });

  it('shows the error state and recovers on retry', async () => {
    const ds = getTestDataSource();
    jest.spyOn(ds.email, 'listFollowUps').mockRejectedValueOnce(new Error('boom'));
    const screen = renderScreen(<FollowUpsScreen />);
    await screen.findAllByText('Bir şeyler ters gitti.', {}, FIND);
    expect(screen.queryByTestId(`followup-${FOLLOWUP_HUKUK_SOZLESME}`)).toBeNull();
    fireEvent.press(screen.getByText('Tekrar dene'));
    await screen.findByTestId(`followup-${FOLLOWUP_HUKUK_SOZLESME}`, {}, FIND);
  });
});

describe('Commitments screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('groups open commitments into "verdiğin" / "sana verilen" with status badges', async () => {
    const screen = renderScreen(<CommitmentsScreen />);
    expect(screen.getByTestId('commitments-screen')).toBeTruthy();
    expect(screen.getByText('Taahhütler')).toBeTruthy();
    await screen.findByTestId('commitments-mine', {}, FIND);
    expect(screen.getByTestId('commitments-theirs')).toBeTruthy();
    expect(screen.getByText('3 açık, 0 gecikmiş.')).toBeTruthy();
    // Section kickers are upper-cased with Turkish casing rules (dotted İ) by the Text primitive.
    expect(screen.getByText('SENİN VERDİĞİN SÖZLER')).toBeTruthy();
    expect(screen.getByText('SANA VERİLEN SÖZLER')).toBeTruthy();

    const mine = within(screen.getByTestId('commitments-mine'));
    const theirs = within(screen.getByTestId('commitments-theirs'));
    // Mine, sorted by due date: Selin (tomorrow 12:00) before Mehmet (tomorrow 18:00).
    expect(mine.getAllByTestId(/^commitment-00000000/).map((c) => c.props.testID)).toEqual([
      `commitment-${COMMITMENT_SELIN_YORUM}`,
      `commitment-${COMMITMENT_MEHMET_TEKLIF}`,
    ]);
    expect(mine.getByText("Mehmet'e teklif gönder")).toBeTruthy();
    expect(mine.getByText('“yarın göndereceğim”')).toBeTruthy();
    expect(mine.getAllByText('AÇIK')).toHaveLength(2);
    expect(mine.getAllByText('Kime')).toHaveLength(2);
    // Theirs: Mehmet's feedback is due today.
    expect(theirs.getByTestId(`commitment-${COMMITMENT_MEHMET_FEEDBACK}`)).toBeTruthy();
    expect(theirs.getByText('Mehmet Teklif v2 geri bildirimi gönderecek')).toBeTruthy();
    expect(theirs.getByText('BUGÜN')).toBeTruthy();
    expect(theirs.getByText('Kimden')).toBeTruthy();
    for (const id of [
      COMMITMENT_SELIN_YORUM,
      COMMITMENT_MEHMET_TEKLIF,
      COMMITMENT_MEHMET_FEEDBACK,
    ]) {
      expect(screen.getByTestId(`commitment-done-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`commitment-postpone-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`commitment-source-${id}`)).toBeTruthy();
    }
  });

  it('completes a commitment (Tamamlandı) and drops it from the list', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.plan, 'completeCommitment');
    const screen = renderScreen(<CommitmentsScreen />);
    await screen.findByTestId(`commitment-done-${COMMITMENT_SELIN_YORUM}`, {}, FIND);

    fireEvent.press(screen.getByTestId(`commitment-done-${COMMITMENT_SELIN_YORUM}`));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(COMMITMENT_SELIN_YORUM));
    await screen.findByText('Taahhüt tamamlandı', {}, FIND);
    await waitFor(() =>
      expect(screen.queryByTestId(`commitment-${COMMITMENT_SELIN_YORUM}`)).toBeNull(),
    );
    expect(screen.getByText('2 açık, 0 gecikmiş.')).toBeTruthy();
    expect((await ds.plan.getCommitment(COMMITMENT_SELIN_YORUM)).status).toBe('completed');
  });

  it('postpones a commitment by a week through the sheet', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.plan, 'postponeCommitment');
    const screen = renderScreen(<CommitmentsScreen />);
    await screen.findByTestId(`commitment-postpone-${COMMITMENT_MEHMET_TEKLIF}`, {}, FIND);

    fireEvent.press(screen.getByTestId(`commitment-postpone-${COMMITMENT_MEHMET_TEKLIF}`));
    const week = await screen.findByTestId('commitment-postpone-week', {}, FIND);
    expect(screen.getByText('Ne zamana erteleyelim?')).toBeTruthy();
    expect(screen.getByText('1 hafta sonra')).toBeTruthy();
    fireEvent.press(week);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(COMMITMENT_MEHMET_TEKLIF, NEXT_WEEK_0900));
    const card = await screen.findByTestId(`commitment-${COMMITMENT_MEHMET_TEKLIF}`, {}, FIND);
    await waitFor(() => expect(within(card).getByText('ERTELENDİ')).toBeTruthy());
    expect(screen.getAllByText(/^Ertelendi · /).length).toBeGreaterThan(0);
    const stored = await ds.plan.getCommitment(COMMITMENT_MEHMET_TEKLIF);
    expect(stored.status).toBe('postponed');
    expect(stored.postponedUntil).toBe(NEXT_WEEK_0900);
  });

  it('opens the source of a commitment (meeting note or mail)', async () => {
    const screen = renderScreen(<CommitmentsScreen />);
    await screen.findByTestId(`commitment-source-${COMMITMENT_MEHMET_TEKLIF}`, {}, FIND);
    fireEvent.press(screen.getByTestId(`commitment-source-${COMMITMENT_MEHMET_TEKLIF}`));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/meeting/[id]/post',
      params: { id: POST_MEETING_NOTE_MEHMET },
    });
    fireEvent.press(screen.getByTestId(`commitment-source-${COMMITMENT_SELIN_YORUM}`));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_SELIN_SOZLESME },
    });
  });

  it('confirms a proposed commitment with "Evet, kaydet"', async () => {
    const ds = getTestDataSource();
    const feedback = await ds.plan.getCommitment(COMMITMENT_MEHMET_FEEDBACK);
    jest
      .spyOn(ds.plan, 'listCommitments')
      .mockResolvedValueOnce([{ ...feedback, status: 'proposed' }]);
    const spy = jest.spyOn(ds.plan, 'confirmCommitment');
    const screen = renderScreen(<CommitmentsScreen />);
    const confirm = await screen.findByTestId(
      `commitment-confirm-${COMMITMENT_MEHMET_FEEDBACK}`,
      {},
      FIND,
    );
    expect(screen.getByText('ÖNERİLEN')).toBeTruthy();
    expect(screen.getByTestId(`commitment-reject-${COMMITMENT_MEHMET_FEEDBACK}`)).toBeTruthy();
    expect(screen.queryByTestId(`commitment-done-${COMMITMENT_MEHMET_FEEDBACK}`)).toBeNull();

    fireEvent.press(confirm);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(COMMITMENT_MEHMET_FEEDBACK, true));
    await screen.findByText('Taahhüt kaydedildi', {}, FIND);
    // The real list comes back: the commitment is open and due today.
    await screen.findByTestId(`commitment-done-${COMMITMENT_MEHMET_FEEDBACK}`, {}, FIND);
    expect(screen.getByText('BUGÜN')).toBeTruthy();
  });

  it('shows the empty state when nothing is open', async () => {
    const ds = getTestDataSource();
    jest.spyOn(ds.plan, 'listCommitments').mockResolvedValue([]);
    const screen = renderScreen(<CommitmentsScreen />);
    await screen.findByTestId('commitments-empty', {}, FIND);
    expect(screen.getByText('Açık taahhüt yok.')).toBeTruthy();
    expect(screen.getByText('0 açık, 0 gecikmiş.')).toBeTruthy();
    expect(screen.queryByTestId('commitments-mine')).toBeNull();
  });
});

describe('Waiting-for-you screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('groups the people waiting for an answer by urgency', async () => {
    const screen = renderScreen(<WaitingScreen />);
    expect(screen.getByTestId('waiting-screen')).toBeTruthy();
    expect(screen.getByText('Senden Beklenenler')).toBeTruthy();
    await screen.findByTestId('waiting-group-urgent', {}, FIND);
    expect(screen.getByText('2 kişi cevabını bekliyor.')).toBeTruthy();
    // Group kickers render upper-cased; "ACİL" also appears as the urgency badge of both cards.
    expect(screen.getAllByText('ACİL')).toHaveLength(3);
    expect(screen.getByText('YAKINDA')).toBeTruthy();
    expect(screen.queryByTestId('waiting-group-today')).toBeNull();

    // Ahmet's critical thread is urgent; Selin's (due tomorrow) is "soon".
    const urgent = within(screen.getByTestId('waiting-group-urgent'));
    expect(urgent.getByTestId(`waiting-item-${INSIGHT_AHMET_REVIZE}`)).toBeTruthy();
    expect(
      urgent.getByText("Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor."),
    ).toBeTruthy();
    const soon = within(screen.getByTestId('waiting-group-soon'));
    expect(soon.getByTestId(`waiting-item-${INSIGHT_SELIN_WAITING}`)).toBeTruthy();
    expect(soon.getByText('Selin sözleşme taslağı için yorumunu bekliyor.')).toBeTruthy();

    // Card body opens the mail; its primary action opens the reply composer.
    fireEvent.press(urgent.getByLabelText(/Ahmet senden bugün 17:00'ye kadar/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/email/[id]',
      params: { id: THREAD_AHMET_REVIZE },
    });
    fireEvent.press(urgent.getByLabelText('Yanıtla'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenLastCalledWith({
        pathname: '/email/[id]/reply',
        params: { id: THREAD_AHMET_REVIZE },
      }),
    );
  });

  it('opens the card menu and jumps to the source from it', async () => {
    const screen = renderScreen(<WaitingScreen />);
    await screen.findByTestId(`waiting-item-${INSIGHT_SELIN_WAITING}`, {}, FIND);
    expect(screen.queryByTestId('insight-menu-source')).toBeNull();
    const card = within(screen.getByTestId(`waiting-item-${INSIGHT_SELIN_WAITING}`));
    fireEvent.press(card.getByLabelText('Diğer seçenekler'));
    const source = await screen.findByTestId('insight-menu-source', {}, FIND);
    expect(screen.getByText('Yarın öğlen hukuk departmanına gidecek.')).toBeTruthy();
    fireEvent.press(source);
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/email/[id]',
        params: { id: THREAD_SELIN_SOZLESME },
      }),
    );
  });

  it('shows the calm empty state when nobody is waiting', async () => {
    const ds = getTestDataSource();
    jest.spyOn(ds.feed, 'listWaitingForUser').mockResolvedValue([]);
    const screen = renderScreen(<WaitingScreen />);
    await screen.findByTestId('waiting-empty', {}, FIND);
    expect(screen.getAllByText('Senden cevap bekleyen kimse yok.').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('waiting-group-urgent')).toBeNull();
  });
});
