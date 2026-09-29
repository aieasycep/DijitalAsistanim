import type { DataSource } from '@da/api-client';
import type { Event } from 'expo-calendar/legacy';

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

const mockEvents: Event[] = [];
jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event', REMINDER: 'reminder' },
  getCalendarPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  })),
  requestCalendarPermissionsAsync: jest.fn(async () => ({
    status: 'denied',
    granted: false,
    canAskAgain: false,
    expires: 'never',
  })),
  getCalendarsAsync: jest.fn(async () => [
    {
      id: 'cal-1',
      title: 'İş',
      color: '#5B5CE2',
      source: { name: 'iCloud', type: 'caldav' },
      isPrimary: true,
      allowsModifications: true,
      type: 'caldav',
    },
    {
      id: 'cal-bd',
      title: 'Doğum günleri',
      color: null,
      source: { name: 'Other', type: 'birthdays' },
      isPrimary: false,
      allowsModifications: false,
      type: 'birthdays',
    },
  ]),
  getEventsAsync: jest.fn(async () => mockEvents),
  getDefaultCalendarAsync: jest.fn(async () => ({ id: 'cal-1' })),
  createEventAsync: jest.fn(async () => 'evt-new'),
  openEventInCalendarAsync: jest.fn(async () => ({ action: 'done' })),
}));

import * as Calendar from 'expo-calendar/legacy';
import {
  createDeviceEvent,
  listDeviceCalendars,
  mapDeviceEvent,
  requestCalendarPermission,
  syncDeviceCalendar,
} from '@/services/calendarBridge';

const baseEvent: Event = {
  id: 'evt-1',
  calendarId: 'cal-1',
  title: '  Mehmet ile müşteri toplantısı ',
  location: 'https://meet.google.com/abc-defg-hij',
  notes: 'Gündem: teklif v2. Katılım: https://example.com/agenda',
  timeZone: 'Europe/Istanbul',
  alarms: [],
  recurrenceRule: null,
  startDate: new Date('2030-09-05T11:30:00Z'),
  endDate: '2030-09-05T12:30:00Z',
  allDay: false,
  availability: 'busy' as Event['availability'],
  status: 'tentative' as Event['status'],
  organizer: {
    isCurrentUser: false,
    name: 'Mehmet',
    role: 'chair',
    status: 'accepted',
    type: 'person',
  },
  organizerEmail: 'mehmet@example.com',
  lastModifiedDate: '2030-09-01T10:00:00Z',
};

describe('mapDeviceEvent', () => {
  it('maps a native event to the domain input shape', () => {
    const mapped = mapDeviceEvent(baseEvent, 'acc-1', 'ios');
    expect(mapped).toEqual({
      accountId: 'acc-1',
      externalEventId: 'evt-1',
      calendarId: 'cal-1',
      title: 'Mehmet ile müşteri toplantısı',
      description: 'Gündem: teklif v2. Katılım: https://example.com/agenda',
      location: 'https://meet.google.com/abc-defg-hij',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      meetingProvider: 'google_meet',
      startAt: '2030-09-05T11:30:00.000Z',
      endAt: '2030-09-05T12:30:00.000Z',
      allDay: false,
      attendees: [{ email: 'mehmet@example.com', name: 'Mehmet', isOrganizer: true }],
      organizerIsUser: false,
      status: 'tentative',
      providerUpdatedAt: '2030-09-01T10:00:00.000Z',
      source: 'apple_calendar',
      prepGeneratedAt: null,
      postMeetingHandledAt: null,
      isAiCreated: false,
      deletedAt: null,
    });
  });

  it('uses the platform source, cancelled status and instance ids for recurrences', () => {
    const mapped = mapDeviceEvent(
      {
        ...baseEvent,
        status: 'canceled' as Event['status'],
        instanceId: 'evt-1#2',
        organizer: undefined,
        organizerEmail: undefined,
        location: null,
        notes: '',
      },
      'acc-1',
      'android',
    );
    expect(mapped).toMatchObject({
      source: 'device_calendar',
      status: 'cancelled',
      externalEventId: 'evt-1#2',
      organizerIsUser: true,
      attendees: [],
      meetingUrl: null,
      meetingProvider: null,
      location: null,
      description: null,
    });
  });

  it('drops events without a start date', () => {
    expect(mapDeviceEvent({ ...baseEvent, startDate: 'not a date' }, 'acc-1', 'ios')).toBeNull();
  });
});

describe('device calendar bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvents.length = 0;
  });

  it('lists calendars without birthday calendars', async () => {
    expect(await listDeviceCalendars()).toEqual([
      {
        id: 'cal-1',
        title: 'İş',
        color: '#5B5CE2',
        sourceName: 'iCloud',
        isPrimary: true,
        allowsModifications: true,
      },
    ]);
  });

  it('maps permission outcomes', async () => {
    expect(await requestCalendarPermission()).toBe('denied');
  });

  it('uploads mapped events in chunks', async () => {
    for (let i = 0; i < 250; i += 1) mockEvents.push({ ...baseEvent, id: `evt-${i}` });
    const upsertDeviceEvents = jest.fn(async () => undefined);
    const ds = { accounts: { upsertDeviceEvents } } as unknown as DataSource;
    const result = await syncDeviceCalendar(ds, 'acc-1', ['cal-1'], {
      now: new Date('2030-09-05T06:00:00Z'),
      pastDays: 1,
      futureDays: 1,
    });
    expect(result).toEqual({ uploaded: 250 });
    expect(upsertDeviceEvents).toHaveBeenCalledTimes(2);
    expect(Calendar.getEventsAsync).toHaveBeenCalledWith(
      ['cal-1'],
      new Date('2030-09-04T06:00:00Z'),
      new Date('2030-09-06T06:00:00Z'),
    );
    expect(await syncDeviceCalendar(ds, 'acc-1', [])).toEqual({ uploaded: 0 });
  });

  it('writes approved events into the default calendar', async () => {
    const id = await createDeviceEvent({
      accountId: 'acc-1',
      title: 'Diş hekimi',
      startAt: '2030-09-06T08:00:00Z',
      endAt: '2030-09-06T09:00:00Z',
      location: 'Kadıköy',
    });
    expect(id).toBe('evt-new');
    expect(Calendar.createEventAsync).toHaveBeenCalledWith(
      'cal-1',
      expect.objectContaining({ title: 'Diş hekimi', location: 'Kadıköy', allDay: false }),
    );
  });
});
