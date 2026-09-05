/**
 * Device-executed calendar approvals. The backend cannot write to EventKit / the Android provider, so
 * `calendar_create` / `calendar_update` approvals on a device-calendar account stay `executing` with
 * `executionResult.handler === 'device'`; the phone writes the event through the calendar bridge and
 * reports the outcome with `ds.accounts.upsertDeviceEvents(accountId, events, approvalResult)`.
 */
import * as Calendar from 'expo-calendar/legacy';
import type { DataSource } from '@da/api-client';
import type {
  ApprovalAction,
  CalendarCreatePayload,
  CalendarUpdatePayload,
  ConnectedAccount,
} from '@da/domain';
import { captureError } from '@/lib/monitoring';
import {
  createDeviceEvent,
  deviceSourceType,
  mapDeviceEvent,
  type DeviceEventInput,
} from '@/services/calendarBridge';

export const DEVICE_WRITE_FAILED = 'device_write_failed';

export interface DeviceExecutionResult {
  outcome: 'executed' | 'failed';
  externalEventId: string | null;
  reason?: string;
}

/** Calendar identifiers registered for a device account (Supabase encodes them in externalAccountId). */
export function deviceCalendarIds(
  account: Pick<ConnectedAccount, 'externalAccountId' | 'grantedScopes'>,
): string[] {
  if (account.externalAccountId.startsWith('device:'))
    return account.externalAccountId
      .slice('device:'.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return account.grantedScopes.filter(Boolean);
}

async function readEvent(
  externalEventId: string,
  accountId: string,
): Promise<DeviceEventInput | null> {
  try {
    const event = await Calendar.getEventAsync(externalEventId);
    return event ? mapDeviceEvent(event, accountId) : null;
  } catch (e) {
    captureError(e, { where: 'deviceExecution.readEvent' });
    return null;
  }
}

/** Fallback upload row when the native read fails right after the write. */
function eventFromCreatePayload(
  p: CalendarCreatePayload,
  externalEventId: string,
): DeviceEventInput {
  return {
    accountId: p.accountId,
    externalEventId,
    calendarId: 'primary',
    title: p.title,
    description: p.description ?? null,
    location: p.location ?? null,
    meetingUrl: null,
    meetingProvider: null,
    startAt: p.startAt,
    endAt: p.endAt,
    allDay: p.allDay ?? false,
    attendees: (p.attendees ?? []).map((a) => ({
      name: a.name ?? null,
      email: a.email,
      isOrganizer: false,
    })),
    organizerIsUser: true,
    status: 'confirmed',
    providerUpdatedAt: new Date().toISOString(),
    source: deviceSourceType(),
    prepGeneratedAt: null,
    postMeetingHandledAt: null,
    isAiCreated: true,
    deletedAt: null,
  };
}

async function writeUpdate(p: CalendarUpdatePayload): Promise<void> {
  const changes = p.changes;
  const details: Partial<Calendar.Event> = {};
  if (changes.title !== undefined) details.title = changes.title;
  if (changes.startAt !== undefined) details.startDate = new Date(changes.startAt);
  if (changes.endAt !== undefined) details.endDate = new Date(changes.endAt);
  if (changes.location !== undefined) details.location = changes.location ?? '';
  if (changes.description !== undefined) details.notes = changes.description ?? '';
  await Calendar.updateEventAsync(p.externalEventId, details);
}

/**
 * Writes the approved change into the device calendar and finalises the approval server-side.
 * Never throws: a failed write is reported as `failed` (with `device_write_failed`) so the card can retry.
 */
export async function executeDeviceApproval(
  ds: DataSource,
  approval: ApprovalAction,
  accounts?: ConnectedAccount[],
): Promise<DeviceExecutionResult> {
  const payload = approval.payload as CalendarCreatePayload | CalendarUpdatePayload;
  const accountId = payload.accountId;
  let externalEventId: string | null = null;
  try {
    const list = accounts ?? (await ds.accounts.listAccounts());
    const account = list.find((a) => a.id === accountId);
    const calendarId = account ? deviceCalendarIds(account)[0] : undefined;
    if (approval.type === 'calendar_create') {
      externalEventId = await createDeviceEvent(payload as CalendarCreatePayload, calendarId);
      if (!externalEventId) throw new Error(DEVICE_WRITE_FAILED);
    } else if (approval.type === 'calendar_update') {
      const p = payload as CalendarUpdatePayload;
      await writeUpdate(p);
      externalEventId = p.externalEventId;
    } else {
      throw new Error('unsupported_device_action');
    }
    const event =
      (await readEvent(externalEventId, accountId)) ??
      (approval.type === 'calendar_create'
        ? eventFromCreatePayload(payload as CalendarCreatePayload, externalEventId)
        : null);
    await ds.accounts.upsertDeviceEvents(accountId, event ? [event] : [], {
      approvalId: approval.id,
      outcome: 'executed',
      externalEventId,
    });
    return { outcome: 'executed', externalEventId };
  } catch (e) {
    captureError(e, { where: 'executeDeviceApproval', type: approval.type });
    try {
      await ds.accounts.upsertDeviceEvents(accountId, [], {
        approvalId: approval.id,
        outcome: 'failed',
        failureReason: DEVICE_WRITE_FAILED,
      });
    } catch (report) {
      captureError(report, { where: 'executeDeviceApproval.report', type: approval.type });
    }
    return { outcome: 'failed', externalEventId: null, reason: DEVICE_WRITE_FAILED };
  }
}
