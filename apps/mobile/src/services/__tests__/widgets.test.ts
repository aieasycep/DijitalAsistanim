import type { Briefing, Insight, TodayFeed } from '@da/domain';

jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('@/lib/env', () => ({
  env: {
    appScheme: 'dijitalasistan',
    appVersion: '1.0.0',
    isProduction: false,
    universalHosts: ['dijitalasistan.app'],
    webUrl: 'https://dijitalasistan.app',
  },
  IS_PRODUCTION: false,
  hasSupabase: false,
  isDemoMode: true,
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));
jest.mock('@/services/notifications', () => ({ currentLockScreenPrivacy: () => 'full' }));

const mockHandles: Record<
  string,
  { updateTimeline: jest.Mock; updateSnapshot: jest.Mock; reload: jest.Mock }
> = {};
jest.mock('expo-widgets', () => ({
  createWidget: (name: string) => {
    const handle = { updateTimeline: jest.fn(), updateSnapshot: jest.fn(), reload: jest.fn() };
    mockHandles[name] = handle;
    return handle;
  },
}));
jest.mock('@expo/ui/swift-ui', () => ({
  AccessoryWidgetBackground: jest.fn(),
  HStack: jest.fn(),
  Image: jest.fn(),
  Link: jest.fn(),
  Spacer: jest.fn(),
  Text: jest.fn(),
  VStack: jest.fn(),
  ZStack: jest.fn(),
}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  background: jest.fn(),
  clipShape: jest.fn(),
  containerBackground: jest.fn(),
  font: jest.fn(),
  foregroundStyle: jest.fn(),
  frame: jest.fn(),
  kerning: jest.fn(),
  lineLimit: jest.fn(),
  opacity: jest.fn(),
  padding: jest.fn(),
  widgetURL: jest.fn(),
}));

import {
  buildSnapshotTimeline,
  buildWidgetSnapshot,
  deepLinkForInsight,
  readWidgetSnapshot,
  snapshotToDailyBriefProps,
  snapshotToNextImportantProps,
  snapshotToTodayPrioritiesProps,
  syncWidgetsFromToday,
  syncWidgetsSignedOut,
} from '@/services/widgets';

const NOW = new Date('2030-09-05T06:00:00Z'); // 09:00 Istanbul
const CTX = { timezone: 'Europe/Istanbul', locale: 'tr' as const, now: NOW };

let seq = 0;
function insight(overrides: Partial<Insight>): Insight {
  seq += 1;
  return {
    id: `ins-${seq}`,
    userId: 'u1',
    createdAt: '2030-09-05T05:00:00Z',
    updatedAt: '2030-09-05T05:00:00Z',
    kind: 'priority',
    badge: 'urgent',
    title: `Insight ${seq}`,
    subtitle: null,
    reason: null,
    importance: 'high',
    priorityScore: 90,
    priorityReasons: [],
    timeLabel: null,
    dueAt: null,
    status: 'active',
    snoozedUntil: null,
    source: {
      type: 'gmail',
      id: `msg-${seq}`,
      label: 'Gmail',
      person: 'Ahmet',
      timestamp: '2030-09-05T05:42:00Z',
    },
    actions: [],
    entityType: 'email_thread',
    entityId: `thread-${seq}`,
    tags: ['important'],
    forDate: '2030-09-05',
    confidence: 0.9,
    isLowConfidence: false,
    dedupeKey: `priority:thread-${seq}`,
    ...overrides,
  };
}

const briefing: Briefing = {
  id: 'brief-1',
  userId: 'u1',
  createdAt: '2030-09-05T04:58:00Z',
  updatedAt: '2030-09-05T04:58:00Z',
  kind: 'morning',
  forDate: '2030-09-05',
  generatedAt: '2030-09-05T04:58:00Z',
  headline: 'Bugün bilmen gereken 5 şey var.',
  highlightNumber: 5,
  subline: '3 önemli mail · 4 etkinlik · 2 takip',
  mood: 'Yoğun ama yönetilebilir bir gün.',
  narrative: 'Sabah teklif, öğleden sonra müşteri toplantısı.',
  counts: {
    importantEmails: 3,
    events: 4,
    followUps: 2,
    deadlines: 1,
    total: 5,
    analyzedEmails: 127,
    analyzedCalendars: 2,
    analyzedDays: 3,
  },
  items: [],
  audio: { provider: 'device_tts', url: null, durationSec: 95, chapters: [], script: '' },
  estimatedReadSec: 120,
  hasChanges: true,
  version: 1,
};

