/**
 * Shared helpers for the Today suites (providers, i18n bootstrap, insight fixtures). Jest also treats this file
 * as a suite because it lives under `__tests__`, so it carries one self-guarded smoke test.
 */
import type { PropsWithChildren, ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Reanimated 4's Jest mock pulls in react-native-worklets, whose native entry has no Jest shim of its own.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
import { render, type RenderOptions } from '@testing-library/react-native';
import { initReactI18next } from 'react-i18next';
import { createI18n } from '@da/i18n';
import { ThemeProvider, ToastProvider } from '@da/ui';
import type { Insight } from '@da/domain';

let i18nReady: Promise<unknown> | null = null;

/** Initialises react-i18next with the Turkish resources (mirrors `setupI18n` without native locale lookups). */
export function setupTestI18n(): Promise<unknown> {
  if (!i18nReady) {
    const i18n = createI18n('tr');
    i18n.use(initReactI18next);
    i18nReady = i18n.init({});
  }
  return i18nReady;
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: 0 } },
  });
}

export function Providers({ children, client }: PropsWithChildren<{ client?: QueryClient }>) {
  return (
    <QueryClientProvider client={client ?? createTestQueryClient()}>
      <ThemeProvider forceScheme="light">
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & { client?: QueryClient } = {},
) {
  const { client, ...rest } = options;
  return render(ui, {
    wrapper: ({ children }) => <Providers client={client}>{children}</Providers>,
    ...rest,
  });
}

let seq = 0;

/** Minimal valid Insight for component tests. */
export function makeInsight(partial: Partial<Insight> = {}): Insight {
  seq += 1;
  const id = partial.id ?? `ins-${seq}`;
  return {
    id,
    userId: 'user-1',
    kind: 'priority',
    badge: 'urgent',
    title: `Öncelik ${seq}`,
    subtitle: null,
    reason: 'Bugün 17:00 son tarih.',
    importance: 'high',
    priorityScore: 900 - seq,
    priorityReasons: ['Bugün 17:00'],
    timeLabel: '08:42',
    dueAt: '2026-09-05T14:00:00.000Z',
    status: 'active',
    snoozedUntil: null,
    source: {
      type: 'gmail',
      id: `thread-${seq}`,
      label: 'Gmail',
      person: 'Ahmet Yılmaz',
      personId: 'contact-1',
      timestamp: '2026-09-05T05:42:00.000Z',
    },
    actions: [
      { id: 'reply', label: 'Yanıtla', kind: 'reply', primary: true },
      { id: 'remind', label: 'Hatırlat', kind: 'remind', primary: false },
    ],
    entityType: 'email_thread',
    entityId: `thread-${seq}`,
    tags: ['important', 'mail'],
    forDate: '2026-09-05',
    confidence: 0.9,
    isLowConfidence: false,
    dedupeKey: `priority:email_thread:${id}`,
    createdAt: '2026-09-05T05:43:00.000Z',
    updatedAt: '2026-09-05T05:43:00.000Z',
    deletedAt: null,
    ...partial,
  };
}

if (expect.getState().testPath?.endsWith('testUtils.tsx')) {
  describe('makeInsight', () => {
    it('builds a valid insight with unique ids', () => {
      const a = makeInsight();
      const b = makeInsight({ title: 'Özel' });
      expect(a.id).not.toBe(b.id);
      expect(b.title).toBe('Özel');
      expect(b.source.type).toBe('gmail');
    });
  });
}
