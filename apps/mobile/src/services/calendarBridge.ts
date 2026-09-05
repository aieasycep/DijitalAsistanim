/**
 * Device calendar bridge (EventKit on iOS, the Calendar provider on Android) via expo-calendar.
 * Reads happen on device and are uploaded through `ds.accounts.upsertDeviceEvents` so the backend can reason
 * over them; writes only happen after an approval was executed for a device-calendar account.
 */
import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar/legacy';
import { t } from '@da/i18n';
import type { DataSource } from '@da/api-client';
import type { CalendarCreatePayload, CalendarEvent, ConnectedAccount } from '@da/domain';
import { captureError } from '@/lib/monitoring';
import { detectMeetingProvider, extractMeetingUrl } from './handoff';
import { toPermissionOutcome, type PermissionOutcome } from './permissions';

export type DeviceEventInput = Omit<CalendarEvent, 'userId' | 'createdAt' | 'updatedAt' | 'id'>;

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string | null;
  sourceName: string | null;
  isPrimary: boolean;
  allowsModifications: boolean;
}

export type DevicePlatform = 'ios' | 'android';

const MAX_DESCRIPTION = 2000;
const UPLOAD_CHUNK = 200;

export function deviceProvider(platform: string = Platform.OS): 'apple' | 'device' {
  return platform === 'ios' ? 'apple' : 'device';
}

export function deviceSourceType(
  platform: string = Platform.OS,
): 'apple_calendar' | 'device_calendar' {
  return platform === 'ios' ? 'apple_calendar' : 'device_calendar';
}

export function deviceCalendarDisplayName(platform: string = Platform.OS): string {
  return t(
    platform === 'ios'
      ? 'settings.integrationsScreen.providers.apple_calendar'
      : 'settings.integrationsScreen.providers.device_calendar',
  );
}

