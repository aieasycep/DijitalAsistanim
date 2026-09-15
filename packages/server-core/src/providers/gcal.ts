/**
 * Google Calendar REST adapter (events.list with sync tokens, create/patch/delete, push channels)
 * plus normalisation to CalendarEventDraft.
 */
import type { CalendarAttendee, EmailParticipant } from '@da/domain';
import { randomUuid } from '../crypto/random';
import { GOOGLE_SCOPES } from '../oauth/scopes';
import { addDays, clamp } from '../util';
import { addCalendarDays, dateToInstant, localDateInZone } from './datetime';
import {
  encodePathSegment,
  isProviderStatus,
  providerRequest,
  providerRequestRaw,
  sameEmail,
  toIsoOrNull,
} from './http';
import { detectMeetingLink, meetingProviderFor, type MeetingLink } from './meeting';
import type {
  CalendarDelta,
  CalendarEventDraft,
  CalendarSyncInput,
  CreateEventInput,
  CreateEventResult,
  ProviderClientOptions,
  ProviderFetch,
  UpdateEventInput,
  WatchResult,
} from './types';

export const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
export const DEFAULT_CALENDAR_ID = 'primary';

const DEFAULT_WINDOW_DAYS_BACK = 30;
const DEFAULT_WINDOW_DAYS_FORWARD = 90;
const DEFAULT_MAX_PAGES = 10;
const PAGE_SIZE = 250;
/** Google's maximum channel lifetime for calendar events (one month). */
const DEFAULT_CHANNEL_TTL_SEC = 30 * 24 * 60 * 60;

// --- Raw API shapes -------------------------------------------------------------------------------

export interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
export interface GoogleAttendee {
  email?: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
  resource?: boolean;
  optional?: boolean;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
}
export interface GoogleConferenceData {
  conferenceSolution?: { key?: { type?: string }; name?: string };
  entryPoints?: { entryPointType?: string; uri?: string }[];
}
export interface GoogleCalendarEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  attendees?: GoogleAttendee[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  creator?: { email?: string; displayName?: string; self?: boolean };
  hangoutLink?: string;
  conferenceData?: GoogleConferenceData;
  recurringEventId?: string;
  updated?: string;
  created?: string;
  iCalUID?: string;
  eventType?: string;
  transparency?: string;
}
export interface GoogleEventsListResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  timeZone?: string;
}
export interface GoogleChannel {
  id: string;
  resourceId: string;
  expiration?: string;
}
export interface GoogleCalendarWatchResult extends WatchResult {
  resourceId: string;
}

// --- Normalisation -------------------------------------------------------------------------------

export interface NormalizeGoogleEventOptions {
  calendarId?: string;
  userEmail?: string | null;
  /** Zone that anchors all-day events when the event carries none (default UTC). */
  defaultTimezone?: string;
}

function conferenceLink(raw: GoogleCalendarEvent): MeetingLink | null {
  if (raw.hangoutLink) return { url: raw.hangoutLink, provider: 'google_meet' };
  const video = raw.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === 'video' && typeof e.uri === 'string' && e.uri !== '',
  );
  if (video?.uri) {
    const solution = raw.conferenceData?.conferenceSolution?.key?.type;
    return {
      url: video.uri,
      provider: solution === 'hangoutsMeet' ? 'google_meet' : meetingProviderFor(video.uri),
    };
  }
  return detectMeetingLink(raw.location, raw.description);
}

function mapAttendee(a: GoogleAttendee): CalendarAttendee {
  return {
    name: a.displayName ?? null,
    email: a.email ?? null,
    contactId: null,
    isOrganizer: a.organizer === true,
    responseStatus: a.responseStatus ?? null,
  };
}

