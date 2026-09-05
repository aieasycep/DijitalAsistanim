import { describe, expect, it } from 'vitest';
import type {
  CalendarEvent,
  Commitment,
  FollowUp,
  Insight,
  LifeEvent,
  TaskItem,
  WeeklyMetrics,
} from '@da/domain';
import type { BriefingAi } from '@da/validation';
import { zonedTimeToUtc } from '../util';
import {
  assembleBriefingCandidates,
  clockLocative,
  composeBriefingFallback,
  estimateReadSeconds,
  eveningCarryOverPlan,
  mergeAiBriefing,
  toBriefingPromptCandidates,
  ttsFriendly,
  turkishAblative,
  weeklyShareText,
  type BriefingContext,
} from './index';

const tz = 'Europe/Istanbul';
const at = (date: string, hhmm: string): string => zonedTimeToUtc(date, hhmm, tz);
const now = at('2026-09-05', '07:58');

let seq = 0;
function insight(
  partial: Partial<Insight> & {
    title: string;
    kind: Insight['kind'];
    badge: Insight['badge'];
    entityType: Insight['entityType'];
    entityId: string;
  },
): Insight {
  seq += 1;
  return {
    id: partial.id ?? `ins-${seq}`,
    userId: 'u1',
    subtitle: null,
    reason: null,
    importance: 'normal',
    priorityScore: 500,
    priorityReasons: [],
    timeLabel: null,
    dueAt: null,
    status: 'active',
    snoozedUntil: null,
    source: {
      type: 'gmail',
      id: partial.entityId,
      label: 'Gmail',
      timestamp: at('2026-09-05', '06:00'),
    },
    actions: [],
    tags: ['mail'],
    forDate: '2026-09-05',
    confidence: 0.9,
    isLowConfidence: false,
    dedupeKey: `${partial.kind}:${partial.entityType}:${partial.entityId}`,
    createdAt: at('2026-09-05', '06:30'),
    updatedAt: at('2026-09-05', '06:30'),
    ...partial,
  };
}
function event(
  partial: Partial<CalendarEvent> & { title: string; startAt: string; endAt: string },
): CalendarEvent {
  seq += 1;
  return {
    id: partial.id ?? `ev-${seq}`,
    userId: 'u1',
    accountId: 'acc-1',
    externalEventId: `x-${seq}`,
    calendarId: 'primary',
    description: null,
    location: null,
    meetingUrl: null,
    meetingProvider: null,
    allDay: false,
    attendees: [],
    organizerIsUser: true,
    status: 'confirmed',
    providerUpdatedAt: null,
    source: 'google_calendar',
    prepGeneratedAt: null,
    postMeetingHandledAt: null,
    isAiCreated: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const ahmet = insight({
  id: 'i-ahmet',
  kind: 'priority',
  badge: 'urgent',
  title: "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.",
  entityType: 'email_thread',
  entityId: 'e1',
  importance: 'critical',
  priorityScore: 920,
  timeLabel: '08:42',
  dueAt: at('2026-09-05', '17:00'),
  source: {
    type: 'gmail',
    id: 'e1',
    label: 'Gmail',
    person: 'Ahmet Yılmaz',
    timestamp: at('2026-09-05', '08:42'),
  },
  actions: [{ id: 'reply', label: 'Yanıtla', kind: 'reply', primary: true }],
  tags: ['important', 'mail'],
});
const meeting = insight({
  id: 'i-meeting',
  kind: 'meeting',
  badge: 'meeting',
  title: '14:30 Mehmet ile müşteri toplantısı',
  entityType: 'calendar_event',
  entityId: 'd1',
  importance: 'high',
  priorityScore: 800,
  timeLabel: '14:30',
  dueAt: at('2026-09-05', '14:30'),
  source: {
    type: 'google_calendar',
    id: 'd1',
    label: 'Google Takvim',
    person: 'Mehmet Yılmaz',
    personId: 'c-mehmet',
    timestamp: at('2026-09-05', '14:30'),
    url: 'https://meet.google.com/abc',
  },
  tags: ['important', 'calendar'],
});
const application = insight({
  id: 'i-app',
  kind: 'deadline',
  badge: 'deadline',
  title: "Başvuru bugün 17:00'de kapanıyor.",
  entityType: 'email_thread',
  entityId: 'e3',
  importance: 'high',
  priorityScore: 700,
  timeLabel: '17:00',
  dueAt: at('2026-09-05', '17:00'),
  source: {
    type: 'gmail',
    id: 'e3',
    label: 'Gmail',
    person: 'Girişim Programı',
    timestamp: at('2026-09-04', '16:10'),
  },
  tags: ['important', 'mail'],
});
const followUpInsight = insight({
  id: 'i-fu',
  kind: 'follow_up',
  badge: 'follow_up',
  title: 'Gönderdiğin teklif mailine 3 gündür cevap gelmedi.',
  entityType: 'follow_up',
  entityId: 'fu1',
  priorityScore: 520,
  timeLabel: '3 gün',
  source: {
    type: 'gmail',
    id: 'e4',
    label: 'Gmail',
    person: 'Mehmet Yılmaz',
    personId: 'c-mehmet',
    timestamp: at('2026-09-02', '10:15'),
  },
  tags: ['follow_up', 'mail'],
});
const selin = insight({
  id: 'i-selin',
  kind: 'waiting_for_user',
  badge: 'waiting',
  title: 'Selin sözleşme taslağı için yorumunu bekliyor.',
  entityType: 'email_thread',
  entityId: 'e2',
  importance: 'high',
  priorityScore: 780,
  timeLabel: 'Yarın 12:00',
  dueAt: at('2026-09-06', '12:00'),
  source: {
    type: 'gmail',
    id: 'e2',
    label: 'Gmail',
    person: 'Selin Kaya',
    timestamp: at('2026-09-04', '15:40'),
  },
  actions: [{ id: 'reply', label: 'Yanıtla', kind: 'reply', primary: true }],
  tags: ['important', 'mail'],
});
const cargo = insight({
  id: 'i-cargo',
  kind: 'life_event',
  badge: 'personal',
  title: 'Trendyol siparişin bugün geliyor.',
  entityType: 'life_event',
  entityId: 's1',
  priorityScore: 300,
  timeLabel: 'Bugün',
  dueAt: at('2026-09-05', '14:00'),
  source: {
    type: 'gmail',
    id: 's1',
    label: 'Kargo',
    person: 'Yurtiçi',
    timestamp: at('2026-09-04', '19:02'),
  },
  tags: ['personal'],
});
const promiseInsight = insight({
  id: 'i-promise',
  kind: 'commitment',
  badge: 'commitment',
  title: "Mehmet'e teklif gönder",
  entityType: 'commitment',
  entityId: 'g1',
  priorityScore: 600,
  timeLabel: 'Yarın 18:00',
  dueAt: at('2026-09-06', '18:00'),
  source: {
    type: 'meeting_note',
    id: 'n1',
    label: 'Toplantı notu',
    person: 'Mehmet Yılmaz',
    personId: 'c-mehmet',
    timestamp: at('2026-09-01', '15:31'),
  },
  tags: ['follow_up'],
});
const newSinceMorning = insight({
  id: 'i-new',
  kind: 'priority',
  badge: 'urgent',
  title: 'Ahmet toplantıyı 16:00’ya almak istiyor.',
  entityType: 'email_thread',
  entityId: 'e7',
  importance: 'critical',
  priorityScore: 900,
  timeLabel: '12:10',
  source: {
    type: 'gmail',
    id: 'e7',
    label: 'Gmail',
    person: 'Ahmet Yılmaz',
    timestamp: at('2026-09-05', '12:10'),
  },
  createdAt: at('2026-09-05', '12:12'),
  updatedAt: at('2026-09-05', '12:12'),
  tags: ['important', 'mail'],
});
const insights = [ahmet, meeting, application, followUpInsight, selin, cargo, promiseInsight];

const events = [
  event({
    id: 'd1',
    title: 'Mehmet ile müşteri toplantısı',
    startAt: at('2026-09-05', '14:30'),
    endAt: at('2026-09-05', '15:30'),
    location: 'Ofis',
    attendees: [
      {
        name: 'Mehmet Yılmaz',
        email: 'mehmet@musteri.com',
        isOrganizer: false,
        responseStatus: 'accepted',
      },
    ],
  }),
  event({
    id: 'd2',
    title: 'Ürün gözden geçirme',
    startAt: at('2026-09-05', '16:00'),
    endAt: at('2026-09-05', '16:30'),
    meetingUrl: 'https://teams.microsoft.com/x',
    location: 'Online',
  }),
  event({
    id: 'd3',
    title: 'Akşam yemeği · Karaköy',
    startAt: at('2026-09-05', '20:30'),
    endAt: at('2026-09-05', '22:30'),
    location: 'Karaköy, İstanbul',
    source: 'apple_calendar',
  }),
  event({
    id: 'd4',
    title: 'Haftalık ekip',
    startAt: at('2026-09-06', '09:00'),
    endAt: at('2026-09-06', '10:00'),
    location: 'Ofis',
  }),
  event({
    id: 'd5',
    title: 'Doktor randevusu',
    startAt: at('2026-09-07', '14:30'),
    endAt: at('2026-09-07', '15:15'),
    location: 'Nişantaşı',
  }),
  event({
    id: 'dx',
    title: 'İptal',
    startAt: at('2026-09-05', '11:00'),
    endAt: at('2026-09-05', '12:00'),
    status: 'cancelled',
  }),
];
const followUps: FollowUp[] = [
  {
    id: 'fu1',
    userId: 'u1',
    threadId: 'e4',
    contactId: 'c-mehmet',
    counterpartName: 'Mehmet Yılmaz',
    topic: 'Teklif',
    sentAt: at('2026-09-02', '10:15'),
    nudgeAfterDays: 3,
    status: 'nudge_due',
    snoozedUntil: null,
    repliedAt: null,
    closedAt: null,
    source: {
      type: 'gmail',
      id: 'e4',
      label: 'Gmail',
      person: 'Mehmet Yılmaz',
      timestamp: at('2026-09-02', '10:15'),
    },
    dismissCount: 0,
    createdAt: now,
    updatedAt: now,
  },
];
const commitments: Commitment[] = [
  {
    id: 'g3',
    userId: 'u1',
    text: 'Mehmet Teklif v2 geri bildirimi gönderecek',
    direction: 'other_owes',
    counterpartName: 'Mehmet Yılmaz',
    dueAt: at('2026-09-05', '18:00'),
    dueText: 'bu hafta',
    status: 'open',
    source: {
      type: 'gmail',
      id: 'e4',
      label: 'Gmail',
      person: 'Mehmet Yılmaz',
      timestamp: at('2026-09-02', '10:15'),
    },
    confidence: 0.7,
    createdAt: now,
    updatedAt: now,
  },
];
const lifeEvents: LifeEvent[] = [
  {
    id: 's1',
    userId: 'u1',
    type: 'shipment',
    title: 'Trendyol siparişin bugün geliyor.',
    details: {
      carrier: 'Yurtiçi Kargo',
      deliveryWindow: { start: at('2026-09-05', '14:00'), end: at('2026-09-05', '18:00') },
    },
    eventAt: at('2026-09-05', '14:00'),
    status: 'today',
    source: { type: 'gmail', id: 'e5', label: 'Kargo', timestamp: at('2026-09-04', '19:02') },
    confidence: 0.93,
    dedupeKey: 'l1',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 's2',
    userId: 'u1',
    type: 'flight',
    title: 'TK2412 İstanbul → Antalya',
    details: {
      airline: 'THY',
      departureAt: at('2026-09-06', '09:15'),
      checkInUrl: 'https://thy.example',
    },
    eventAt: at('2026-09-06', '09:15'),
    status: 'upcoming',
    source: { type: 'gmail', id: 'e6', label: 'THY', timestamp: at('2026-08-28', '11:20') },
    confidence: 0.95,
    dedupeKey: 'l2',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 's3',
    userId: 'u1',
    type: 'payment',
    title: 'Elektrik faturası · 1.842 TL',
    details: {
      payee: 'CK Enerji',
      amount: 1842,
      currency: 'TRY',
      dueAt: at('2026-09-10', '23:59'),
    },
    eventAt: at('2026-09-10', '23:59'),
    status: 'upcoming',
    source: {
      type: 'gmail',
      id: 'e7',
      label: 'Gmail',
      person: 'CK Enerji',
      timestamp: at('2026-09-03', '09:05'),
    },
    confidence: 0.9,
    dedupeKey: 'l3',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 's4',
    userId: 'u1',
    type: 'subscription',
    title: 'Netflix yenilenecek',
    details: { serviceName: 'Netflix', renewsAt: at('2026-09-09', '00:00') },
    eventAt: at('2026-09-09', '00:00'),
    status: 'upcoming',
    source: {
      type: 'gmail',
      id: 'e8',
      label: 'Gmail',
      person: 'Netflix',
      timestamp: at('2026-09-02', '07:30'),
    },
    confidence: 0.9,
    dedupeKey: 'l4',
    createdAt: now,
    updatedAt: now,
  },
];

function ctx(partial: Partial<BriefingContext> = {}): BriefingContext {
  return {
    insights,
    events,
    followUps,
    commitments,
    lifeEvents,
    now,
    timezone: tz,
    userName: 'Yunus',
    counts: { analyzedEmails: 46, analyzedCalendars: 1, analyzedDays: 3 },
    ...partial,
  };
}

const weekly: WeeklyMetrics = {
  weekStart: '2026-09-07',
  weekEnd: '2026-09-13',
  analyzedEmails: 312,
  importantItems: 18,
  followUps: 6,
  followUpsAnswered: 4,
  meetings: 9,
  meetingsWithPrep: 7,
  deadlines: 5,
  deadlinesMissed: 0,
  estimatedTimeSavedMinutes: 135,
  timeSavedBreakdown: { unreadMails: 90, prepNotes: 30, followUpDrafts: 15 },
  busiestDay: { date: '2026-09-09', meetings: 4, note: 'Mehmet ile iki toplantı' },
  topPeople: [{ name: 'Mehmet Yılmaz', count: 12 }],
  nextWeek: 'Gelecek hafta Çarşamba yoğun görünüyor.',
};

describe('briefing · candidates', () => {
  it('morning: six fixed sections in order, real items only, empty sections hidden', () => {
    const c = assembleBriefingCandidates('morning', ctx());
    expect(c.sections.map((s) => s.section)).toEqual([
      'priorities',
      'schedule',
      'waiting_for_you',
      'waiting_for_others',
      'deadlines',
      'personal',
    ]);
    const priorities = c.sections[0]?.items ?? [];
    expect(priorities).toHaveLength(5);
    expect(priorities[0]).toMatchObject({
      icon: 'mail',
      title: "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.",
      meta: 'Acil · 08:42',
      insightId: 'i-ahmet',
      entityType: 'email_thread',
      entityId: 'e1',
      candidateId: 'priorities:email_thread:e1',
      status: 'open',
    });
    expect(priorities.filter((p) => p.source?.personId === 'c-mehmet').length).toBeLessThanOrEqual(
      2,
    );
    const schedule = c.sections[1]?.items ?? [];
    expect(schedule.map((s) => [s.icon, s.title, s.meta])).toEqual([
      ['event', 'Mehmet ile müşteri toplantısı', '14:30 · 60 dk · Ofis'],
      ['videocam', 'Ürün gözden geçirme', '16:00 · 30 dk · Online'],
      ['restaurant', 'Akşam yemeği · Karaköy', '20:30 · 120 dk · Karaköy, İstanbul'],
    ]);
    const waitingYou = c.sections[2]?.items ?? [];
    expect(waitingYou.map((w) => [w.icon, w.meta])).toEqual([
      ['person', 'Ahmet Yılmaz · Bugün 17:00'],
      ['person', 'Selin Kaya · Yarın 12:00'],
    ]);
    const waitingOthers = c.sections[3]?.items ?? [];
    expect(waitingOthers.map((w) => [w.icon, w.title, w.meta])).toEqual([
      ['schedule_send', 'Mehmet Yılmaz · Teklif', '3 gündür yanıt yok'],
      ['handshake', 'Mehmet Teklif v2 geri bildirimi gönderecek', 'Bugün 18:00'],
    ]);
    const deadlines = c.sections[4]?.items ?? [];
    expect(deadlines.map((d) => [d.icon, d.title, d.meta])).toEqual([
      ['flag', "Başvuru bugün 17:00'de kapanıyor.", 'Bugün 17:00'],
      ['autorenew', 'Netflix yenilenecek', '9 Eylül'],
      ['receipt_long', 'Elektrik faturası · 1.842 TL', '10 Eylül'],
    ]);
    const personal = c.sections[5]?.items ?? [];
    expect(personal.map((p) => [p.icon, p.meta])).toEqual([
      ['package_2', '14:00–18:00'],
      ['flight', 'Yarın 09:15'],
      ['autorenew', '9 Eylül'],
      ['receipt_long', '10 Eylül'],
    ]);
    const empty = assembleBriefingCandidates(
      'morning',
      ctx({ insights: [], events: [], followUps: [], commitments: [], lifeEvents: [] }),
    );
    expect(empty.sections).toEqual([]);
  });
  it('midday: only changes since the morning and the rest of the day', () => {
    const c = assembleBriefingCandidates(
      'midday',
      ctx({
        insights: [...insights, newSinceMorning],
        now: at('2026-09-05', '13:00'),
        sinceAt: at('2026-09-05', '08:00'),
      }),
    );
    expect(c.sections.map((s) => s.section)).toEqual(['changes', 'rest_of_day']);
    expect(c.sections[0]?.items.map((i) => i.entityId)).toEqual(['e7']);
    expect(c.sections[1]?.items.map((i) => [i.title, i.meta])).toEqual([
      ['Trendyol siparişin bugün geliyor.', 'Bugün'],
      ['Mehmet ile müşteri toplantısı', '14:30 · 60 dk · Ofis'],
      ['Ürün gözden geçirme', '16:00 · 30 dk · Online'],
      ["Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.", 'Bugün 17:00'],
      ["Başvuru bugün 17:00'de kapanıyor.", 'Bugün 17:00'],
      ['Akşam yemeği · Karaköy', '20:30 · 120 dk · Karaköy, İstanbul'],
    ]);
    const quiet = assembleBriefingCandidates(
      'midday',
      ctx({ now: at('2026-09-05', '13:00'), sinceAt: at('2026-09-05', '08:00') }),
    );
    expect(quiet.sections.map((s) => s.section)).toEqual(['rest_of_day']);
  });
  it('evening: completed, carried over, follow-ups and tomorrow’s first event', () => {
    const doneTask: TaskItem = {
      id: 't9',
      userId: 'u1',
      title: 'Rapor gönder',
      dueAt: null,
      status: 'completed',
      completedAt: at('2026-09-05', '15:10'),
      source: null,
      provider: 'internal',
      scheduledStartAt: null,
      scheduledEndAt: null,
      priority: 'normal',
      createdAt: now,
      updatedAt: now,
    };
    const c = assembleBriefingCandidates(
      'evening',
      ctx({
        now: at('2026-09-05', '19:00'),
        completedToday: [{ ...ahmet, status: 'completed', updatedAt: at('2026-09-05', '16:40') }],
        tasksDoneToday: [doneTask],
        insights: [selin, application, promiseInsight, meeting, cargo],
      }),
    );
    expect(c.sections.map((s) => s.section)).toEqual([
      'completed',
      'carried_over',
      'follow_ups',
      'first_event_tomorrow',
    ]);
    expect(c.sections[0]?.items.map((i) => [i.title, i.meta, i.status])).toEqual([
      ["Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.", 'Tamamlandı · 16:40', 'done'],
      ['Rapor gönder', 'Tamamlandı · 15:10', 'done'],
    ]);
    expect(c.sections[1]?.items.map((i) => i.entityId)).toEqual(['e2', 'e3', 'g1']);
    expect(c.sections[3]?.items[0]).toMatchObject({
      title: 'Haftalık ekip',
      meta: 'Yarın 09:00 · 60 dk · Ofis',
      entityId: 'd4',
    });
  });
  it('weekly: metrics-driven sections', () => {
    const c = assembleBriefingCandidates('weekly', ctx({ weekly }));
    expect(c.sections.map((s) => s.section)).toEqual([
      'priorities',
      'deadlines',
      'follow_ups',
      'schedule',
    ]);
    expect(c.sections[3]?.items.map((i) => i.meta)).toEqual([
      'Bugün 14:30 · 60 dk · Ofis',
      'Bugün 16:00 · 30 dk · Online',
      'Bugün 20:30 · 120 dk · Karaköy, İstanbul',
      'Yarın 09:00 · 60 dk · Ofis',
      '7 Eylül 14:30 · 45 dk · Nişantaşı',
    ]);
  });
  it('produces prompt candidates with stable ids', () => {
    const c = assembleBriefingCandidates('morning', ctx());
    const prompt = toBriefingPromptCandidates(c, { insights });
    expect(prompt[0]).toMatchObject({
      id: 'priorities:email_thread:e1',
      section: 'priorities',
      importance: 'critical',
      source: 'Gmail · Ahmet Yılmaz',
    });
    expect(new Set(prompt.map((p) => p.id)).size).toBe(prompt.length);
  });
});

describe('briefing · fallback composition', () => {
  it('morning: headline, subline, mood and a grounded Lora narrative with audio chapters', () => {
    const c = assembleBriefingCandidates('morning', ctx());
    const b = composeBriefingFallback('morning', c, ctx());
    expect(b.kind).toBe('morning');
    expect(b.forDate).toBe('2026-09-05');
    expect(b.headline).toBe('Bugün bilmen gereken 5 şey var.');
    expect(b.highlightNumber).toBe(5);
    expect(b.subline).toBe('3 önemli mail · 3 etkinlik · 2 takip');
    expect(b.counts).toMatchObject({
      importantEmails: 3,
      events: 3,
      followUps: 2,
      deadlines: 3,
      total: 5,
      analyzedEmails: 46,
      analyzedCalendars: 1,
      analyzedDays: 3,
    });
    expect(b.mood).toBe('Bugün dengeli bir günün var.');
    expect(
      b.narrative.startsWith(
        "Öğlene kadar toplantın bulunmuyor. Saat 14:30'da Mehmet ile müşteri toplantısı var.",
      ),
    ).toBe(true);
    expect(b.narrative).toContain(
      "Toplantı öncesinde Mehmet Yılmaz'a gönderdiğin son maile bakman faydalı olabilir.",
    );
    expect(b.narrative).toContain(
      "En acili: Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.",
    );
    expect(b.narrative).toContain('Gelen 46 mail arasında 3 konu dikkat gerektiriyor.');
    expect(b.narrative.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(5);
    expect(b.audio?.provider).toBe('device_tts');
    const chapters = b.audio?.chapters ?? [];
    expect(chapters.length).toBeLessThanOrEqual(6);
    expect(chapters.map((ch) => ch.title)).toEqual([
      'Genel bakış',
      'Bugünün öncelikleri',
      'Programın',
      'Cevap bekleyenler',
      'Son tarihler',
      'Kişisel gelişmeler',
    ]);
    expect(chapters[0]?.text.startsWith('Günaydın Yunus.')).toBe(true);
    expect(chapters[2]?.text).toBe(
      "Saat 14:30'da Mehmet ile müşteri toplantısı, saat 16:00'da Ürün gözden geçirme, saat 20:30'da Akşam yemeği, Karaköy.",
    );
    for (let i = 1; i < chapters.length; i++) {
      const prev = chapters[i - 1];
      const cur = chapters[i];
      if (prev && cur) expect(cur.startSec).toBe(prev.startSec + prev.durationSec);
    }
    expect(b.audio?.durationSec).toBe(chapters.reduce((s, ch) => s + ch.durationSec, 0));
    expect(b.audio?.script).not.toMatch(/[·→]/);
    expect(b.estimatedReadSec).toBe(estimateReadSeconds(b.audio?.script ?? ''));
    expect(b.items.every((it) => typeof it.chapterIndex === 'number')).toBe(true);
    expect(b.items.find((it) => it.section === 'waiting_for_others')?.chapterIndex).toBe(3);
    expect(b.hasChanges).toBe(true);
    expect(b.version).toBe(1);
  });
  it('morning with nothing to report', () => {
    const empty = ctx({
      insights: [],
      events: [],
      followUps: [],
      commitments: [],
      lifeEvents: [],
      counts: { analyzedEmails: 12, analyzedCalendars: 1, analyzedDays: 1 },
    });
    const b = composeBriefingFallback(
      'morning',
      assembleBriefingCandidates('morning', empty),
      empty,
    );
    expect(b.headline).toBe('Bugün her şey kontrol altında.');
    expect(b.highlightNumber).toBe(0);
    expect(b.narrative).toBe(
      'Bugün takvimin oldukça sakin. Gelen 12 mail arasında dikkat gerektiren bir konu yok.',
    );
    expect(b.audio?.chapters).toHaveLength(1);
  });
  it('midday and evening headlines', () => {
    const mid = ctx({
      insights: [...insights, newSinceMorning],
      now: at('2026-09-05', '13:00'),
      sinceAt: at('2026-09-05', '08:00'),
    });
    const m = composeBriefingFallback('midday', assembleBriefingCandidates('midday', mid), mid);
    expect(m.headline).toBe('Sabahından beri 1 önemli gelişme oldu.');
    expect(m.hasChanges).toBe(true);
    expect(m.narrative).toContain('Sabahtan beri 1 yeni gelişme var.');
    expect(m.narrative).toContain(
      "Günün kalanında 3 etkinliğin var; ilki saat 14:30'da Mehmet ile müşteri toplantısı.",
    );
    const quietCtx = ctx({ now: at('2026-09-05', '13:00'), sinceAt: at('2026-09-05', '08:00') });
    const q = composeBriefingFallback(
      'midday',
      assembleBriefingCandidates('midday', quietCtx),
      quietCtx,
    );
    expect(q.headline).toBe('Her şey planlandığı gibi.');
    expect(q.hasChanges).toBe(false);
    expect(q.highlightNumber).toBe(0);

    const eveCtx = ctx({
      now: at('2026-09-05', '19:00'),
      completedToday: [{ ...ahmet, status: 'completed' }],
      insights: [selin, application, promiseInsight],
    });
    const e = composeBriefingFallback(
      'evening',
      assembleBriefingCandidates('evening', eveCtx),
      eveCtx,
    );
    expect(e.headline).toBe('Bugünden yarına 3 konu kaldı.');
    expect(e.subline).toBe('1 tamamlandı · 2 takip · Yarın 09:00 Haftalık ekip');
    expect(e.narrative).toBe(
      "Bugün 1 konuyu tamamladın. Yarına 3 konu kaldı. Selin sözleşme taslağı için yorumunu bekliyor. Mehmet Yılmaz 3 gündür yanıt vermedi. Yarın ilk etkinliğin saat 09:00'da Haftalık ekip.",
    );
    expect(e.mood).toBe('Bugün için bu kadar. İyi dinlenmeler.');
  });
  it('weekly narrative and outlook come from metrics only', () => {
    const wCtx = ctx({ weekly });
    const w = composeBriefingFallback('weekly', assembleBriefingCandidates('weekly', wCtx), wCtx);
    expect(w.headline).toBe('Haftan nasıl geçti?');
    expect(w.highlightNumber).toBe(18);
    expect(w.subline).toBe('312 mail · 18 önemli konu · 9 toplantı');
    expect(w.narrative).toBe(
      'Bu hafta 312 mail analiz edildi, 18 önemli konu öne çıkarıldı. 9 toplantının 7 tanesi için hazırlık notu hazırdı. 6 takibin 4 tanesi cevaplandı. 5 son tarihin hiçbiri kaçmadı. Yaklaşık 2 sa 15 dk kazandın.',
    );
    expect(w.outlook).toBe('Gelecek hafta Çarşamba yoğun görünüyor.');
    expect(w.weekly).toEqual(weekly);
  });
  it('speaks English when asked', () => {
    const enCtx = ctx({ locale: 'en' });
    const b = composeBriefingFallback(
      'morning',
      assembleBriefingCandidates('morning', enCtx),
      enCtx,
    );
    expect(b.headline).toBe('There are 5 things you need to know today.');
    expect(b.subline).toBe('3 important emails · 3 events · 2 follow-ups');
    expect(b.narrative).toContain('At 14:30 you have Mehmet ile müşteri toplantısı.');
    expect(b.audio?.chapters[0]?.text.startsWith('Good morning Yunus.')).toBe(true);
    expect(weeklyShareText(weekly, { locale: 'en' })).toContain('312 emails analyzed');
  });
  it('helpers: locative clocks, ablative names, TTS text and read time', () => {
    expect(clockLocative(at('2026-09-05', '14:30'), tz)).toBe("14:30'da");
    expect(clockLocative(at('2026-09-05', '09:00'), tz)).toBe("09:00'da");
    expect(clockLocative(at('2026-09-05', '17:00'), tz)).toBe("17:00'de");
    expect(turkishAblative('Mehmet Yılmaz')).toBe("Mehmet Yılmaz'dan");
    expect(turkishAblative('Selin Kaya')).toBe("Selin Kaya'dan");
    expect(turkishAblative('Ahmet')).toBe("Ahmet'ten");
    expect(
      ttsFriendly(
        'Trendyol siparişin 14:00–18:00 arasında geliyor · %8 indirim · TK2412 İstanbul → Antalya, saat 09:15',
      ),
    ).toBe(
      'Trendyol siparişin 14:00 ile 18:00 arasında geliyor, yüzde 8 indirim, TK2412 İstanbul - Antalya, saat 09:15',
    );
    expect(ttsFriendly('Toplantı 14:30, teslimat 14:00–18:00.')).toBe(
      'Toplantı saat 14:30, teslimat 14:00 ile 18:00.',
    );
    expect(ttsFriendly('Delivery 14:00–18:00, meeting 14:30.', 'en')).toBe(
      'Delivery from 14:00 to 18:00, meeting at 14:30.',
    );
    expect(estimateReadSeconds('bir iki üç')).toBe(10);
    expect(estimateReadSeconds(Array.from({ length: 300 }, () => 'kelime').join(' '))).toBe(120);
    expect(estimateReadSeconds('')).toBe(0);
  });
});

describe('briefing · AI merge, carry-over and share card', () => {
  const c = assembleBriefingCandidates('morning', ctx());
  const fallback = composeBriefingFallback('morning', c, ctx());
  const known = c.sections.flatMap((s) => s.items.map((i) => i.candidateId));
  const ai: BriefingAi = {
    headline: 'Bugün bilmen gereken 5 şey var.',
    highlightNumber: 5,
    subline: '99 önemli mail · 99 etkinlik',
    mood: 'Sakin bir gün seni bekliyor.',
    narrative: "Yunus, öğlene kadar boşsun. Saat 14:30'da Mehmet ile görüşeceksin.",
    outlook: null,
    sections: [
      {
        section: 'priorities',
        itemIds: ['priorities:calendar_event:d1', 'nope:invented:1', 'priorities:email_thread:e1'],
      },
      { section: 'bogus_section', itemIds: ['priorities:email_thread:e1'] },
      { section: 'schedule', itemIds: [] },
    ],
    audioScript: [
      { title: 'Genel', text: 'Günaydın Yunus. Bugün sakin bir gün.' },
      { title: 'Öncelikler', text: 'Ahmet revize teklif bekliyor, saat 17:00.' },
    ],
    uncertainties: [],
  };
  it('accepts narration, keeps counts and subline, reorders only known ids', () => {
    const merged = mergeAiBriefing(fallback, ai, known);
    expect(merged.headline).toBe(ai.headline);
    expect(merged.mood).toBe(ai.mood);
    expect(merged.narrative).toBe(ai.narrative);
    expect(merged.subline).toBe(fallback.subline);
    expect(merged.counts).toEqual(fallback.counts);
    expect(merged.highlightNumber).toBe(5);
    const priorities = merged.items.filter((i) => i.section === 'priorities');
    expect(priorities.map((i) => i.candidateId).slice(0, 2)).toEqual([
      'priorities:calendar_event:d1',
      'priorities:email_thread:e1',
    ]);
    expect(priorities).toHaveLength(5);
    expect(priorities.map((i) => i.position)).toEqual([0, 1, 2, 3, 4]);
    expect(merged.items.filter((i) => i.section === 'schedule').map((i) => i.candidateId)).toEqual(
      fallback.items.filter((i) => i.section === 'schedule').map((i) => i.candidateId),
    );
    expect(merged.items.some((i) => i.candidateId.startsWith('nope'))).toBe(false);
    expect(merged.audio?.chapters.map((ch) => ch.title)).toEqual(['Genel', 'Öncelikler']);
    expect(merged.audio?.chapters[1]?.text).toBe('Ahmet revize teklif bekliyor, saat 17:00.');
    expect(
      merged.items.every(
        (i) => i.chapterIndex === null || i.chapterIndex === undefined || i.chapterIndex < 2,
      ),
    ).toBe(true);
    expect(merged.estimatedReadSec).toBe(estimateReadSeconds(merged.audio?.script ?? ''));
  });
  it('rejects a headline whose number contradicts the highlight number and keeps fallback audio when the script is empty', () => {
    const merged = mergeAiBriefing(
      fallback,
      { ...ai, headline: 'Bugün bilmen gereken 9 şey var.', audioScript: [] },
      known,
    );
    expect(merged.headline).toBe(fallback.headline);
    expect(merged.audio).toEqual(fallback.audio);
  });
  it('plans the evening carry-over from selected insight ids only', () => {
    const eveCtx = ctx({
      now: at('2026-09-05', '19:00'),
      insights: [selin, application, promiseInsight],
    });
    const eve = composeBriefingFallback(
      'evening',
      assembleBriefingCandidates('evening', eveCtx),
      eveCtx,
    );
    const plan = eveningCarryOverPlan(eve, ['i-selin', 'i-promise', 'i-unknown', 'i-selin'], {
      tomorrowDateKey: '2026-09-06',
      now: at('2026-09-05', '19:05'),
    });
    expect(plan.closedAt).toBe(at('2026-09-05', '19:05'));
    expect(plan.carryOver).toEqual([
      { insightId: 'i-selin', entityType: 'email_thread', entityId: 'e2', forDate: '2026-09-06' },
      { insightId: 'i-promise', entityType: 'commitment', entityId: 'g1', forDate: '2026-09-06' },
    ]);
    expect(plan.ignoredIds).toEqual(['i-unknown']);
  });
  it('share text carries metrics only, never names or subjects', () => {
    const text = weeklyShareText(weekly);
    expect(text).toBe(
      [
        'DİJİTAL HAFTAM · 7–13 Eylül',
        '312 mail analiz edildi',
        '18 önemli konu öne çıkarıldı',
        '9 toplantı · 7 hazırlık notu',
        '6 takip · 4 cevaplandı',
        '5 son tarih, hiçbiri kaçmadı',
        'Kazandığın zaman: 2 sa 15 dk',
        'Dijital Asistan · dijitalasistan.app',
      ].join('\n'),
    );
    expect(text).not.toContain('Mehmet');
    expect(text).not.toContain('Çarşamba');
    expect(
      weeklyShareText({
        ...weekly,
        weekStart: '2026-09-28',
        weekEnd: '2026-10-04',
        deadlinesMissed: 1,
      }),
    ).toContain('28 Eylül – 4 Ekim');
    expect(weeklyShareText({ ...weekly, deadlinesMissed: 1 })).toContain(
      '5 son tarih, 1 tanesi kaçtı',
    );
  });
});