export async function getCalendarPermission(): Promise<PermissionOutcome> {
  try {
    return toPermissionOutcome(await Calendar.getCalendarPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

/** Prompts for calendar access (from the onboarding explainer / integrations screen). */
export async function requestCalendarPermission(): Promise<PermissionOutcome> {
  try {
    return toPermissionOutcome(await Calendar.requestCalendarPermissionsAsync());
  } catch (e) {
    captureError(e, { where: 'requestCalendarPermission' });
    return 'undetermined';
  }
}

export async function listDeviceCalendars(): Promise<DeviceCalendar[]> {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return calendars
      .filter((c) => String(c.type ?? '') !== 'birthdays')
      .map((c) => ({
        id: c.id,
        title: c.title,
        color: c.color ?? null,
        sourceName: c.source?.name ?? null,
        isPrimary: Boolean(c.isPrimary),
        allowsModifications: Boolean(c.allowsModifications),
      }));
  } catch (e) {
    captureError(e, { where: 'listDeviceCalendars' });
    return [];
  }
}

function toIso(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapStatus(status: unknown): CalendarEvent['status'] {
  const s = String(status ?? '').toLowerCase();
  if (s === 'canceled' || s === 'cancelled') return 'cancelled';
  if (s === 'tentative') return 'tentative';
  return 'confirmed';
}

/** Maps a native event to the domain shape used by `upsertDeviceEvents`. Pure. */
export function mapDeviceEvent(
  event: Calendar.Event,
  accountId: string,
  platform: string = Platform.OS,
): DeviceEventInput | null {
  const startAt = toIso(event.startDate);
  const endAt = toIso(event.endDate) ?? startAt;
  if (!startAt || !endAt) return null;
  const meetingUrl = extractMeetingUrl([event.url, event.location, event.notes]);
  const organizerEmail = event.organizerEmail?.trim() || null;
  const description = event.notes?.trim() ? event.notes.trim().slice(0, MAX_DESCRIPTION) : null;
  return {
    accountId,
    externalEventId: event.instanceId ?? event.id,
    calendarId: event.calendarId,
    title: event.title?.trim() ?? '',
    description,
    location: event.location?.trim() || null,
    meetingUrl,
    meetingProvider: meetingUrl ? detectMeetingProvider(meetingUrl) : null,
    startAt,
    endAt,
    allDay: Boolean(event.allDay),
    attendees: organizerEmail
      ? [{ email: organizerEmail, name: event.organizer?.name ?? null, isOrganizer: true }]
      : [],
    organizerIsUser: event.organizer?.isCurrentUser ?? organizerEmail === null,
    status: mapStatus(event.status),
    providerUpdatedAt: toIso(event.lastModifiedDate),
    source: deviceSourceType(platform),
    prepGeneratedAt: null,
    postMeetingHandledAt: null,
    isAiCreated: false,
    deletedAt: null,
  };
}

export interface ReadDeviceEventsInput {
  accountId: string;
  calendarIds: string[];
  from: Date;
  to: Date;
}

export async function readDeviceEvents(input: ReadDeviceEventsInput): Promise<DeviceEventInput[]> {
  if (!input.calendarIds.length) return [];
  try {
    const events = await Calendar.getEventsAsync(input.calendarIds, input.from, input.to);
    const mapped: DeviceEventInput[] = [];
    for (const e of events) {
      const m = mapDeviceEvent(e, input.accountId);
      if (m) mapped.push(m);
    }
    return mapped;
  } catch (e) {
    captureError(e, { where: 'readDeviceEvents' });
    return [];
  }
}

/** Registers the selected device calendars as a connected account (provider `apple` / `device`). */
export async function registerDeviceCalendarAccount(
  ds: DataSource,
  calendarIds: string[],
  displayName?: string,
): Promise<ConnectedAccount> {
  return ds.accounts.registerDeviceCalendar({
    provider: deviceProvider(),
    displayName: displayName ?? deviceCalendarDisplayName(),
    calendarIds,
  });
}

export interface SyncDeviceCalendarOptions {
  pastDays?: number;
  futureDays?: number;
  now?: Date;
}

/** Reads a window of device events and uploads them in chunks. Returns how many were uploaded. */
export async function syncDeviceCalendar(
  ds: DataSource,
  accountId: string,
  calendarIds: string[],
  opts: SyncDeviceCalendarOptions = {},
): Promise<{ uploaded: number }> {
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - (opts.pastDays ?? 7) * 86_400_000);
  const to = new Date(now.getTime() + (opts.futureDays ?? 30) * 86_400_000);
  const events = await readDeviceEvents({ accountId, calendarIds, from, to });
  let uploaded = 0;
  for (let i = 0; i < events.length; i += UPLOAD_CHUNK) {
    const chunk = events.slice(i, i + UPLOAD_CHUNK);
    await ds.accounts.upsertDeviceEvents(accountId, chunk);
    uploaded += chunk.length;
  }
  return { uploaded };
}

/** Writes an approved `calendar_create` payload into a device calendar. Returns the native event id. */
export async function createDeviceEvent(
  payload: CalendarCreatePayload,
  calendarId?: string,
): Promise<string | null> {
  try {
    const targetId = calendarId ?? (await Calendar.getDefaultCalendarAsync()).id;
    return await Calendar.createEventAsync(targetId, {
      title: payload.title,
      startDate: new Date(payload.startAt),
      endDate: new Date(payload.endAt),
      allDay: payload.allDay ?? false,
      location: payload.location ?? undefined,
      notes: payload.description ?? undefined,
    });
  } catch (e) {
    captureError(e, { where: 'createDeviceEvent' });
    return null;
  }
}

/** Opens the native calendar UI for an event (Android intent / iOS EventKit UI). */
export async function openDeviceEvent(externalEventId: string): Promise<boolean> {
  try {
    await Calendar.openEventInCalendarAsync({ id: externalEventId });
    return true;
  } catch (e) {
    captureError(e, { where: 'openDeviceEvent' });
    return false;
  }
}