/** Map an events.list item to a CalendarEventDraft (cancelled items keep `status: 'cancelled'`). */
export function normalizeGoogleEvent(
  raw: GoogleCalendarEvent,
  opts: NormalizeGoogleEventOptions = {},
): CalendarEventDraft {
  const zone = raw.start?.timeZone ?? opts.defaultTimezone ?? 'UTC';
  const allDay = typeof raw.start?.date === 'string';
  let startAt: string;
  let endAt: string;
  if (allDay) {
    const startDate = raw.start?.date as string;
    startAt = dateToInstant(startDate, zone);
    endAt = dateToInstant(raw.end?.date ?? addCalendarDays(startDate, 1), zone);
  } else {
    startAt =
      toIsoOrNull(raw.start?.dateTime) ?? toIsoOrNull(raw.created) ?? new Date(0).toISOString();
    endAt = toIsoOrNull(raw.end?.dateTime) ?? startAt;
  }
  const attendees = (raw.attendees ?? []).filter((a) => a.resource !== true).map(mapAttendee);
  const organizerIsUser =
    raw.organizer?.self === true ||
    sameEmail(raw.organizer?.email, opts.userEmail) ||
    (raw.attendees ?? []).some((a) => a.self === true && a.organizer === true);
  const meeting = conferenceLink(raw);
  return {
    externalEventId: raw.id,
    calendarId: opts.calendarId ?? DEFAULT_CALENDAR_ID,
    title: raw.summary?.trim() ?? '',
    description: raw.description ?? null,
    location: raw.location ?? null,
    meetingUrl: meeting?.url ?? null,
    meetingProvider: meeting?.provider ?? null,
    startAt,
    endAt,
    allDay,
    attendees,
    organizerIsUser,
    status: raw.status ?? 'confirmed',
    providerUpdatedAt: toIsoOrNull(raw.updated),
    source: 'google_calendar',
    isAiCreated: false,
    webUrl: raw.htmlLink ?? null,
    recurringEventId: raw.recurringEventId ?? null,
  };
}

// --- Request bodies -------------------------------------------------------------------------------

function eventTime(iso: string, allDay: boolean, zone: string): GoogleEventDateTime {
  return allDay ? { date: localDateInZone(iso, zone) } : { dateTime: iso, timeZone: zone };
}

function attendeeBody(p: EmailParticipant): { email: string; displayName?: string } {
  return { email: p.email, ...(p.name ? { displayName: p.name } : {}) };
}

/** Google event resource for a create call. */
export function googleEventBody(input: CreateEventInput): Record<string, unknown> {
  const allDay = input.allDay === true;
  return {
    summary: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.location ? { location: input.location } : {}),
    start: eventTime(input.startAt, allDay, input.timezone),
    end: eventTime(input.endAt, allDay, input.timezone),
    ...(input.attendees?.length ? { attendees: input.attendees.map(attendeeBody) } : {}),
    ...(input.conferenceRequested
      ? {
          conferenceData: {
            createRequest: {
              requestId: randomUuid(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }
      : {}),
  };
}

/** Google event patch (only supplied fields). */
export function googleEventPatch(patch: UpdateEventInput): Record<string, unknown> {
  const allDay = patch.allDay === true;
  return {
    ...(patch.title !== undefined ? { summary: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description ?? '' } : {}),
    ...(patch.location !== undefined ? { location: patch.location ?? '' } : {}),
    ...(patch.startAt !== undefined
      ? { start: eventTime(patch.startAt, allDay, patch.timezone) }
      : {}),
    ...(patch.endAt !== undefined ? { end: eventTime(patch.endAt, allDay, patch.timezone) } : {}),
    ...(patch.attendees !== undefined ? { attendees: patch.attendees.map(attendeeBody) } : {}),
  };
}

// --- Page token (Google requires identical list params on every page) ----------------------------

interface ListContinuation {
  t: string;
  min?: string;
  max?: string;
}

function encodeContinuation(c: ListContinuation): string {
  return JSON.stringify(c);
}

function decodeContinuation(token: string | null | undefined): ListContinuation | null {
  if (!token) return null;
  try {
    const parsed: unknown = JSON.parse(token);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { t?: unknown }).t === 'string'
    )
      return parsed as ListContinuation;
  } catch {
    return { t: token };
  }
  return { t: token };
}

// --- Client -------------------------------------------------------------------------------------