function feed(overrides: Partial<TodayFeed> = {}): TodayFeed {
  return {
    greeting: 'Günaydın, Yunus',
    dateLabel: '5 Eylül Cumartesi',
    briefing: null,
    priorities: [],
    meetings: [],
    deadlines: [],
    lifeEvents: [],
    pendingApprovals: 0,
    isEvening: false,
    lastAnalyzedAt: '2030-09-05T05:58:00Z',
    offline: false,
    ...overrides,
  };
}

function fullFeed(): TodayFeed {
  const p1 = insight({
    id: 'p1',
    title: "Ahmet 17:00'ye kadar revize teklif bekliyor.",
    badge: 'urgent',
    timeLabel: '17:00',
    entityId: 'thread-ahmet',
  });
  const p2 = insight({
    id: 'p2',
    title: 'Mehmet ile müşteri toplantısı',
    badge: 'meeting',
    kind: 'meeting',
    timeLabel: '14:30',
    entityType: 'calendar_event',
    entityId: 'evt-mehmet',
    dueAt: '2030-09-05T11:30:00Z',
  });
  const p3 = insight({
    id: 'p3',
    title: 'Başvuru kapanıyor',
    badge: 'deadline',
    kind: 'deadline',
    timeLabel: '17:00',
  });
  const p4 = insight({
    id: 'p4',
    title: 'Selin · Teklif v2',
    badge: 'follow_up',
    kind: 'follow_up',
    subtitle: '3 gündür yanıt yok',
    entityType: 'follow_up',
    entityId: 'fu-1',
  });
  const done = insight({ id: 'p5', title: 'Tamamlanan iş', status: 'completed' });
  const m1 = insight({
    id: 'm1',
    title: 'Mehmet ile müşteri toplantısı',
    kind: 'meeting',
    badge: 'meeting',
    entityType: 'calendar_event',
    entityId: 'evt-mehmet',
    dueAt: '2030-09-05T11:30:00Z',
    subtitle: 'Hazırlık hazır · 3 konu',
  });
  const m2 = insight({
    id: 'm2',
    title: 'Ekip standup',
    kind: 'meeting',
    badge: 'calendar',
    entityType: 'calendar_event',
    entityId: 'evt-standup',
    dueAt: '2030-09-05T13:00:00Z',
  });
  const past = insight({
    id: 'm0',
    title: 'Sabah kahvesi',
    kind: 'meeting',
    badge: 'calendar',
    entityType: 'calendar_event',
    entityId: 'evt-past',
    dueAt: '2030-09-05T05:00:00Z',
  });
  return feed({
    briefing,
    priorities: [p1, p2, p3, p4, done],
    meetings: [m2, past, m1],
    pendingApprovals: 2,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildWidgetSnapshot', () => {
  it('produces the calm empty state for an empty feed', () => {
    const s = buildWidgetSnapshot(feed(), { signedIn: true, ...CTX });
    expect(s.signedIn).toBe(true);
    expect(s.itemCount).toBe(0);
    expect(s.headline).toBe('Bugün her şey kontrol altında.');
    expect(s.priorities).toEqual([]);
    expect(s.nextEvent).toBeNull();
    expect(s.followUp).toBeNull();
    const next = snapshotToNextImportantProps(s);
    expect(next.item).toBeNull();
    expect(next.inlineLabel).toBe('Her şey kontrol altında');
    expect(next.emptyTitle).toBe('Her şey kontrol altında');
    expect(snapshotToTodayPrioritiesProps(s).header).toBe('BUGÜN · 0 ÖNCELİK');
  });

  it('produces the signed-out state', () => {
    const s = buildWidgetSnapshot(fullFeed(), { signedIn: false, ...CTX });
    expect(s.signedIn).toBe(false);
    expect(s.priorities).toEqual([]);
    expect(snapshotToDailyBriefProps(s).signedOutTitle).toBe('Giriş yapınca burada özet görünür.');
    expect(snapshotToNextImportantProps(s).signedIn).toBe(false);
  });

  it('builds priorities, next event, follow-up and briefing data from a full feed', () => {
    const s = buildWidgetSnapshot(fullFeed(), { signedIn: true, ...CTX });
    expect(s.itemCount).toBe(5);
    expect(s.headline).toBe('Bugün bilmen gereken 5 şey var.');
    expect(s.highlight).toBe(5);
    expect(s.priorities.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(s.priorities[0]).toEqual({
      id: 'p1',
      title: "Ahmet 17:00'ye kadar revize teklif bekliyor.",
      timeLabel: '17:00',
      badge: 'urgent',
      deepLink: 'dijitalasistan://email/thread-ahmet',
    });
    expect(s.priorities[1]?.deepLink).toBe('dijitalasistan://meeting/evt-mehmet/prep');
    expect(s.upcomingEvents.map((e) => e.id)).toEqual(['evt-mehmet', 'evt-standup']);
    expect(s.nextEvent).toEqual({
      id: 'evt-mehmet',
      title: 'Mehmet ile müşteri toplantısı',
      time: '14:30',
      startAt: '2030-09-05T11:30:00Z',
      deepLink: 'dijitalasistan://meeting/evt-mehmet/prep',
      sub: 'Hazırlık hazır · 3 konu',
    });
    expect(s.openFollowUps).toBe(2);
    expect(s.followUp).toEqual({
      title: 'Selin · Teklif v2',
      sub: '3 gündür yanıt yok',
      deepLink: 'dijitalasistan://followups',
    });
    expect(s.pendingApprovals).toBe(2);
    expect(s.briefingKind).toBe('morning');
    expect(s.audioDurationMin).toBe(2);
    expect(s.generatedAtLabel).toBe('07:58');
  });

  it('exposes counts only when lock-screen privacy is generic', () => {
    const s = buildWidgetSnapshot(fullFeed(), { signedIn: true, privacy: 'generic', ...CTX });
    expect(s.privacy).toBe('counts');
    expect(
      s.priorities.every((p) => !p.title.includes('Ahmet') && !p.title.includes('Mehmet')),
    ).toBe(true);
    expect(s.priorities.every((p) => p.deepLink === 'dijitalasistan://today')).toBe(true);
    expect(s.nextEvent?.title).toBe('Sıradaki etkinlik');
    expect(s.nextEvent?.time).toBe('14:30');
    expect(s.followUp?.title).toBe('2 açık takipler');
    expect(s.followUp?.sub).toBeNull();
    expect(snapshotToNextImportantProps(s).item?.badgeLabel).toBeNull();
  });
});

describe('props & timeline', () => {
  it('resolves every label app-side for the three widgets', () => {
    const s = buildWidgetSnapshot(fullFeed(), { signedIn: true, ...CTX });
    const next = snapshotToNextImportantProps(s);
    expect(next.kicker).toBe('SIRADAKİ');
    expect(next.item).toEqual({
      title: "Ahmet 17:00'ye kadar revize teklif bekliyor.",
      badgeLabel: 'ACİL',
      tone: 'critical',
      meta: '17:00',
      deepLink: 'dijitalasistan://email/thread-ahmet',
    });
    expect(next.count).toBe(5);
    expect(next.inlineLabel).toBe('5 önemli konu · 17:00');
    expect(next.circularLabel).toBe('ÖNEMLİ');
    expect(next.rectangular).toEqual({
      kicker: 'SIRADAKİ · 14:30',
      title: 'Mehmet ile müşteri toplantısı',
      sub: 'Hazırlık hazır · 3 konu',
      deepLink: 'dijitalasistan://meeting/evt-mehmet/prep',
    });

    const today = snapshotToTodayPrioritiesProps(s);
    expect(today.header).toBe('BUGÜN · 3 ÖNCELİK');
    expect(today.timeLabel).toBe('07:58');
    expect(today.rows.map((r) => r.tone)).toEqual(['critical', 'neutral', 'warning']);
    expect(today.todayUrl).toBe('dijitalasistan://today');

    const brief = snapshotToDailyBriefProps(s);
    expect(brief.briefKicker).toBe('BRİFİNG');
    expect(brief.headlineBefore).toBe('Bugün bilmen gereken ');
    expect(brief.highlight).toBe('5');
    expect(brief.headlineAfter).toBe(' şey var.');
    expect(brief.listenLabel).toBe('Dinle · 2 dk');
    expect(brief.briefingUrl).toBe('dijitalasistan://briefing/morning?id=brief-1&autoplay=1');
    expect(brief.nextEvent).toEqual({
      hour: '14',
      minute: '30',
      title: 'Mehmet ile müşteri toplantısı',
      sub: 'Hazırlık hazır · 3 konu',
      deepLink: 'dijitalasistan://meeting/evt-mehmet/prep',
    });
    expect(brief.followUp?.title).toBe('Selin · Teklif v2');
    expect(brief.noEventLabel).toBe('Bugün takvimin oldukça sakin.');
  });

  it('rolls the next event over in the timeline', () => {
    const s = buildWidgetSnapshot(fullFeed(), { signedIn: true, ...CTX });
    const timeline = buildSnapshotTimeline(s, NOW);
    expect(timeline).toHaveLength(3);
    expect(timeline[0]?.date).toBe(NOW);
    expect(timeline[0]?.snapshot.nextEvent?.id).toBe('evt-mehmet');
    expect(timeline[1]?.date.toISOString()).toBe('2030-09-05T11:31:00.000Z');
    expect(timeline[1]?.snapshot.nextEvent?.id).toBe('evt-standup');
    expect(timeline[2]?.snapshot.nextEvent).toBeNull();
  });

  it('maps insight entities to contract deep links', () => {
    expect(deepLinkForInsight({ entityType: 'email_thread', entityId: 'x' })).toBe(
      'dijitalasistan://email/x',
    );
    expect(deepLinkForInsight({ entityType: 'calendar_event', entityId: 'x' })).toBe(
      'dijitalasistan://meeting/x/prep',
    );
    expect(deepLinkForInsight({ entityType: 'conflict', entityId: 'x' })).toBe(
      'dijitalasistan://conflict/x',
    );
    expect(deepLinkForInsight({ entityType: 'life_event', entityId: 'x' })).toBe(
      'dijitalasistan://life/x',
    );
    expect(deepLinkForInsight({ entityType: 'suggestion', entityId: 'x' })).toBe(
      'dijitalasistan://today',
    );
  });
});

describe('sync', () => {
  it('persists the snapshot and pushes a timeline to every widget', async () => {
    const s = await syncWidgetsFromToday(fullFeed(), true, CTX);
    expect(readWidgetSnapshot()?.updatedAt).toBe(s.updatedAt);
    for (const name of ['NextImportant', 'TodayPriorities', 'DailyBrief']) {
      const handle = mockHandles[name];
      expect(handle?.updateTimeline).toHaveBeenCalledTimes(1);
      const entries = handle?.updateTimeline.mock.calls[0]?.[0] as {
        date: Date;
        props: { signedIn: boolean };
      }[];
      expect(entries).toHaveLength(3);
      expect(entries[0]?.props.signedIn).toBe(true);
    }
  });

  it('pushes the signed-out snapshot', async () => {
    const s = await syncWidgetsSignedOut();
    expect(s.signedIn).toBe(false);
    const entries = mockHandles.DailyBrief?.updateTimeline.mock.calls[0]?.[0] as {
      props: { signedIn: boolean; signedOutTitle: string };
    }[];
    expect(entries[0]?.props).toMatchObject({
      signedIn: false,
      signedOutTitle: 'Giriş yapınca burada özet görünür.',
    });
  });
});
