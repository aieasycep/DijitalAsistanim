import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen } from '@testing-library/react-native';
import type { Briefing } from '@da/domain';
import { HeroBriefingCard, splitHighlight } from '../HeroBriefingCard';
import { renderWithProviders, setupTestI18n } from './testUtils';

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

const briefing: Briefing = {
  id: 'b-1',
  userId: 'user-1',
  kind: 'morning',
  forDate: '2026-09-05',
  generatedAt: '2026-09-05T04:58:00.000Z',
  headline: 'Bugün bilmen gereken 5 şey var.',
  highlightNumber: 5,
  subline: '3 önemli mail · 4 etkinlik · 2 takip',
  mood: 'Bugün oldukça sakin bir günün var.',
  narrative: 'Öğlene kadar toplantın bulunmuyor.',
  outlook: null,
  counts: {
    importantEmails: 3,
    events: 4,
    followUps: 2,
    deadlines: 1,
    total: 5,
    analyzedEmails: 46,
    analyzedCalendars: 2,
    analyzedDays: 3,
  },
  items: [],
  audio: { provider: 'device_tts', url: null, durationSec: 134, chapters: [], script: '' },
  estimatedReadSec: 120,
  openedAt: null,
  closedAt: null,
  weekly: null,
  hasChanges: true,
  version: 1,
  createdAt: '2026-09-05T04:58:00.000Z',
  updatedAt: '2026-09-05T04:58:00.000Z',
};

beforeAll(() => setupTestI18n());

describe('HeroBriefingCard', () => {
  it('shows the headline, subline and both CTAs for a ready briefing', () => {
    const onOpen = jest.fn();
    const onListen = jest.fn();
    renderWithProviders(
      <HeroBriefingCard
        briefing={briefing}
        isEvening={false}
        readyTimeLabel="07:58"
        onOpen={onOpen}
        onListen={onListen}
        onRefresh={jest.fn()}
      />,
    );

    expect(screen.getByText('BRİFİNG HAZIR · 07:58')).toBeTruthy();
    expect(screen.getByText('3 önemli mail · 4 etkinlik · 2 takip')).toBeTruthy();
    fireEvent.press(screen.getByTestId('today-hero-cta'));
    fireEvent.press(screen.getByTestId('today-hero-listen'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onListen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Dinle · 2 dk')).toBeTruthy();
  });

  it('renders the preparing state with a refresh CTA and no listen button', () => {
    const onRefresh = jest.fn();
    renderWithProviders(
      <HeroBriefingCard
        briefing={null}
        isEvening={false}
        onOpen={jest.fn()}
        onListen={jest.fn()}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText('BRİFİNG HAZIRLANIYOR')).toBeTruthy();
    expect(screen.getByText('Brifingin hazırlanıyor.')).toBeTruthy();
    expect(screen.queryByTestId('today-hero-listen')).toBeNull();
    fireEvent.press(screen.getByTestId('today-hero-cta'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('switches to the evening close entry after 18:00', () => {
    renderWithProviders(
      <HeroBriefingCard
        briefing={{
          ...briefing,
          kind: 'evening',
          headline: 'Bugünden yarına 2 konu kaldı.',
          highlightNumber: 2,
        }}
        isEvening
        onOpen={jest.fn()}
        onListen={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );
    expect(screen.getByText('AKŞAM KAPANIŞI HAZIR')).toBeTruthy();
    expect(screen.getByText('Günü Kapat')).toBeTruthy();
  });

  it('splits the headline around the highlight number', () => {
    expect(splitHighlight('Bugün bilmen gereken 5 şey var.', 5)).toEqual([
      'Bugün bilmen gereken ',
      '5',
      ' şey var.',
    ]);
    expect(splitHighlight('Her şey kontrol altında.', 0)).toBeNull();
  });
});