export interface GoogleCalendarClientOptions extends ProviderClientOptions {
  baseUrl?: string;
}

export interface GoogleCalendarSyncInput extends CalendarSyncInput {
  maxPages?: number;
}

export interface GoogleCalendarClient {
  listEvents(input: {
    calendarId?: string;
    syncToken?: string | null;
    timeMin?: string;
    timeMax?: string;
    pageToken?: string | null;
    maxResults?: number;
  }): Promise<GoogleEventsListResponse>;
  createEvent(input: CreateEventInput): Promise<CreateEventResult>;
  patchEvent(externalEventId: string, patch: UpdateEventInput): Promise<void>;
  deleteEvent(
    externalEventId: string,
    opts?: { calendarId?: string; sendUpdates?: boolean },
  ): Promise<void>;
  watch(input: {
    address: string;
    token: string;
    calendarId?: string;
    channelId?: string;
    ttlSeconds?: number;
  }): Promise<GoogleCalendarWatchResult>;
  stopChannel(input: { id: string; resourceId: string }): Promise<void>;
  syncCalendar(input: GoogleCalendarSyncInput): Promise<CalendarDelta>;
}

const EMPTY_DELTA: CalendarDelta = {
  events: [],
  deletedExternalIds: [],
  nextCursor: null,
  nextPageToken: null,
  hasMore: false,
};

