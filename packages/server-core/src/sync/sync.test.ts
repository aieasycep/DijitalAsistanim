import type { CalendarEvent, EmailThread, SyncState } from '@da/domain';
import { describe, expect, it } from 'vitest';
import type { CalendarEventDraft, EmailMessageDraft } from '../providers/types';
import {
  applyCalendarDelta,
  backoffMinutes,
  dedupeMessages,
  detectChangedEvents,
  estimateRemainingSeconds,
  groupIntoThreads,
  initialAnalysisWindow,
  isSyncDue,
  mergeThreadUpdate,
  needsSubscription,
  nextBackfillWindow,
  nextStep,
  nextSyncAt,
  normalizeSubject,
  pollIntervalMinutes,
  progressFrom,
  selectDueStates,
  subscriptionRenewalDue,
  threadKeyFor,
} from './index';

const NOW = '2026-09-05T08:00:00.000Z';

function minutesAgo(minutes: number, now = NOW): string {
  return new Date(Date.parse(now) - minutes * 60_000).toISOString();
}

function state(overrides: Partial<SyncState> = {}): SyncState {
  return {
    id: `state-${Math.random().toString(36).slice(2, 8)}`,
    userId: 'user-1',
    accountId: 'acc-1',
    resource: 'mail',
    cursor: null,
    subscriptionId: null,
    subscriptionExpiresAt: null,
    mode: 'polling',
    lastRunAt: null,
    lastSuccessAt: null,
    backfillUntil: null,
    errorCount: 0,
    lastError: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function message(overrides: Partial<EmailMessageDraft> = {}): EmailMessageDraft {
  const sentAt = overrides.sentAt ?? NOW;
  return {
    externalMessageId: `m-${Math.random().toString(36).slice(2, 8)}`,
    externalThreadId: '',
    from: { name: 'Ahmet Yılmaz', email: 'ahmet@example.com' },
    to: [{ name: 'Ayşe Demir', email: 'ayse@example.com' }],
    cc: [],
    bcc: [],
    subject: 'Teklif',
    snippet: 'Merhaba',
    bodyText: 'Merhaba',
    sentAt,
    receivedAt: overrides.receivedAt ?? sentAt,
    isFromUser: false,
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    attachments: [],
    labels: ['INBOX'],
    webUrl: null,
    rfcMessageId: null,
    inReplyTo: null,
    references: [],
    ...overrides,
  };
}

function eventDraft(overrides: Partial<CalendarEventDraft> = {}): CalendarEventDraft {
  return {
    externalEventId: 'evt-1',
    calendarId: 'primary',
    title: 'Planlama',
    description: null,
    location: null,
    meetingUrl: null,
    meetingProvider: null,
    startAt: '2026-09-08T07:00:00.000Z',
    endAt: '2026-09-08T08:00:00.000Z',
    allDay: false,
    attendees: [
      {
        name: 'Ahmet',
        email: 'ahmet@example.com',
        contactId: null,
        isOrganizer: true,
        responseStatus: 'accepted',
      },
    ],
    organizerIsUser: false,
    status: 'confirmed',
    providerUpdatedAt: '2026-09-02T00:00:00.000Z',
    source: 'google_calendar',
    isAiCreated: false,
    webUrl: null,
    recurringEventId: null,
    ...overrides,
  };
}

function storedEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const { webUrl: _webUrl, recurringEventId: _recurring, ...draft } = eventDraft();
  return {
    ...draft,
    id: 'row-1',
    userId: 'user-1',
    accountId: 'acc-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function storedThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: 'thread-row',
    userId: 'user-1',
    accountId: 'acc-1',
    externalThreadId: 't-1',
    subject: 'Teklif',
    snippet: 'Merhaba',
    participants: [{ name: 'Ahmet Yılmaz', email: 'ahmet@example.com' }],
    lastMessageAt: minutesAgo(60),
    messageCount: 1,
    lastFromUser: false,
    isRead: true,
    labels: ['INBOX'],
    importance: 'normal',
    category: 'information',
    priorityScore: 0,
    priorityReasons: [],
    triage: 'rules',
    fingerprint: 'fp',
    userDismissed: false,
    userMarkedDone: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('sync/schedule', () => {
  it('backs off exponentially and caps at six hours', () => {
    expect([0, 1, 2, 3, 4, 5, 8, 9, 20].map(backoffMinutes)).toEqual([
      0, 2, 4, 8, 16, 32, 256, 360, 360,
    ]);
  });

  it('uses plan and mode specific poll intervals', () => {
    expect(pollIntervalMinutes('mail', { isPro: false })).toBe(15);
    expect(pollIntervalMinutes('calendar', { isPro: false })).toBe(30);
    expect(pollIntervalMinutes('tasks', { isPro: false })).toBe(60);
    expect(pollIntervalMinutes('mail', { isPro: true })).toBe(5);
    expect(pollIntervalMinutes('calendar', { isPro: true })).toBe(10);
    expect(pollIntervalMinutes('tasks', { isPro: true })).toBe(30);
    expect(pollIntervalMinutes('mail', { isPro: true, mode: 'webhook' })).toBe(360);
  });

  it('decides due states from the last run, plan, mode and backoff', () => {
    expect(isSyncDue(state(), { now: NOW, isPro: false })).toBe(true);
    expect(isSyncDue(state({ lastRunAt: minutesAgo(14) }), { now: NOW, isPro: false })).toBe(false);
    expect(isSyncDue(state({ lastRunAt: minutesAgo(15) }), { now: NOW, isPro: false })).toBe(true);
    expect(isSyncDue(state({ lastRunAt: minutesAgo(6) }), { now: NOW, isPro: true })).toBe(true);
    expect(
      isSyncDue(state({ lastRunAt: minutesAgo(6), mode: 'webhook' }), { now: NOW, isPro: true }),
    ).toBe(false);
    expect(
      isSyncDue(state({ lastRunAt: minutesAgo(20), errorCount: 5 }), { now: NOW, isPro: false }),
    ).toBe(false);
    expect(
      isSyncDue(state({ lastRunAt: minutesAgo(32), errorCount: 5 }), { now: NOW, isPro: false }),
    ).toBe(true);
    expect(nextSyncAt(state({ lastRunAt: minutesAgo(10) }), { now: NOW, isPro: false })).toBe(
      minutesAgo(-5),
    );
    expect(nextSyncAt(state({ lastRunAt: 'garbage' }), { now: NOW, isPro: false })).toBe(NOW);
  });

  it('serves due states round-robin across users, stalest first', () => {
    const states = [
      state({ id: 'a-mail', userId: 'A', resource: 'mail', lastRunAt: minutesAgo(120) }),
      state({ id: 'a-cal', userId: 'A', resource: 'calendar', lastRunAt: minutesAgo(120) }),
      state({ id: 'a-tasks', userId: 'A', resource: 'tasks', lastRunAt: minutesAgo(200) }),
      state({ id: 'b-mail', userId: 'B', resource: 'mail', lastRunAt: minutesAgo(3) }),
      state({ id: 'b-cal', userId: 'B', resource: 'calendar', lastRunAt: null }),
      state({ id: 'c-mail', userId: 'C', resource: 'mail', lastRunAt: minutesAgo(30) }),
    ];
    const isProByUser = (userId: string) => userId === 'B';
    const picked = selectDueStates(states, { now: NOW, isProByUser, limit: 4 }).map((s) => s.id);
    // B's never-run state is the stalest, then A (200 min), then C; B's mail (3 min, pro) is not due.
    expect(picked).toEqual(['b-cal', 'a-tasks', 'c-mail', 'a-mail']);
    expect(selectDueStates(states, { now: NOW, isProByUser }).map((s) => s.id)).toEqual([
      'b-cal',
      'a-tasks',
      'c-mail',
      'a-mail',
      'a-cal',
    ]);
    expect(selectDueStates(states, { now: NOW, isProByUser, limit: 0 })).toEqual([]);
  });

  it('tracks webhook subscription lifecycle', () => {
    expect(needsSubscription(state({ mode: 'webhook' }))).toBe(true);
    expect(needsSubscription(state({ mode: 'webhook', subscriptionId: 'sub' }))).toBe(false);
    expect(needsSubscription(state({ mode: 'polling' }))).toBe(false);
    const soon = state({
      mode: 'webhook',
      subscriptionId: 'sub',
      subscriptionExpiresAt: minutesAgo(-600),
    });
    expect(subscriptionRenewalDue(soon, NOW)).toBe(true);
    expect(subscriptionRenewalDue(soon, NOW, 60)).toBe(false);
    expect(subscriptionRenewalDue(state({ mode: 'webhook', subscriptionId: 'sub' }), NOW)).toBe(
      true,
    );
    expect(subscriptionRenewalDue(state({ mode: 'polling', subscriptionId: 'sub' }), NOW)).toBe(
      false,
    );
  });

  it('walks backfill windows back to the horizon', () => {
    const first = nextBackfillWindow({
      now: NOW,
      backfillUntil: null,
      horizonDays: 20,
      stepDays: 7,
    });
    expect(first).toEqual({ since: '2026-08-29T08:00:00.000Z', until: NOW, isLast: false });
    const second = nextBackfillWindow({
      now: NOW,
      backfillUntil: first?.since,
      horizonDays: 20,
      stepDays: 7,
    });
    expect(second).toEqual({
      since: '2026-08-22T08:00:00.000Z',
      until: '2026-08-29T08:00:00.000Z',
      isLast: false,
    });
    const third = nextBackfillWindow({
      now: NOW,
      backfillUntil: second?.since,
      horizonDays: 20,
      stepDays: 7,
    });
    expect(third).toEqual({
      since: '2026-08-16T08:00:00.000Z',
      until: '2026-08-22T08:00:00.000Z',
      isLast: true,
    });
    expect(
      nextBackfillWindow({ now: NOW, backfillUntil: third?.since, horizonDays: 20, stepDays: 7 }),
    ).toBeNull();
  });
});

describe('sync/merge', () => {
  it('normalises Turkish and English reply prefixes', () => {
    expect(normalizeSubject('Ynt: Re: FW: İlt: Teklif dosyası')).toBe('teklif dosyası');
    expect(normalizeSubject('RE[2]: Fwd:  Toplantı   notları')).toBe('toplantı notları');
    expect(normalizeSubject('ILT: Fatura')).toBe('fatura');
    expect(normalizeSubject('Yanıt: Cevap: Plan')).toBe('plan');
    expect(normalizeSubject('Rehber güncellemesi')).toBe('rehber güncellemesi');
  });

  it('groups by external thread id, falling back to subject + participants', () => {
    const messages = [
      message({
        externalMessageId: '1',
        externalThreadId: 't-1',
        subject: 'Teklif',
        sentAt: minutesAgo(60),
        isRead: true,
      }),
      message({
        externalMessageId: '2',
        externalThreadId: 't-1',
        subject: 'Ynt: Teklif',
        sentAt: minutesAgo(10),
        isRead: false,
        isFromUser: true,
        from: { name: 'Ayşe', email: 'ayse@example.com' },
        to: [{ name: null, email: 'ahmet@example.com' }],
        hasAttachments: true,
        snippet: 'Ekte.',
      }),
      message({ externalMessageId: '3', subject: 'Toplantı', sentAt: minutesAgo(50) }),
      message({
        externalMessageId: '4',
        subject: 'Ynt: toplantı',
        sentAt: minutesAgo(5),
        from: { name: null, email: 'ayse@example.com' },
        to: [{ name: 'Ahmet Yılmaz', email: 'ahmet@example.com' }],
      }),
      message({
        externalMessageId: '5',
        subject: 'Toplantı',
        sentAt: minutesAgo(1),
        to: [{ name: null, email: 'selin@example.com' }],
      }),
      message({
        externalMessageId: '2',
        externalThreadId: 't-1',
        subject: 'Ynt: Teklif',
        sentAt: minutesAgo(10),
      }),
    ];
    const threads = groupIntoThreads(messages);
    expect(threads.map((t) => t.externalMessageIds)).toEqual([['5'], ['3', '4'], ['1', '2']]);
    const teklif = threads.find((t) => t.externalThreadId === 't-1');
    expect(teklif).toMatchObject({
      subject: 'Teklif',
      snippet: 'Ekte.',
      messageCount: 2,
      unreadCount: 1,
      isRead: false,
      lastFromUser: true,
      hasAttachments: true,
      firstMessageAt: minutesAgo(60),
      lastMessageAt: minutesAgo(10),
    });
    expect(teklif?.participants.map((p) => p.email).sort()).toEqual([
      'ahmet@example.com',
      'ayse@example.com',
    ]);
    expect(teklif?.participants.find((p) => p.email === 'ayse@example.com')?.name).toBe(
      'Ayşe Demir',
    );
    const toplanti = threads.find((t) => t.externalMessageIds.includes('3'));
    expect(toplanti?.externalThreadId).toBe(threadKeyFor(message({ subject: 'Toplantı' })));
    expect(toplanti?.externalThreadId).toBe('toplantı|ahmet@example.com,ayse@example.com');
  });

  it('dedupes messages preferring bodies and newer copies', () => {
    const deduped = dedupeMessages([
      message({ externalMessageId: 'x', bodyText: null, sentAt: minutesAgo(5) }),
      message({ externalMessageId: 'x', bodyText: 'Gövde', sentAt: minutesAgo(5) }),
      message({ externalMessageId: 'y', bodyText: null, snippet: 'old', sentAt: minutesAgo(5) }),
      message({ externalMessageId: 'y', bodyText: null, snippet: 'new', sentAt: minutesAgo(1) }),
    ]);
    expect(deduped.map((m) => [m.externalMessageId, m.bodyText ?? m.snippet])).toEqual([
      ['x', 'Gövde'],
      ['y', 'new'],
    ]);
  });

  it('patches threads only with what changed and resurfaces done threads', () => {
    const existing = storedThread();
    const [incoming] = groupIntoThreads([
      message({ externalMessageId: '1', externalThreadId: 't-1', sentAt: minutesAgo(60) }),
      message({
        externalMessageId: '2',
        externalThreadId: 't-1',
        sentAt: minutesAgo(2),
        isRead: false,
        snippet: 'Yeni yanıt',
        labels: ['INBOX', 'IMPORTANT'],
        cc: [{ name: 'Selin', email: 'selin@example.com' }],
      }),
    ]);
    const patch = mergeThreadUpdate(existing, incoming as NonNullable<typeof incoming>, {
      addedMessages: 1,
    });
    expect(patch).toEqual({
      participants: expect.arrayContaining([
        { name: 'Ahmet Yılmaz', email: 'ahmet@example.com' },
        { name: 'Ayşe Demir', email: 'ayse@example.com' },
        { name: 'Selin', email: 'selin@example.com' },
      ]) as unknown,
      labels: ['INBOX', 'IMPORTANT'],
      messageCount: 2,
      lastMessageAt: minutesAgo(2),
      snippet: 'Yeni yanıt',
      isRead: false,
      userMarkedDone: false,
    });
    const [unchanged] = groupIntoThreads([
      message({ externalMessageId: '1', externalThreadId: 't-1', sentAt: minutesAgo(60), to: [] }),
    ]);
    expect(mergeThreadUpdate(existing, unchanged as NonNullable<typeof unchanged>)).toEqual({});
  });

  it('applies calendar deltas as upserts and deletes', () => {
    const stored = [
      storedEvent({
        id: 'row-1',
        externalEventId: 'evt-1',
        providerUpdatedAt: '2026-09-03T00:00:00.000Z',
      }),
      storedEvent({
        id: 'row-2',
        externalEventId: 'evt-2',
        providerUpdatedAt: '2026-09-01T00:00:00.000Z',
      }),
      storedEvent({ id: 'row-3', externalEventId: 'evt-3' }),
      storedEvent({ id: 'row-4', externalEventId: 'evt-4', deletedAt: NOW }),
    ];
    const result = applyCalendarDelta(stored, {
      events: [
        eventDraft({ externalEventId: 'evt-1', providerUpdatedAt: '2026-09-02T00:00:00.000Z' }),
        eventDraft({
          externalEventId: 'evt-2',
          providerUpdatedAt: '2026-09-04T00:00:00.000Z',
          title: 'Güncel',
        }),
        eventDraft({ externalEventId: 'evt-3', status: 'cancelled' }),
        eventDraft({ externalEventId: 'evt-new' }),
      ],
      deletedExternalIds: ['evt-4', 'evt-unknown', 'evt-3'],
    });
    expect(result.unchanged).toEqual(['evt-1']);
    expect(result.upserts.map((e) => e.externalEventId)).toEqual(['evt-2', 'evt-new']);
    expect(result.deletes).toEqual([{ id: 'row-3', externalEventId: 'evt-3' }]);
  });

  it('detects moved, cancelled and newly invited events', () => {
    const prev = [
      storedEvent({ externalEventId: 'evt-1' }),
      storedEvent({ externalEventId: 'evt-2', title: 'Eski başlık' }),
      storedEvent({ externalEventId: 'evt-3' }),
      storedEvent({ externalEventId: 'evt-4' }),
    ];
    const next = [
      eventDraft({
        externalEventId: 'evt-1',
        startAt: '2026-09-08T09:00:00.000Z',
        endAt: '2026-09-08T10:00:00.000Z',
      }),
      eventDraft({ externalEventId: 'evt-2', title: 'Yeni başlık' }),
      eventDraft({ externalEventId: 'evt-3', status: 'cancelled' }),
      eventDraft({ externalEventId: 'evt-invite' }),
      eventDraft({ externalEventId: 'evt-mine', organizerIsUser: true }),
    ];
    const changes = detectChangedEvents(prev, next, {
      cancelledExternalIds: ['evt-4', 'evt-missing'],
    });
    expect(changes.moved.map((m) => m.after.externalEventId)).toEqual(['evt-1']);
    expect(changes.updated.map((u) => u.after.externalEventId)).toEqual(['evt-2']);
    expect(changes.cancelled.map((c) => c.externalEventId)).toEqual(['evt-3', 'evt-4']);
    expect(changes.newInvites.map((n) => n.externalEventId)).toEqual(['evt-invite']);
  });
});

describe('sync/initial', () => {
  it('computes the analysis window with provider queries', () => {
    const window = initialAnalysisWindow({ now: NOW });
    expect(window).toEqual({
      since: '2026-09-02T08:00:00.000Z',
      until: NOW,
      windowHours: 72,
      gmailQuery: `after:${Math.floor(Date.parse('2026-09-02T08:00:00.000Z') / 1000)} -in:spam -in:trash -in:chats -category:promotions -category:social`,
      graphFilter: 'receivedDateTime ge 2026-09-02T08:00:00.000Z',
    });
    expect(initialAnalysisWindow({ now: NOW, windowHours: 1 }).windowHours).toBe(24);
    expect(initialAnalysisWindow({ now: NOW, windowHours: 9999 }).windowHours).toBe(336);
  });

  it('walks the progress step machine', () => {
    const base = { counts: { emailsFound: 120, potentialImportant: 7 }, startedAt: NOW, now: NOW };
    expect(progressFrom({ ...base, stages: {} }).step).toBe('scanning');
    expect(progressFrom({ ...base, stages: { mailFetched: true } }).step).toBe('classifying');
    expect(
      progressFrom({ ...base, stages: { mailFetched: true, mailClassified: true } }).step,
    ).toBe('calendar');
    expect(
      progressFrom({
        ...base,
        stages: { mailFetched: true, mailClassified: true, calendarSynced: true },
      }).step,
    ).toBe('open_loops');
    const done = progressFrom({
      ...base,
      stages: {
        mailFetched: true,
        mailClassified: true,
        calendarSynced: true,
        openLoopsScanned: true,
      },
    });
    expect(done).toEqual({
      step: 'done',
      emailsFound: 120,
      potentialImportant: 7,
      upcomingEvents: 0,
      possibleFollowUps: 0,
      startedAt: NOW,
      completedAt: NOW,
      windowHours: 72,
      error: null,
    });
    const failed = progressFrom({
      ...base,
      stages: { mailFetched: true },
      error: 'provider_unavailable',
    });
    expect(failed.step).toBe('failed');
    expect(failed.completedAt).toBe(NOW);
    expect(nextStep('scanning')).toBe('classifying');
    expect(nextStep('open_loops')).toBe('done');
    expect(nextStep('done')).toBeNull();
  });

  it('estimates remaining seconds from the step and mail volume', () => {
    expect(
      estimateRemainingSeconds({ step: 'scanning', emailsFound: 0, startedAt: NOW }, NOW),
    ).toBe(30);
    expect(
      estimateRemainingSeconds({ step: 'scanning', emailsFound: 200, startedAt: NOW }, NOW),
    ).toBe(65);
    expect(
      estimateRemainingSeconds(
        { step: 'classifying', emailsFound: 200, startedAt: NOW },
        minutesAgo(-0.5),
      ),
    ).toBe(35);
    expect(
      estimateRemainingSeconds(
        { step: 'open_loops', emailsFound: 200, startedAt: NOW },
        minutesAgo(-10),
      ),
    ).toBe(0);
    expect(estimateRemainingSeconds({ step: 'done', emailsFound: 200, startedAt: NOW }, NOW)).toBe(
      0,
    );
  });
});
