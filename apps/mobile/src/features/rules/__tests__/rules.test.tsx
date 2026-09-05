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
jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  trackScreen: jest.fn(),
  resetAnalytics: jest.fn(),
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
  usePathname: () => '/settings/priority-rules',
  useFocusEffect: jest.fn(),
}));

import { QueryClient } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import PriorityRulesScreen from '../../../../app/settings/priority-rules';
import AiPersonalizationScreen from '../../../../app/settings/ai-personalization';
import { getTestDataSource, resetTestDataSource } from '@/features/flow/testing/demoSource';
import { renderWithProviders } from '@/features/flow/testing/renderWithProviders';

import { useSessionStore } from '@/store/session';
import {
  defaultRuleLabel,
  isValidRuleValue,
  normalizeRuleValue,
  ruleValueForDisplay,
} from '../ruleTypes';
import { groupForKind } from '../useLearnedPreferences';

/** Mutations must not keep 5-minute GC timers alive after a test (would stall Jest's exit). */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}

/** Seed ids (mirror packages/api-client/src/demo/ids.ts). */
const RULE_PROMOTIONS = '00000000-0000-4000-8000-000000002401';
const RULE_DOMAIN = '00000000-0000-4000-8000-000000002402';
const LEARNED_MEHMET = '00000000-0000-4000-8000-000000002501';
const LEARNED_PROMOTIONS = '00000000-0000-4000-8000-000000002502';
const LEARNED_REMINDER_LEAD = '00000000-0000-4000-8000-000000002503';

const FIND_OPTS = { timeout: 5000 };

describe('rule metadata', () => {
  it('normalises and validates values per rule type', () => {
    expect(normalizeRuleValue('domain', ' @Sirket.com ')).toBe('sirket.com');
    expect(normalizeRuleValue('email', 'Ahmet@Firma.com')).toBe('ahmet@firma.com');
    expect(normalizeRuleValue('none', 'anything')).toBe('*');
    expect(isValidRuleValue('email', 'ahmet@firma.com')).toBe(true);
    expect(isValidRuleValue('email', 'ahmet')).toBe(false);
    expect(isValidRuleValue('domain', 'sirket.com')).toBe(true);
    expect(isValidRuleValue('domain', 'sirket')).toBe(false);
    expect(isValidRuleValue('keyword', 'a')).toBe(false);
    expect(ruleValueForDisplay({ type: 'vip_notify', value: '*' })).toBeNull();
    expect(
      defaultRuleLabel('domain_important', 'musteri.com', {
        typeLabel: 'T',
        outcomeLabel: 'Her zaman önemli',
      }),
    ).toBe('musteri.com · Her zaman önemli');
    expect(defaultRuleLabel('vip_notify', '*', { typeLabel: 'T', outcomeLabel: 'O' })).toBe('T');
  });

  it('groups learned preferences by kind', () => {
    expect(groupForKind('person_priority')).toBe('people');
    expect(groupForKind('category_priority')).toBe('topics');
    expect(groupForKind('reminder_lead_time')).toBe('preferences');
  });
});

