/**
 * Deterministic demo DataSource for screen tests: fixed clock (Saturday 5 September 2026, 09:41
 * Europe/Istanbul), instant latency, in-memory state. One instance per test file; reset in beforeEach.
 */
import { createDemoDataSource, type DataSource } from '@da/api-client';

export const TEST_NOW = '2026-09-05T06:41:00Z';
export const TEST_TIMEZONE = 'Europe/Istanbul';

let instance: DataSource | null = null;

export function createTestDataSource(now: string = TEST_NOW): DataSource {
  return createDemoDataSource(
    {
      mode: 'demo',
      appScheme: 'dijitalasistan',
      webUrl: 'https://dijitalasistan.app',
      now: () => new Date(now),
      timezone: TEST_TIMEZONE,
      locale: 'tr',
      isProduction: false,
    },
    { timeScale: 0 },
  );
}

export function getTestDataSource(): DataSource {
  if (!instance) instance = createTestDataSource();
  return instance;
}

export function resetTestDataSource(): DataSource {
  instance = createTestDataSource();
  return instance;
}
