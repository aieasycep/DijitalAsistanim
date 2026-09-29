import type { CalendarEvent } from '@da/domain';
import {
  ACCOUNT_DEVICE,
  ACCOUNT_GMAIL,
  CONFLICT_DOKTOR_DEMIR,
  CONTACT_MEHMET,
  EVENT_AKSAM_YEMEGI,
  EVENT_DEMIR_MUSTERI,
  EVENT_DOKTOR,
  EVENT_HAFTALIK_EKIP,
  EVENT_MEHMET_MEETING,
  EVENT_URUN_GOZDEN,
} from '../ids';
import type { StoredConflict } from '../state';
import type { FixtureContext } from './types';

type EventSeed = Omit<
  CalendarEvent,
  | 'userId'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'prepGeneratedAt'
  | 'postMeetingHandledAt'
  | 'isAiCreated'
>;

export function buildEvents(f: FixtureContext): CalendarEvent[] {
  const me = {
    name: f.displayName,
    email: f.email,
    contactId: null,
    isOrganizer: true,
    responseStatus: 'accepted' as const,
  };
  const seeds: EventSeed[] = [
    {
      id: EVENT_MEHMET_MEETING,
      accountId: ACCOUNT_GMAIL,
      externalEventId: 'ev-mehmet-musteri',
      calendarId: 'primary',
      title: 'Mehmet ile müşteri toplantısı',
      description: 'Teklif v2 ve teslim takvimi',
      location: 'Ofis',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      meetingProvider: 'google_meet',
      startAt: f.lt(0, '14:30'),
      endAt: f.lt(0, '15:30'),
      allDay: false,
      attendees: [
        {
          name: 'Mehmet Yılmaz',
          email: 'mehmet@musteri.com',
          contactId: CONTACT_MEHMET,
          isOrganizer: false,
          responseStatus: 'accepted',
        },
        me,
      ],
      organizerIsUser: true,
      status: 'confirmed',
      providerUpdatedAt: f.lt(-2, '10:00'),
      source: 'google_calendar',
    },
    {
      id: EVENT_URUN_GOZDEN,
      accountId: ACCOUNT_GMAIL,
      externalEventId: 'ev-urun-gozden',
      calendarId: 'primary',
      title: 'Ürün gözden geçirme',
      description: null,
      location: null,
      meetingUrl: 'https://teams.microsoft.com/l/meetup-join/xyz',
      meetingProvider: 'teams',
      startAt: f.lt(0, '16:00'),
      endAt: f.lt(0, '16:30'),
      allDay: false,
      attendees: [
        {
          name: 'Ekip',
          email: 'ekip@example.com',
          contactId: null,
          isOrganizer: true,
          responseStatus: 'accepted',
        },
      ],
      organizerIsUser: false,
      status: 'confirmed',
      providerUpdatedAt: f.lt(-1, '10:00'),
      source: 'google_calendar',
    },
    {
      id: EVENT_AKSAM_YEMEGI,
      accountId: ACCOUNT_DEVICE,
      externalEventId: 'ev-aksam-yemegi',
      calendarId: 'device',
      title: 'Akşam yemeği · Karaköy',
      description: '4 kişi',
      location: 'Karaköy, İstanbul',
      meetingUrl: null,
      meetingProvider: null,
      startAt: f.lt(0, '20:30'),
      endAt: f.lt(0, '22:30'),
      allDay: false,
      attendees: [],
      organizerIsUser: true,
      status: 'confirmed',
      providerUpdatedAt: f.lt(-5, '10:00'),
      source: 'apple_calendar',
    },
    {
      id: EVENT_HAFTALIK_EKIP,
      accountId: ACCOUNT_GMAIL,
      externalEventId: 'ev-haftalik-ekip',
      calendarId: 'primary',
      title: 'Haftalık ekip',
      description: null,
      location: 'Ofis',
      meetingUrl: null,
      meetingProvider: null,
      startAt: f.lt(1, '09:00'),
      endAt: f.lt(1, '10:00'),
      allDay: false,
      attendees: [],
      organizerIsUser: true,
      status: 'confirmed',
      providerUpdatedAt: f.lt(-7, '10:00'),
      source: 'google_calendar',
    },
    {
      id: EVENT_DOKTOR,
      accountId: ACCOUNT_GMAIL,
      externalEventId: 'ev-doktor',
      calendarId: 'primary',
      title: 'Doktor randevusu',
      description: null,
      location: 'Nişantaşı',
      meetingUrl: null,
      meetingProvider: null,
      startAt: f.lt(2, '14:30'),
      endAt: f.lt(2, '15:15'),
      allDay: false,
      attendees: [],
      organizerIsUser: true,
      status: 'confirmed',
      providerUpdatedAt: f.lt(-3, '10:00'),
      source: 'google_calendar',
    },
    {
      id: EVENT_DEMIR_MUSTERI,
      accountId: ACCOUNT_GMAIL,
      externalEventId: 'ev-musteri-2',
      calendarId: 'primary',
      title: 'Müşteri toplantısı · Demir A.Ş.',
      description: null,
      location: 'Online',
      meetingUrl: 'https://meet.google.com/klm-nopq-rst',
      meetingProvider: 'google_meet',
      startAt: f.lt(2, '14:00'),
      endAt: f.lt(2, '15:00'),
      allDay: false,
      attendees: [],
      organizerIsUser: false,
      status: 'confirmed',
      providerUpdatedAt: f.lt(-3, '10:00'),
      source: 'google_calendar',
    },
  ];
  return seeds.map((s) => ({
    ...s,
    userId: f.userId,
    prepGeneratedAt: null,
    postMeetingHandledAt: null,
    isAiCreated: false,
    createdAt: s.providerUpdatedAt ?? f.nowIso,
    updatedAt: s.providerUpdatedAt ?? f.nowIso,
    deletedAt: null,
  }));
}

export function buildConflicts(f: FixtureContext): StoredConflict[] {
  return [
    {
      id: CONFLICT_DOKTOR_DEMIR,
      eventAId: EVENT_DEMIR_MUSTERI,
      eventBId: EVENT_DOKTOR,
      overlapMinutes: 30,
      suggestions: [
        {
          id: 'sg-1',
          kind: 'move_event',
          title: "Müşteri toplantısını 13:00'e almayı önerebilirim.",
          detail: '13:00–14:00 boş.',
          proposedStartAt: f.lt(2, '13:00'),
          proposedEndAt: f.lt(2, '14:00'),
          targetEventId: EVENT_DEMIR_MUSTERI,
          targetTaskId: null,
          reason: 'Doktor randevusu ile çakışıyor',
        },
        {
          id: 'sg-2',
          kind: 'move_event',
          title: "Doktor randevusunu 15:45'e almayı önerebilirim.",
          detail: 'Klinikte 15:45 boş görünüyor.',
          proposedStartAt: f.lt(2, '15:45'),
          proposedEndAt: f.lt(2, '16:30'),
          targetEventId: EVENT_DOKTOR,
          targetTaskId: null,
          reason: "Toplantı 15:00'te biter; doktora 38 dakika yol var.",
        },
      ],
      status: 'open',
    },
  ];
}