describe('Priority rules screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    useSessionStore.setState({ preferences: null, entitlement: null });
  });

  it('lists the seeded rules in priority order with the precedence copy', async () => {
    const screen = renderWithProviders(<PriorityRulesScreen />, { queryClient: makeClient() });
    expect(screen.getByTestId('rules-screen')).toBeTruthy();
    await screen.findByTestId(`rule-${RULE_PROMOTIONS}`, {}, FIND_OPTS);
    expect(screen.getByTestId(`rule-${RULE_DOMAIN}`)).toBeTruthy();
    expect(
      screen.getByText(
        "Senin yazdığın açık kurallar. Her zaman AI'ın kendi öğrendiklerinin önüne geçer.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('2 kural')).toBeTruthy();
    fireEvent.press(screen.getByTestId('rules-ai-link'));
    expect(mockPush).toHaveBeenCalledWith('/settings/ai-personalization');
  });

  it('adds a keyword rule from the sheet with a generated label', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<PriorityRulesScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`rule-${RULE_PROMOTIONS}`, {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId('rules-add'));
    const typeRow = await screen.findByTestId('rule-type-keyword_high', {}, FIND_OPTS);
    fireEvent.press(typeRow);
    fireEvent.changeText(screen.getByTestId('rule-value'), ' fatura ');
    fireEvent.press(screen.getByTestId('rule-save'));
    await waitFor(async () => {
      const rules = await ds.rules.listRules();
      expect(rules.some((r) => r.type === 'keyword_high' && r.value === 'fatura')).toBe(true);
    });
    const created = (await ds.rules.listRules()).find((r) => r.type === 'keyword_high');
    expect(created?.label).toBe('fatura · Her zaman önemli');
    expect(created?.position).toBe(2);
    await screen.findByText('3 kural', {}, FIND_OPTS);
  });

  it('reorders with the arrows and toggles a rule off', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<PriorityRulesScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`rule-${RULE_PROMOTIONS}`, {}, FIND_OPTS);
    expect(
      screen.getByTestId(`rule-up-${RULE_PROMOTIONS}`).props.accessibilityState?.disabled,
    ).toBe(true);
    fireEvent.press(screen.getByTestId(`rule-down-${RULE_PROMOTIONS}`));
    await waitFor(async () => {
      const rules = await ds.rules.listRules();
      expect(rules.find((r) => r.id === RULE_DOMAIN)?.position).toBe(0);
      expect(rules.find((r) => r.id === RULE_PROMOTIONS)?.position).toBe(1);
    });
    fireEvent.press(screen.getByTestId(`rule-toggle-${RULE_DOMAIN}`));
    await waitFor(async () => {
      const rules = await ds.rules.listRules();
      expect(rules.find((r) => r.id === RULE_DOMAIN)?.enabled).toBe(false);
    });
  });

  it('deletes a rule only after the confirmation modal', async () => {
    const ds = getTestDataSource();
    const spy = jest.spyOn(ds.rules, 'deleteRule');
    const screen = renderWithProviders(<PriorityRulesScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`rule-${RULE_DOMAIN}`, {}, FIND_OPTS);
    fireEvent.press(screen.getByTestId(`rule-delete-${RULE_DOMAIN}`));
    expect(spy).not.toHaveBeenCalled();
    const confirm = await screen.findByText('Sil', {}, FIND_OPTS);
    fireEvent.press(confirm);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(RULE_DOMAIN));
    await waitFor(() => expect(screen.queryByTestId(`rule-${RULE_DOMAIN}`)).toBeNull());
  });
});

describe('AI personalization screen', () => {
  beforeEach(() => {
    resetTestDataSource();
    mockPush.mockClear();
    useSessionStore.setState({ preferences: null, entitlement: null });
  });

  it('shows learned preferences grouped, toggles and deletes them', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<AiPersonalizationScreen />, { queryClient: makeClient() });
    await screen.findByTestId(`learned-${LEARNED_MEHMET}`, {}, FIND_OPTS);
    expect(screen.getByText('KİŞİLER')).toBeTruthy();
    expect(screen.getByText('KONULAR')).toBeTruthy();
    expect(screen.getByText('TERCİHLER')).toBeTruthy();
    expect(
      screen.getByText('Açık kurallar her zaman öğrenilen tercihlerden önce gelir.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId(`learned-toggle-${LEARNED_PROMOTIONS}`));
    await waitFor(async () => {
      const learned = await ds.rules.listLearnedPreferences();
      expect(learned.find((l) => l.id === LEARNED_PROMOTIONS)?.enabled).toBe(false);
    });

    fireEvent.press(screen.getByTestId(`learned-delete-${LEARNED_REMINDER_LEAD}`));
    const confirm = await screen.findByText('Sil', {}, FIND_OPTS);
    fireEvent.press(confirm);
    await waitFor(async () => {
      const learned = await ds.rules.listLearnedPreferences();
      expect(learned.some((l) => l.id === LEARNED_REMINDER_LEAD)).toBe(false);
    });
    await waitFor(() =>
      expect(screen.queryByTestId(`learned-${LEARNED_REMINDER_LEAD}`)).toBeNull(),
    );
  });

  it('persists the learn toggle and links to the explicit rules', async () => {
    const ds = getTestDataSource();
    const screen = renderWithProviders(<AiPersonalizationScreen />, { queryClient: makeClient() });
    const toggle = await screen.findByTestId('ai-learn-toggle', {}, FIND_OPTS);
    await waitFor(() => expect(toggle.props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(screen.getByTestId('ai-learn-toggle'));
    await waitFor(async () =>
      expect((await ds.profile.getPreferences()).learnFromInteractions).toBe(false),
    );
    expect(useSessionStore.getState().preferences?.learnFromInteractions).toBe(false);
    fireEvent.press(screen.getByTestId('ai-rules-link'));
    expect(mockPush).toHaveBeenCalledWith('/settings/priority-rules');
  });
});
