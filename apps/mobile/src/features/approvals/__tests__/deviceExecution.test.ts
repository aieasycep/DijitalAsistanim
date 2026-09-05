jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('expo-linking', () => ({
  canOpenURL: jest.fn(async () => false),
  openURL: jest.fn(async () => true),
  openSettings: jest.fn(),
}));
jest.mock('@/lib/openExternal', () => ({
  openExternal: jest.fn(async () => true),
  providerMailUrl: (webUrl: string | null | undefined) => webUrl ?? '',
  mapsUrl: (l: string) => `maps://?q=${l}`,
  telUrl: (p: string) => `tel:${p}`,
}));
jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event' },
  getDefaultCalendarAsync: jest.fn(async () => ({ id: 'cal-default' })),
  createEventAsync: jest.fn(async () => 'evt-new'),
  updateEventAsync: jest.fn(async () => 'evt-existing'),
  getEventAsync: jest.fn(async () => null),
}));

import * as Calendar from 'expo-calendar/legacy';
import type { DataSource } from '@da/api-client';
import type { ApprovalAction, ConnectedAccount } from '@da/domain';
import { deviceCalendarIds, executeDeviceApproval } from '../deviceExecution';

const ACCOUNT_ID = '00000000-0000-4000-8000-0000000000c2';

function account(partial: Partial<ConnectedAccount>): ConnectedAccount {
  return {
    id: ACCOUNT_ID,
    userId: 'u',
    provider: 'apple',
    kinds: ['calendar'],
    externalAccountId: 'device',
    displayName: 'iPhone Takvim',
    email: null,
    status: 'active',
    grantedScopes: [],
    controls: {
      readEmail: false,
      analyzeAttachments: false,
      detectDeadlines: true,
      prepareDrafts: false,
      readEvents: true,
      suggestSchedule: true,
      createEventsWithApproval: true,
      readTasks: false,
    },
    lastSyncAt: null,
    lastError: null,
    backfillCompleted: true,
    isPrimary: false,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    deletedAt: null,
    ...partial,
  };
}

function approval(partial: Partial<ApprovalAction>): ApprovalAction {
  return {
    id: '00000000-0000-4000-8000-000000009901',
    userId: 'u',
    type: 'calendar_create',
    status: 'executing',
    what: 'Takvime ekle',
    why: 'Kaynakta etkinlik var.',
    changeSummary: [],
    source: null,
    payload: {
      accountId: ACCOUNT_ID,
      title: 'Spor',
      startAt: '2026-09-05T15:00:00.000Z',
      endAt: '2026-09-05T16:00:00.000Z',
    },
    originalPayload: {
      accountId: ACCOUNT_ID,
      title: 'Spor',
      startAt: '2026-09-05T15:00:00.000Z',
      endAt: '2026-09-05T16:00:00.000Z',
    },
    editedByUser: false,
    idempotencyKey: 'k-device-1',
    expiresAt: '2026-09-08T20:59:00.000Z',
    approvedAt: '2026-09-05T06:00:00.000Z',
    rejectedAt: null,
    executedAt: null,
    executionResult: { handler: 'device', kind: 'device_event_create' },
    failureReason: null,
    attemptCount: 1,
    requestedBy: 'email_detail',
    insightId: null,
    requiredScope: null,
    createdAt: '2026-09-05T05:00:00.000Z',
    updatedAt: '2026-09-05T06:00:00.000Z',
    ...partial,
  };
}

function fakeDs(accounts: ConnectedAccount[]) {
  const upsertDeviceEvents = jest.fn(async () => undefined);
  const listAccounts = jest.fn(async () => accounts);
  const ds = { accounts: { upsertDeviceEvents, listAccounts } } as unknown as DataSource;
  return { ds, upsertDeviceEvents, listAccounts };
}

beforeEach(() => jest.clearAllMocks());

describe('deviceCalendarIds', () => {
  it('reads Supabase-encoded ids and falls back to grantedScopes', () => {
    expect(deviceCalendarIds(account({ externalAccountId: 'device:cal-b,cal-a' }))).toEqual([
      'cal-b',
      'cal-a',
    ]);
    expect(deviceCalendarIds(account({ grantedScopes: ['cal-1'] }))).toEqual(['cal-1']);
  });
});

describe('executeDeviceApproval', () => {
  it('creates the event in the registered calendar and reports executed', async () => {
    const { ds, upsertDeviceEvents } = fakeDs([
      account({ externalAccountId: 'device:cal-1,cal-2' }),
    ]);
    const result = await executeDeviceApproval(ds, approval({}));
    expect(result).toEqual({ outcome: 'executed', externalEventId: 'evt-new' });
    expect(Calendar.createEventAsync).toHaveBeenCalledWith(
      'cal-1',
      expect.objectContaining({ title: 'Spor' }),
    );
    expect(upsertDeviceEvents).toHaveBeenCalledWith(
      ACCOUNT_ID,
      [expect.objectContaining({ externalEventId: 'evt-new', title: 'Spor', isAiCreated: true })],
      {
        approvalId: '00000000-0000-4000-8000-000000009901',
        outcome: 'executed',
        externalEventId: 'evt-new',
      },
    );
  });

  it('reports a failed write with a content-free reason', async () => {
    (Calendar.createEventAsync as jest.Mock).mockRejectedValueOnce(new Error('denied'));
    const { ds, upsertDeviceEvents } = fakeDs([account({})]);
    const result = await executeDeviceApproval(ds, approval({}));
    expect(result.outcome).toBe('failed');
    expect(result.reason).toBe('device_write_failed');
    expect(upsertDeviceEvents).toHaveBeenCalledWith(ACCOUNT_ID, [], {
      approvalId: '00000000-0000-4000-8000-000000009901',
      outcome: 'failed',
      failureReason: 'device_write_failed',
    });
  });

  it('updates an existing device event with only the changed fields', async () => {
    const { ds, upsertDeviceEvents } = fakeDs([account({})]);
    const update = approval({
      type: 'calendar_update',
      payload: {
        accountId: ACCOUNT_ID,
        eventId: '00000000-0000-4000-8000-0000000000d1',
        externalEventId: 'evt-existing',
        changes: { startAt: '2026-09-05T13:30:00.000Z', endAt: '2026-09-05T14:30:00.000Z' },
      },
      executionResult: { handler: 'device', kind: 'device_event_update' },
    });
    const result = await executeDeviceApproval(ds, update);
    expect(result).toEqual({ outcome: 'executed', externalEventId: 'evt-existing' });
    expect(Calendar.updateEventAsync).toHaveBeenCalledWith('evt-existing', {
      startDate: new Date('2026-09-05T13:30:00.000Z'),
      endDate: new Date('2026-09-05T14:30:00.000Z'),
    });
    expect(upsertDeviceEvents).toHaveBeenCalledWith(ACCOUNT_ID, [], {
      approvalId: '00000000-0000-4000-8000-000000009901',
      outcome: 'executed',
      externalEventId: 'evt-existing',
    });
  });
});
