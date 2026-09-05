import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { fireEvent, screen } from '@testing-library/react-native';
import type { FormatCtx } from '@da/i18n';
import { PrioritySection, insightTimeLabel } from '../PrioritySection';
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

const ctx: FormatCtx = {
  locale: 'tr',
  timezone: 'Europe/Istanbul',
  now: new Date('2026-09-05T06:00:00.000Z'),
};

beforeAll(() => setupTestI18n());

describe('PrioritySection', () => {
  it('renders at most five cards with the section count', () => {
    const insights = Array.from({ length: 7 }, () => makeInsight());
    renderWithProviders(<PrioritySection insights={insights} ctx={ctx} />);
    expect(screen.getByText('ÖNCELİKLERİN')).toBeTruthy();
    expect(screen.getByText('5 konu')).toBeTruthy();
    expect(screen.getAllByTestId(/^priority-card-/)).toHaveLength(5);
  });

  it('renders nothing when there are no insights', () => {
    renderWithProviders(<PrioritySection insights={[]} ctx={ctx} />);
    expect(screen.queryByText('ÖNCELİKLERİN')).toBeNull();
  });

  it('wires complete, more and actions to the card', () => {
    const insight = makeInsight({ id: 'ins-x', title: 'Ahmet revize teklif bekliyor.' });
    const onComplete = jest.fn();
    const onMore = jest.fn();
    const onAction = jest.fn();
    renderWithProviders(
      <PrioritySection
        insights={[insight]}
        ctx={ctx}
        onComplete={onComplete}
        onMore={onMore}
        onAction={onAction}
      />,
    );

    expect(screen.getByTestId('priority-card-ins-x')).toBeTruthy();
    expect(screen.getByText('ACİL')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Diğer seçenekler'));
    fireEvent.press(screen.getByLabelText('Tamamlandı olarak işaretle'));
    fireEvent.press(screen.getByText('Yanıtla'));
    expect(onMore).toHaveBeenCalledWith(insight);
    expect(onComplete).toHaveBeenCalledWith(insight);
    expect(onAction).toHaveBeenCalledWith(insight.actions[0], insight);
  });

  it('supports index-based testIDs for the aha preview', () => {
    const insights = [makeInsight(), makeInsight()];
    renderWithProviders(
      <PrioritySection
        insights={insights}
        ctx={ctx}
        readOnly
        testIDFor={(_i, index) => `aha-card-${index}`}
      />,
    );
    expect(screen.getByTestId('aha-card-0')).toBeTruthy();
    expect(screen.getByTestId('aha-card-1')).toBeTruthy();
  });

  it('prefers the engine time label and falls back to a relative label', () => {
    expect(insightTimeLabel(makeInsight({ timeLabel: '3 gün' }), ctx)).toBe('3 gün');
    expect(
      insightTimeLabel(makeInsight({ timeLabel: null, dueAt: '2026-09-05T14:00:00.000Z' }), ctx),
    ).toBe('17:00');
  });
});
