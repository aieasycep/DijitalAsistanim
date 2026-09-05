import { describe, expect, it } from 'vitest';
import type {
  CalendarConflict,
  CalendarEvent,
  Commitment,
  EmailAnalysis,
  EmailThread,
  FollowUp,
  Insight,
  LifeEvent,
  PriorityRule,
  ScheduleSuggestion,
  TaskItem,
  VipPerson,
} from '@da/domain';
import { scoreCandidate, type PriorityCandidate } from '../priority';
import { zonedTimeToUtc } from '../util';
import {
  buildInsights,
  flowFilter,
  greetingFor,
  groupTodayFeed,
  mailIntelligenceBuckets,
  selectTopInsights,
  timeLabel,
  type InsightDraft,
} from './index';

const tz = 'Europe/Istanbul';
const at = (date: string, hhmm: string): string => zonedTimeToUtc(date, hhmm, tz);
const now = at('2026-09-05', '08:42'); // Cumartesi
const userEmails = ['yunus@example.com'];

const mehmetVip: VipPerson = {
  id: 'vip-1',
  userId: 'u1',
  contactId: 'c-mehmet',
  displayName: 'Mehmet Yılmaz',
  email: 'mehmet@musteri.com',
  relation: 'Müşteri',
  notifyAlways: true,
  createdAt: now,
  updatedAt: now,
};
const muteRule: PriorityRule = {
  id: 'r-mute',
  userId: 'u1',
  type: 'mute_domain',
  value: 'spam.io',
  label: 'spam',
  enabled: true,
  position: 0,
  createdAt: now,
  updatedAt: now,
};
const rank = (c: PriorityCandidate) =>
  scoreCandidate(c, { rules: [muteRule], vips: [mehmetVip], learned: [], now, timezone: tz });