export function createGoogleCalendarClient(
  fetchImpl: ProviderFetch,
  accessToken: string,
  opts: GoogleCalendarClientOptions = {},
): GoogleCalendarClient {
  const base = opts.baseUrl ?? GOOGLE_CALENDAR_API_BASE;
  const timeoutMs = opts.timeoutMs;
  const readScope = GOOGLE_SCOPES.calendarReadonly;
  const writeScope = GOOGLE_SCOPES.calendarEvents;
  const eventsUrl = (calendarId: string) =>
    `${base}/calendars/${encodePathSegment(calendarId)}/events`;

  const listEvents: GoogleCalendarClient['listEvents'] = (input) =>
    providerRequest<GoogleEventsListResponse>(fetchImpl, {
      url: eventsUrl(input.calendarId ?? DEFAULT_CALENDAR_ID),
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
      query: {
        singleEvents: true,
        showDeleted: true,
        maxResults: input.maxResults ?? PAGE_SIZE,
        pageToken: input.pageToken ?? undefined,
        ...(input.syncToken
          ? { syncToken: input.syncToken }
          : { timeMin: input.timeMin, timeMax: input.timeMax, orderBy: 'startTime' }),
      },
    });

  const createEvent: GoogleCalendarClient['createEvent'] = async (input) => {
    const sendInvites = input.sendInvites ?? Boolean(input.attendees?.length);
    const created = await providerRequest<GoogleCalendarEvent>(fetchImpl, {
      url: eventsUrl(input.calendarId ?? DEFAULT_CALENDAR_ID),
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: writeScope,
      query: {
        sendUpdates: sendInvites ? 'all' : 'none',
        ...(input.conferenceRequested ? { conferenceDataVersion: 1 } : {}),
      },
      body: googleEventBody(input),
    });
    return { externalEventId: created.id, htmlLink: created.htmlLink ?? null };
  };

  const patchEvent: GoogleCalendarClient['patchEvent'] = async (externalEventId, patch) => {
    await providerRequest<GoogleCalendarEvent>(fetchImpl, {
      url: `${eventsUrl(patch.calendarId ?? DEFAULT_CALENDAR_ID)}/${encodePathSegment(externalEventId)}`,
      method: 'PATCH',
      token: accessToken,
      timeoutMs,
      requiredScope: writeScope,
      query: { sendUpdates: patch.sendUpdates === false ? 'none' : 'all' },
      body: googleEventPatch(patch),
    });
  };

  const deleteEvent: GoogleCalendarClient['deleteEvent'] = async (externalEventId, o = {}) => {
    try {
      await providerRequestRaw(fetchImpl, {
        url: `${eventsUrl(o.calendarId ?? DEFAULT_CALENDAR_ID)}/${encodePathSegment(externalEventId)}`,
        method: 'DELETE',
        token: accessToken,
        timeoutMs,
        requiredScope: writeScope,
        query: { sendUpdates: o.sendUpdates === false ? 'none' : 'all' },
      });
    } catch (e) {
      // Already gone on the provider side: nothing left to delete.
      if (isProviderStatus(e, 404) || isProviderStatus(e, 410)) return;
      throw e;
    }
  };

  const watch: GoogleCalendarClient['watch'] = async (input) => {
    const channelId = input.channelId ?? randomUuid();
    const channel = await providerRequest<GoogleChannel>(fetchImpl, {
      url: `${eventsUrl(input.calendarId ?? DEFAULT_CALENDAR_ID)}/watch`,
      method: 'POST',
      token: accessToken,
      timeoutMs,
      requiredScope: readScope,
      body: {
        id: channelId,
        type: 'web_hook',
        address: input.address,
        token: input.token,
        params: { ttl: String(input.ttlSeconds ?? DEFAULT_CHANNEL_TTL_SEC) },
      },
    });
    return {
      subscriptionId: channel.id,
      resourceId: channel.resourceId,
      expiresAt: toIsoOrNull(Number(channel.expiration)) ?? new Date().toISOString(),
    };
  };

  const stopChannel: GoogleCalendarClient['stopChannel'] = async (input) => {
    try {
      await providerRequestRaw(fetchImpl, {
        url: `${base}/channels/stop`,
        method: 'POST',
        token: accessToken,
        timeoutMs,
        requiredScope: readScope,
        body: { id: input.id, resourceId: input.resourceId },
      });
    } catch (e) {
      if (isProviderStatus(e, 404)) return;
      throw e;
    }
  };

  const syncCalendar: GoogleCalendarClient['syncCalendar'] = async (input) => {
    const calendarId = input.calendarId ?? DEFAULT_CALENDAR_ID;
    const maxPages = clamp(input.maxPages ?? DEFAULT_MAX_PAGES, 1, 100);
    const continuation = decodeContinuation(input.pageToken);
    const now = input.now ?? new Date().toISOString();
    const window = input.cursor
      ? null
      : {
          min:
            continuation?.min ?? addDays(now, -(input.windowDaysBack ?? DEFAULT_WINDOW_DAYS_BACK)),
          max:
            continuation?.max ??
            addDays(now, input.windowDaysForward ?? DEFAULT_WINDOW_DAYS_FORWARD),
        };
    const events: CalendarEventDraft[] = [];
    const deleted: string[] = [];
    let pageToken: string | null = continuation?.t ?? null;
    let syncToken: string | null = null;
    let nextPageToken: string | null = null;
    for (let page = 0; ; page++) {
      let result: GoogleEventsListResponse;
      try {
        result = await listEvents({
          calendarId,
          syncToken: input.cursor,
          timeMin: window?.min,
          timeMax: window?.max,
          pageToken,
        });
      } catch (e) {
        if (isProviderStatus(e, 410)) return { ...EMPTY_DELTA, fullResyncRequired: true };
        throw e;
      }
      for (const item of result.items ?? []) {
        if (item.status === 'cancelled') deleted.push(item.id);
        else {
          events.push(
            normalizeGoogleEvent(item, {
              calendarId,
              userEmail: opts.userEmail,
              defaultTimezone: result.timeZone ?? opts.defaultTimezone,
            }),
          );
        }
      }
      pageToken = result.nextPageToken ?? null;
      syncToken = result.nextSyncToken ?? syncToken;
      if (!pageToken) break;
      if (page + 1 >= maxPages) {
        nextPageToken = encodeContinuation({ t: pageToken, ...(window ?? {}) });
        break;
      }
    }
    return {
      events,
      deletedExternalIds: deleted,
      nextCursor: syncToken,
      nextPageToken,
      hasMore: nextPageToken !== null,
    };
  };

  return { listEvents, createEvent, patchEvent, deleteEvent, watch, stopChannel, syncCalendar };
}