let seq = 0;
function analysis(partial: Partial<EmailAnalysis> & { summary: string }): EmailAnalysis {
  return {
    importance: 'normal',
    category: 'information',
    requiresUserAction: false,
    keyPoints: [],
    people: [],
    commitments: [],
    suggestedActions: [],
    confidence: 0.9,
    producedBy: 'ai_large',
    ...partial,
  };
}
function thread(
  partial: Partial<EmailThread> & { subject: string; from: { name: string; email: string } },
): EmailThread {
  seq += 1;
  const { from, ...rest } = partial;
  return {
    id: rest.id ?? `t-${seq}`,
    userId: 'u1',
    accountId: 'acc-1',
    externalThreadId: `ext-${seq}`,
    snippet: '',
    participants: [from, { name: 'Yunus Emre', email: 'yunus@example.com' }],
    lastMessageAt: at('2026-09-05', '08:42'),
    messageCount: 1,
    lastFromUser: false,
    isRead: false,
    labels: ['INBOX'],
    importance: 'normal',
    category: 'information',
    analysis: null,
    priorityScore: 0,
    priorityReasons: [],
    triage: 'ai',
    fingerprint: `fp-${seq}`,
    userDismissed: false,
    userMarkedDone: false,
    createdAt: now,
    updatedAt: now,
    ...rest,
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
function lifeEvent(
  partial: Partial<LifeEvent> & { type: LifeEvent['type']; title: string },
): LifeEvent {
  seq += 1;
  return {
    id: partial.id ?? `le-${seq}`,
    userId: 'u1',
    details: {},
    eventAt: null,
    status: 'upcoming',
    source: {
      type: 'gmail',
      id: `src-${seq}`,
      label: 'Gmail',
      timestamp: at('2026-09-04', '19:02'),
    },
    confidence: 0.93,
    dedupeKey: `life:${seq}`,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const ahmet = thread({
  id: 'e1',
  subject: 'Revize teklif',
  from: { name: 'Ahmet Yılmaz', email: 'ahmet@firma.com' },
  importance: 'critical',
  category: 'action_required',
  analysis: analysis({
    summary: "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.",
    importance: 'critical',
    category: 'action_required',
    reasonImportant:
      "Bu mailde bugün saat 17:00'ye kadar cevap istendiği için önemli olarak işaretlendi.",
    requiresUserAction: true,
    deadline: at('2026-09-05', '17:00'),
    deadlineText: 'bugün 17:00',
    keyPoints: ['Revize fiyat', 'Bugün 17:00', 'PDF formatı'],
    confidence: 0.94,
  }),
});
const selin = thread({
  id: 'e2',
  subject: 'Sözleşme taslağı · 4. madde',
  from: { name: 'Selin Kaya', email: 'selin@hukuk.com' },
  lastMessageAt: at('2026-09-04', '15:40'),
  importance: 'high',
  category: 'waiting_for_user',
  analysis: analysis({
    summary:
      'Selin sözleşme taslağının 4. maddesi için yorumunu bekliyor; yarın öğlen hukuka gidecek.',
    importance: 'high',
    category: 'waiting_for_user',
    requiresUserAction: true,
    deadline: at('2026-09-06', '12:00'),
    confidence: 0.88,
  }),
});
const girisim = thread({
  id: 'e3',
  subject: 'Girişim Programı başvurusu son gün',
  from: { name: 'Girişim Programı', email: 'basvuru@girisimprogrami.org' },
  lastMessageAt: at('2026-09-04', '16:10'),
  importance: 'high',
  category: 'deadline',
  triage: 'rules',
  analysis: analysis({
    summary: "Başvuru bugün 17:00'de kapanıyor.",
    importance: 'high',
    category: 'deadline',
    requiresUserAction: true,
    deadline: at('2026-09-05', '17:00'),
    confidence: 0.9,
  }),
});
const mehmetSent = thread({
  id: 'e4',
  subject: 'Teklif v2',
  from: { name: 'Mehmet Yılmaz', email: 'mehmet@musteri.com' },
  lastFromUser: true,
  category: 'waiting_for_other',
  lastMessageAt: at('2026-09-02', '10:15'),
});
const trendyol = thread({
  id: 'e5',
  subject: 'Siparişin yola çıktı!',
  from: { name: 'Trendyol', email: 'info@trendyol.com' },
  category: 'shipment',
  analysis: analysis({
    summary: 'Trendyol siparişin bugün 14:00–18:00 arasında teslim edilecek.',
    category: 'shipment',
  }),
});
const google = thread({
  id: 'e9',
  subject: 'Yeni cihazdan giriş yapıldı',
  from: { name: 'Google', email: 'no-reply@accounts.google.com' },
  lastMessageAt: at('2026-09-05', '06:12'),
  importance: 'high',
  category: 'security',
  analysis: analysis({
    summary: 'Google hesabında yeni giriş: Windows, Ankara.',
    importance: 'high',
    category: 'security',
    requiresUserAction: true,
    confidence: 0.97,
  }),
});
const promo = thread({
  id: 'ea',
  subject: '%40 indirim sadece bugün!',
  from: { name: 'Moda', email: 'kampanya@moda.com' },
  importance: 'low',
  category: 'promotion',
  triage: 'skip',
});
const muted = thread({
  id: 'eb',
  subject: 'Acil!!!',
  from: { name: 'Spam', email: 'x@spam.io' },
  importance: 'critical',
  category: 'action_required',
});
const noAnalysis = thread({
  id: 'ec',
  subject: 'Toplantı daveti',
  from: { name: 'Ekip', email: 'ekip@example.com' },
  importance: 'high',
  category: 'action_required',
});

const mehmetMeeting = event({
  id: 'd1',
  title: 'Mehmet ile müşteri toplantısı',
  startAt: at('2026-09-05', '14:30'),
  endAt: at('2026-09-05', '15:30'),
  location: 'Ofis',
  meetingUrl: 'https://meet.google.com/abc',
  attendees: [
    {
      name: 'Mehmet Yılmaz',
      email: 'mehmet@musteri.com',
      contactId: 'c-mehmet',
      isOrganizer: false,
      responseStatus: 'accepted',
    },
    {
      name: 'Yunus Emre',
      email: 'yunus@example.com',
      isOrganizer: true,
      responseStatus: 'accepted',
    },
  ],
});
const dinner = event({
  id: 'd3',
  title: 'Akşam yemeği · Karaköy',
  startAt: at('2026-09-05', '20:30'),
  endAt: at('2026-09-05', '22:30'),
  location: 'Karaköy, İstanbul',
  source: 'apple_calendar',
});
const past = event({
  id: 'd0',
  title: 'Dünkü',
  startAt: at('2026-09-04', '10:00'),
  endAt: at('2026-09-04', '11:00'),
});
const farAway = event({
  id: 'd9',
  title: 'Uzak',
  startAt: at('2026-09-20', '10:00'),
  endAt: at('2026-09-20', '11:00'),
});
const demir = event({
  id: 'd6',
  title: 'Müşteri toplantısı · Demir A.Ş.',
  startAt: at('2026-09-07', '14:00'),
  endAt: at('2026-09-07', '15:00'),
});
const doctor = event({
  id: 'd5',
  title: 'Doktor randevusu',
  startAt: at('2026-09-07', '14:30'),
  endAt: at('2026-09-07', '15:15'),
});
const conflict: CalendarConflict = {
  id: 'k1',
  eventA: demir,
  eventB: doctor,
  overlapMinutes: 30,
  suggestions: [],
  status: 'open',
};

const followUp: FollowUp = {
  id: 'fu1',
  userId: 'u1',
  threadId: 'e4',
  contactId: 'c-mehmet',
  counterpartName: 'Mehmet Yılmaz',
  topic: 'Teklif v2',
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
    personId: 'c-mehmet',
    timestamp: at('2026-09-02', '10:15'),
  },
  dismissCount: 0,
  createdAt: now,
  updatedAt: now,
};
const promise: Commitment = {
  id: 'g1',
  userId: 'u1',
  text: "Mehmet'e teklif gönder",
  quote: 'yarın göndereceğim',
  direction: 'user_owes',
  counterpartName: 'Mehmet Yılmaz',
  counterpartContactId: 'c-mehmet',
  dueAt: at('2026-09-06', '18:00'),
  dueText: 'yarın',
  status: 'open',
  source: {
    type: 'meeting_note',
    id: 'n1',
    label: 'Toplantı notu',
    person: 'Mehmet Yılmaz',
    timestamp: at('2026-09-01', '15:31'),
  },
  confidence: 0.9,
  relatedEventId: 'd1',
  createdAt: now,
  updatedAt: now,
};
const theyOwe: Commitment = {
  ...promise,
  id: 'g3',
  text: 'Mehmet Teklif v2 geri bildirimi gönderecek',
  quote: 'hafta içinde dönüş yapacağım',
  direction: 'other_owes',
  dueAt: at('2026-09-05', '18:00'),
  dueText: 'bu hafta',
  source: {
    type: 'gmail',
    id: 'e4',
    label: 'Gmail',
    person: 'Mehmet Yılmaz',
    timestamp: at('2026-09-02', '10:15'),
  },
  confidence: 0.7,
  relatedEventId: null,
};
const task: TaskItem = {
  id: 't1',
  userId: 'u1',
  title: 'Teklif hazırlama',
  notes: null,
  dueAt: at('2026-09-06', '18:00'),
  status: 'open',
  completedAt: null,
  source: null,
  provider: 'internal',
  scheduledStartAt: null,
  scheduledEndAt: null,
  priority: 'high',
  createdAt: now,
  updatedAt: now,
};
const shipment = lifeEvent({
  id: 's1',
  type: 'shipment',
  title: 'Trendyol siparişin bugün geliyor.',
  details: {
    carrier: 'Yurtiçi Kargo',
    merchant: 'Trendyol',
    trackingUrl: 'https://yurtici.example/1',
    deliveryWindow: { start: at('2026-09-05', '14:00'), end: at('2026-09-05', '18:00') },
  },
  eventAt: at('2026-09-05', '14:00'),
  status: 'today',
  source: {
    type: 'gmail',
    id: 'e5',
    label: 'Gmail',
    person: 'Yurtiçi',
    timestamp: at('2026-09-04', '19:02'),
  },
});
const flight = lifeEvent({
  id: 's2',
  type: 'flight',
  title: 'TK2412 · İstanbul → Antalya',
  details: {
    flightNumber: 'TK2412',
    airline: 'THY',
    from: 'İstanbul (IST)',
    to: 'Antalya (AYT)',
    departureAt: at('2026-09-06', '09:15'),
    checkInUrl: 'https://thy.example/checkin',
  },
  eventAt: at('2026-09-06', '09:15'),
  confidence: 0.95,
});
const bill = lifeEvent({
  id: 's3',
  type: 'payment',
  title: 'Elektrik faturası · 1.842 TL',
  details: {
    payee: 'CK Enerji',
    amount: 1842,
    currency: 'TRY',
    dueAt: at('2026-09-10', '23:59'),
    paymentUrl: 'https://ck.example/pay',
  },
  eventAt: at('2026-09-10', '23:59'),
  confidence: 0.9,
});
const netflix = lifeEvent({
  id: 's4',
  type: 'subscription',
  title: 'Netflix yenilenecek',
  details: {
    serviceName: 'Netflix',
    renewsAt: at('2026-09-09', '00:00'),
    amount: 229.99,
    currency: 'TRY',
  },
  eventAt: at('2026-09-09', '00:00'),
});
const lowConfidence = lifeEvent({
  id: 's5',
  type: 'reservation',
  title: 'Akşam yemeği rezervasyonu',
  details: { venue: 'Karaköy Lokantası', partySize: 4, reservationAt: at('2026-09-05', '20:30') },
  eventAt: at('2026-09-05', '20:30'),
  confidence: 0.4,
});
const done = lifeEvent({ id: 's6', type: 'shipment', title: 'Teslim edildi', status: 'done' });
const suggestion: ScheduleSuggestion = {
  id: 'sg1',
  kind: 'schedule_task',
  title: 'Yarın 14:00–16:30 arasında 2,5 saat boşluğun var.',
  detail: 'Teklif hazırlama görevini buraya yerleştirebilirim.',
  proposedStartAt: at('2026-09-06', '14:00'),
  proposedEndAt: at('2026-09-06', '16:30'),
  targetTaskId: 't1',
  reason: 'Son tarih yarın 18:00',
};

function build(locale: 'tr' | 'en' = 'tr'): InsightDraft[] {
  return buildInsights({
    threads: [ahmet, selin, girisim, mehmetSent, trendyol, google, promo, muted, noAnalysis],
    events: [mehmetMeeting, dinner, past, farAway, demir, doctor],
    tasks: [task],
    commitments: [promise, theyOwe],
    followUps: [followUp],
    lifeEvents: [shipment, flight, bill, netflix, lowConfidence, done],
    conflicts: [conflict],
    suggestions: [suggestion],
    now,
    timezone: tz,
    locale,
    rank,
    userEmails,
  });
}

const byEntity = (drafts: InsightDraft[], id: string): InsightDraft => {
  const found = drafts.find((d) => d.entityId === id);
  if (!found) throw new Error(`missing insight for ${id}`);
  return found;
};

describe('insights · buildInsights', () => {
  const drafts = build();
  it('maps the seed day into cards with the right kinds, badges, actions and labels', () => {
    const e1 = byEntity(drafts, 'e1');
    expect(e1).toMatchObject({
      kind: 'priority',
      badge: 'urgent',
      title: "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.",
      timeLabel: '08:42',
      dueAt: at('2026-09-05', '17:00'),
      entityType: 'email_thread',
      dedupeKey: 'priority:email_thread:e1',
      importance: 'critical',
      isLowConfidence: false,
    });
    expect(e1.actions.map((a) => [a.label, a.kind, a.primary])).toEqual([
      ['Yanıtla', 'reply', true],
      ['Hatırlat', 'remind', false],
    ]);
    expect(e1.source).toMatchObject({
      type: 'gmail',
      label: 'Gmail',
      person: 'Ahmet Yılmaz',
      id: 'e1',
    });
    expect(e1.reason).toBe(
      "Bu mailde bugün saat 17:00'ye kadar cevap istendiği için önemli olarak işaretlendi.",
    );
    expect(e1.tags).toEqual(expect.arrayContaining(['important', 'mail']));

    const e2 = byEntity(drafts, 'e2');
    expect(e2).toMatchObject({
      kind: 'waiting_for_user',
      badge: 'waiting',
      timeLabel: 'Yarın 12:00',
      subtitle: 'Son tarih: yarın 12:00',
    });
    expect(e2.actions.map((a) => a.label)).toEqual(['Yanıtla', 'Sabah Hatırlat']);

    const e3 = byEntity(drafts, 'e3');
    expect(e3).toMatchObject({ kind: 'deadline', badge: 'deadline', timeLabel: '17:00' });
    expect(e3.actions.map((a) => a.label)).toEqual(['Takvime Ekle']);

    const e9 = byEntity(drafts, 'e9');
    expect(e9).toMatchObject({ kind: 'security', badge: 'security', timeLabel: '06:12' });
    expect(e9.actions.map((a) => a.label)).toEqual(['Kaynağı Aç']);
    expect(e9.tags).toEqual(expect.arrayContaining(['important', 'mail', 'personal']));

    const d1 = byEntity(drafts, 'd1');
    expect(d1).toMatchObject({
      kind: 'meeting',
      badge: 'meeting',
      title: '14:30 Mehmet ile müşteri toplantısı',
      subtitle: '60 dk · Ofis',
      timeLabel: '14:30',
      entityType: 'calendar_event',
    });
    expect(d1.actions.map((a) => a.label)).toEqual(['Hazırlan']);
    expect(d1.source).toMatchObject({
      type: 'google_calendar',
      label: 'Google Takvim',
      person: 'Mehmet Yılmaz',
      personId: 'c-mehmet',
      url: 'https://meet.google.com/abc',
    });
    expect(d1.priorityReasons).toContain('VIP: Mehmet Yılmaz');
    expect(byEntity(drafts, 'd3').actions.map((a) => a.label)).toEqual(['Hatırlat']);
    expect(byEntity(drafts, 'd3').source.label).toBe('Apple Takvim');

    const fu = byEntity(drafts, 'fu1');
    expect(fu).toMatchObject({
      kind: 'follow_up',
      badge: 'follow_up',
      title: 'Gönderdiğin teklif v2 mailine 3 gündür cevap gelmedi.',
      timeLabel: '3 gün',
      entityType: 'follow_up',
      dedupeKey: 'follow_up:follow_up:fu1',
    });
    expect(fu.actions.map((a) => a.label)).toEqual(['Takip Mesajı Hazırla', 'Yarın Hatırlat']);
    expect(fu.reason).toBe('Son mesajı sen gönderdin ve Mehmet Yılmaz 3 gündür yanıt vermedi.');

    const g1 = byEntity(drafts, 'g1');
    expect(g1).toMatchObject({
      kind: 'commitment',
      badge: 'commitment',
      title: "Mehmet'e teklif gönder",
      subtitle: 'Toplantı sonrası “yarın göndereceğim” dedin.',
      timeLabel: 'Yarın 18:00',
    });
    expect(g1.actions.map((a) => a.label)).toEqual(['Planla', 'Ertele']);
    expect(byEntity(drafts, 'g3')).toMatchObject({
      kind: 'follow_up',
      badge: 'follow_up',
      subtitle: 'Mehmet Yılmaz “hafta içinde dönüş yapacağım” dedi.',
    });
    expect(byEntity(drafts, 'g3').actions.map((a) => a.label)).toEqual(['Hatırlat', 'Kaynağı Gör']);

    const t1 = byEntity(drafts, 't1');
    expect(t1).toMatchObject({
      kind: 'deadline',
      badge: 'deadline',
      subtitle: 'Son tarih: yarın 18:00',
      entityType: 'task',
    });
    expect(t1.actions.map((a) => a.label)).toEqual(['Planla', 'Tamamlandı']);

    const s1 = byEntity(drafts, 's1');
    expect(s1).toMatchObject({
      kind: 'life_event',
      badge: 'personal',
      title: 'Trendyol siparişin bugün geliyor.',
      subtitle: '14:00–18:00 · Yurtiçi Kargo',
      timeLabel: 'Bugün',
    });
    expect(s1.source.label).toBe('Kargo');
    expect(s1.actions.map((a) => [a.label, a.kind])).toEqual([['Takip Et', 'track']]);
    expect(s1.actions[0]?.payload).toEqual({ url: 'https://yurtici.example/1' });

    const s2 = byEntity(drafts, 's2');
    expect(s2).toMatchObject({
      subtitle: 'İstanbul (IST) → Antalya (AYT) · 09:15 · Check-in açık',
      timeLabel: 'Yarın 09:15',
    });
    expect(s2.source.label).toBe('THY');
    expect(s2.actions.map((a) => a.label)).toEqual(['Check-in', 'Alarm Kur']);

    const s3 = byEntity(drafts, 's3');
    expect(s3).toMatchObject({ subtitle: '1.842 TL · Son ödeme 10 Eylül', timeLabel: '10 Eyl' });
    expect(s3.actions.map((a) => [a.label, a.kind])).toEqual([
      ['Faturayı Aç', 'open_link'],
      ['Hatırlat', 'remind'],
    ]);
    expect(byEntity(drafts, 's4')).toMatchObject({
      subtitle: '9 Eylül yenileniyor · 229,99 TL',
      timeLabel: '9 Eyl',
    });
    expect(byEntity(drafts, 's4').actions.map((a) => a.kind)).toEqual(['open_link']);
    expect(byEntity(drafts, 's5')).toMatchObject({
      isLowConfidence: true,
      subtitle: 'Karaköy Lokantası · 20:30 · 4 kişi',
    });

    const sg = byEntity(drafts, 'sg1');
    expect(sg).toMatchObject({
      kind: 'suggestion',
      badge: 'calendar',
      timeLabel: 'Yarın',
      entityType: 'suggestion',
      dedupeKey: 'suggestion:suggestion:sg1',
    });
    expect(sg.actions.map((a) => a.label)).toEqual(['Planla', 'Başka zaman']);
    expect(sg.actions[0]?.payload).toMatchObject({
      taskId: 't1',
      startAt: at('2026-09-06', '14:00'),
      endAt: at('2026-09-06', '16:30'),
    });

    const k1 = byEntity(drafts, 'k1');
    expect(k1).toMatchObject({
      kind: 'conflict',
      badge: 'calendar',
      title: 'Müşteri toplantısı · Demir A.Ş. ile Doktor randevusu çakışıyor.',
      subtitle: 'Pazartesi 14:00–15:00 ve 14:30–15:15 çakışıyor.',
      entityType: 'conflict',
    });
    expect(k1.actions.map((a) => a.label)).toEqual(['Seçenekleri Gör', 'Yoksay']);
    expect(k1.tags).toEqual(expect.arrayContaining(['calendar', 'important']));
  });
  it('skips promotions, muted senders, sent threads, threads backed by a life event, past / far events and finished life events', () => {
    const ids = drafts.map((d) => d.entityId);
    for (const skipped of ['ea', 'eb', 'e4', 'e5', 'd0', 'd9', 's6'])
      expect(ids).not.toContain(skipped);
    expect(new Set(drafts.map((d) => d.dedupeKey)).size).toBe(drafts.length);
  });
  it('marks analyses without a model as low confidence and falls back to a template title', () => {
    const ec = byEntity(drafts, 'ec');
    expect(ec.title).toBe('Ekip: Toplantı daveti');
    expect(ec.confidence).toBe(0.5);
    expect(ec.isLowConfidence).toBe(true);
  });
  it('orders by tier then score and speaks English when asked', () => {
    for (let i = 1; i < drafts.length; i++) {
      const prev = drafts[i - 1];
      const cur = drafts[i];
      if (!prev || !cur) continue;
      const tier = ['low', 'normal', 'high', 'critical'];
      expect(tier.indexOf(prev.importance) >= tier.indexOf(cur.importance)).toBe(true);
    }
    const en = build('en');
    expect(byEntity(en, 'e1').actions.map((a) => a.label)).toEqual(['Reply', 'Remind me']);
    expect(byEntity(en, 'd1').source.label).toBe('Google Calendar');
    expect(byEntity(en, 's2').timeLabel).toBe('Tomorrow 09:15');
    expect(byEntity(en, 'k1').title).toBe(
      'Müşteri toplantısı · Demir A.Ş. overlaps with Doktor randevusu.',
    );
  });
  it('timeLabel follows the card rules', () => {
    const o = { now, timezone: tz };
    expect(timeLabel(at('2026-09-05', '08:42'), o)).toBe('08:42');
    expect(timeLabel(at('2026-09-06', '12:00'), o)).toBe('Yarın 12:00');
    expect(timeLabel(at('2026-09-04', '15:40'), o)).toBe('Dün 15:40');
    expect(timeLabel(at('2026-09-02', '10:15'), o)).toBe('2 Eyl');
    expect(timeLabel(at('2026-09-10', '23:59'), o)).toBe('10 Eyl');
    expect(timeLabel(at('2026-09-05', '23:59'), o)).toBe('Bugün');
    expect(timeLabel(at('2026-09-06', '00:00'), { ...o, locale: 'en' })).toBe('Tomorrow');
  });
});

function materialize(drafts: InsightDraft[]): Insight[] {
  return drafts.map((d, i) => ({
    ...d,
    id: `ins-${i}`,
    userId: 'u1',
    createdAt: now,
    updatedAt: now,
  }));
}

describe('insights · today feed', () => {
  const insights = materialize(build());
  it('greets by local hour and formats the date', () => {
    expect(greetingFor(now, tz, 'Yunus')).toBe('Günaydın, Yunus');
    expect(greetingFor(at('2026-09-05', '13:00'), tz, 'Yunus')).toBe('İyi günler, Yunus');
    expect(greetingFor(at('2026-09-05', '19:00'), tz, 'Yunus')).toBe('İyi akşamlar, Yunus');
    expect(greetingFor(now, tz, 'Yunus', 'en')).toBe('Good morning, Yunus');
    const feed = groupTodayFeed(insights, {
      now,
      timezone: tz,
      userName: 'Yunus',
      pendingApprovals: 2,
    });
    expect(feed.greeting).toBe('Günaydın, Yunus');
    expect(feed.dateLabel).toBe('5 Eylül Cumartesi');
    expect(feed.pendingApprovals).toBe(2);
    expect(feed.isEvening).toBe(false);
    expect(feed.offline).toBe(false);
    expect(
      groupTodayFeed(insights, {
        now: at('2026-09-05', '19:30'),
        timezone: tz,
        userName: 'Yunus',
        locale: 'en',
      }),
    ).toMatchObject({
      greeting: 'Good evening, Yunus',
      dateLabel: 'Saturday 5 September',
      isEvening: true,
    });
  });
  it('picks five diversified priorities (max two per person, one per entity) and groups the rest without duplicates', () => {
    const feed = groupTodayFeed(insights, { now, timezone: tz, userName: 'Yunus' });
    expect(feed.priorities).toHaveLength(5);
    const people = feed.priorities.map((i) => i.source.personId ?? i.source.person ?? '');
    expect(
      people.filter((p) => p === 'c-mehmet' || p === 'Mehmet Yılmaz').length,
    ).toBeLessThanOrEqual(2);
    expect(feed.priorities.some((i) => i.kind === 'suggestion')).toBe(false);
    expect(feed.priorities[0]?.entityId).toBe('e1');
    const all = [...feed.priorities, ...feed.meetings, ...feed.deadlines, ...feed.lifeEvents].map(
      (i) => i.dedupeKey,
    );
    expect(new Set(all).size).toBe(all.length);
    for (const m of feed.meetings) expect(m.kind).toBe('meeting');
    for (const d of feed.deadlines)
      expect(d.kind === 'deadline' || d.badge === 'deadline').toBe(true);
    for (const l of feed.lifeEvents) expect(l.kind).toBe('life_event');
    expect([...feed.meetings, ...feed.priorities].some((i) => i.entityId === 'd1')).toBe(true);
    expect([...feed.lifeEvents, ...feed.priorities].some((i) => i.entityId === 's1')).toBe(true);
  });
  it('ignores dismissed, completed and still-snoozed cards', () => {
    const tweaked = insights.map((i) =>
      i.entityId === 'e1'
        ? { ...i, status: 'dismissed' as const }
        : i.entityId === 'e9'
          ? { ...i, status: 'snoozed' as const, snoozedUntil: at('2026-09-06', '09:00') }
          : i,
    );
    const feed = groupTodayFeed(tweaked, { now, timezone: tz, userName: 'Yunus' });
    const ids = [...feed.priorities, ...feed.meetings, ...feed.deadlines, ...feed.lifeEvents].map(
      (i) => i.entityId,
    );
    expect(ids).not.toContain('e1');
    expect(ids).not.toContain('e9');
  });
  it('selectTopInsights relaxes the person cap only when the list would stay short', () => {
    const onlyMehmet = insights.filter(
      (i) =>
        (i.source.personId ?? i.source.person) === 'c-mehmet' ||
        i.source.person === 'Mehmet Yılmaz',
    );
    expect(onlyMehmet.length).toBeGreaterThan(2);
    expect(selectTopInsights(onlyMehmet, { max: 3 })).toHaveLength(3);
  });
});

describe('insights · flow and mail intelligence', () => {
  const insights = materialize(build());
  it('filters the flow by tag and keeps everything for all', () => {
    expect(flowFilter(insights, 'all', { now })).toHaveLength(insights.length);
    for (const i of flowFilter(insights, 'important', { now }))
      expect(i.tags).toContain('important');
    const personal = flowFilter(insights, 'personal', { now });
    expect(personal.map((i) => i.entityId)).toEqual(
      expect.arrayContaining(['s1', 's2', 's3', 'e9']),
    );
    expect(
      flowFilter(insights, 'calendar', { now }).every((i) => i.tags.includes('calendar')),
    ).toBe(true);
    expect(flowFilter(insights, 'follow_up', { now }).map((i) => i.entityId)).toEqual(
      expect.arrayContaining(['fu1', 'g1', 'g3']),
    );
    expect(flowFilter(insights, 'mail', { now })[0]?.entityId).toBe('e1');
  });
  it('buckets mail intelligence with counts and attention', () => {
    const res = mailIntelligenceBuckets(
      [ahmet, selin, girisim, mehmetSent, trendyol, google, promo],
      { now, timezone: tz },
    );
    expect(res.totalToday).toBe(4);
    expect(res.categories.important.threads.map((t) => t.id)).toEqual(
      expect.arrayContaining(['e1', 'e2', 'e3', 'e9']),
    );
    expect(res.categories.waiting_for_user.threads.map((t) => t.id)).toEqual(
      expect.arrayContaining(['e1', 'e2']),
    );
    expect(res.categories.waiting_for_other.threads.map((t) => t.id)).toEqual(['e4']);
    expect(res.categories.has_deadline.threads.map((t) => t.id)).toEqual(
      expect.arrayContaining(['e1', 'e2', 'e3']),
    );
    expect(res.categories.low_priority.threads.map((t) => t.id)).toEqual(['ea']);
    expect(res.categories.information.threads.map((t) => t.id)).toEqual(['e5']);
    expect(res.categories.important.count).toBe(res.categories.important.threads.length);
    expect(res.needsAttention).toBe(4);
  });
});
