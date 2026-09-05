import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Commitment, TaskItem } from '@da/domain';
import {
  GoogleRoutesProvider,
  buildPlanDay,
  createRoutesProvider,
  detectBackToBack,
  detectConflicts,
  formatDuration,
  freeBlocks,
  leaveByTime,
  resolveCalendarWrite,
  resolveConflictOptions,
  scheduleSuggestions,
  suggestPrepTime,
  type RoutesProvider,
} from './index';
import { zonedTimeToUtc } from '../util';

const tz = 'Europe/Istanbul';
const today = '2026-09-05';
const tomorrow = '2026-09-06';
const now = zonedTimeToUtc(today, '08:42', tz);
const at = (date: string, hhmm: string): string => zonedTimeToUtc(date, hhmm, tz);

let seq = 0;
function event(partial: Partial<CalendarEvent> & { title: string; startAt: string; endAt: string }): CalendarEvent {
  seq += 1;
  return {
    id: partial.id ?? `ev-${seq}`,
    userId: 'u1',
    accountId: 'acc-1',
    externalEventId: partial.externalEventId ?? `ext-${seq}`,
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

function task(partial: Partial<TaskItem> & { title: string }): TaskItem {
  seq += 1;
  return {
    id: partial.id ?? `task-${seq}`,
    userId: 'u1',
    dueAt: null,
    status: 'open',
    completedAt: null,
    source: null,
    provider: 'internal',
    scheduledStartAt: null,
    scheduledEndAt: null,
    priority: 'normal',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function commitment(partial: Partial<Commitment> & { text: string }): Commitment {
  seq += 1;
  return {
    id: partial.id ?? `cm-${seq}`,
    userId: 'u1',
    direction: 'user_owes',
    status: 'open',
    source: { type: 'meeting_note', id: 'n1', label: 'Toplantı notu', timestamp: now },
    confidence: 0.9,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const mehmet = { name: 'Mehmet Yılmaz', email: 'mehmet@musteri.com', isOrganizer: false, responseStatus: 'accepted' as const };
const me = { name: 'Yunus Emre', email: 'yunus@example.com', isOrganizer: true, responseStatus: 'accepted' as const };

describe('calendar · conflicts and back-to-back', () => {
  it('detects overlaps in minutes and skips all-day, cancelled and declined events', () => {
    const a = event({ id: 'a', title: 'Müşteri toplantısı · Demir A.Ş.', startAt: at(today, '14:00'), endAt: at(today, '15:00') });
    const b = event({ id: 'b', title: 'Doktor randevusu', startAt: at(today, '14:30'), endAt: at(today, '15:15') });
    const allDay = event({ id: 'c', title: 'Tatil', startAt: at(today, '00:00'), endAt: at(tomorrow, '00:00'), allDay: true });
    const cancelled = event({ id: 'd', title: 'İptal', startAt: at(today, '14:00'), endAt: at(today, '16:00'), status: 'cancelled' });
    const declined = event({
      id: 'e',
      title: 'Reddedilen',
      startAt: at(today, '14:00'),
      endAt: at(today, '16:00'),
      organizerIsUser: false,
      attendees: [{ ...me, isOrganizer: false, responseStatus: 'declined' }],
    });
    const conflicts = detectConflicts([b, a, allDay, cancelled, declined], { userEmail: 'yunus@example.com' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ id: 'conflict:a:b', overlapMinutes: 30, status: 'open' });
    expect(conflicts[0]?.eventA.id).toBe('a');
    expect(conflicts[0]?.eventB.id).toBe('b');
  });
  it('does not report the same event mirrored from two calendars', () => {
    const a = event({ id: 'a', title: 'Haftalık ekip', startAt: at(today, '09:00'), endAt: at(today, '10:00'), externalEventId: 'x' });
    const b = event({ id: 'b', title: 'Haftalık ekip', startAt: at(today, '09:00'), endAt: at(today, '10:00'), externalEventId: 'x' });
    expect(detectConflicts([a, b])).toHaveLength(0);
  });
  it('flags back-to-back meetings with less than the minimum gap', () => {
    const a = event({ id: 'a', title: 'A', startAt: at(today, '09:00'), endAt: at(today, '10:00') });
    const b = event({ id: 'b', title: 'B', startAt: at(today, '10:00'), endAt: at(today, '10:30') });
    const c = event({ id: 'c', title: 'C', startAt: at(today, '10:35'), endAt: at(today, '11:00') });
    const d = event({ id: 'd', title: 'D', startAt: at(today, '11:30'), endAt: at(today, '12:00') });
    const warnings = detectBackToBack([d, c, b, a], { minGapMin: 10 });
    expect(warnings).toEqual([
      { fromEventId: 'a', toEventId: 'b', gapMinutes: 0 },
      { fromEventId: 'b', toEventId: 'c', gapMinutes: 5 },
    ]);
  });
});

describe('calendar · free blocks', () => {
  it('returns gaps inside the working window, respecting minMinutes', () => {
    const events = [
      event({ title: 'Haftalık ekip', startAt: at(today, '09:00'), endAt: at(today, '10:00') }),
      event({ title: 'Ürün', startAt: at(today, '11:00'), endAt: at(today, '11:30') }),
      event({ title: 'Kısa', startAt: at(today, '11:45'), endAt: at(today, '12:00') }),
      event({ title: 'Mehmet', startAt: at(today, '14:30'), endAt: at(today, '15:30') }),
      event({ title: 'Akşam', startAt: at(today, '20:30'), endAt: at(today, '22:30') }),
    ];
    const blocks = freeBlocks(events, { date: today, timezone: tz, dayStart: '09:00', dayEnd: '18:00', minMinutes: 30 });
    expect(blocks.map((b) => [b.startAt, b.endAt, b.minutes])).toEqual([
      [at(today, '10:00'), at(today, '11:00'), 60],
      [at(today, '12:00'), at(today, '14:30'), 150],
      [at(today, '15:30'), at(today, '18:00'), 150],
    ]);
  });
  it('clips to now (rounded up to 5 minutes) and returns the whole window for an empty day', () => {
    const blocks = freeBlocks([], { date: today, timezone: tz, now: at(today, '10:02') });
    expect(blocks).toEqual([{ startAt: at(today, '10:05'), endAt: at(today, '18:00'), minutes: 475 }]);
    expect(freeBlocks([], { date: tomorrow, timezone: tz, now })).toEqual([{ startAt: at(tomorrow, '09:00'), endAt: at(tomorrow, '18:00'), minutes: 540 }]);
  });
  it('formats durations the Turkish way', () => {
    expect(formatDuration(150)).toBe('2,5 saat');
    expect(formatDuration(45)).toBe('45 dk');
    expect(formatDuration(120)).toBe('2 saat');
    expect(formatDuration(100)).toBe('1 saat 40 dk');
    expect(formatDuration(150, 'en')).toBe('2.5 hours');
    expect(formatDuration(60, 'en')).toBe('1 hour');
  });
});

describe('calendar · suggestions', () => {
  it('proposes a prep block right before a meeting when the time is free', () => {
    const meeting = event({ id: 'm', title: 'Mehmet ile müşteri toplantısı', startAt: at(today, '14:30'), endAt: at(today, '15:30'), attendees: [mehmet, me] });
    const blocks = [{ startAt: at(today, '12:00'), endAt: at(today, '14:30'), minutes: 150 }];
    const prep = suggestPrepTime(meeting, blocks, { minutes: 15, timezone: tz });
    expect(prep).toMatchObject({
      id: 'prep:m',
      kind: 'add_prep_time',
      title: 'Mehmet ile müşteri toplantısı öncesi 15 dk hazırlık ayır.',
      detail: '14:15–14:30 arası boş.',
      proposedStartAt: at(today, '14:15'),
      proposedEndAt: at(today, '14:30'),
      targetEventId: 'm',
    });
    expect(suggestPrepTime(meeting, [{ startAt: at(today, '09:00'), endAt: at(today, '10:00'), minutes: 60 }], { timezone: tz })).toBeNull();
    expect(suggestPrepTime(meeting, [], { timezone: tz })).toBeNull();
  });
  it('places an open task into tomorrow’s 2,5 hour gap with the canonical Turkish copy', () => {
    const blocks = [{ startAt: at(tomorrow, '14:00'), endAt: at(tomorrow, '16:30'), minutes: 150 }];
    const out = scheduleSuggestions({
      tasks: [task({ id: 't1', title: 'Teklif hazırlama', dueAt: at('2026-09-07', '18:00'), priority: 'high' })],
      commitments: [],
      freeBlocks: blocks,
      events: [],
      now,
      timezone: tz,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'schedule_task',
      title: 'Yarın 14:00–16:30 arasında 2,5 saat boşluğun var.',
      detail: 'Teklif hazırlama görevini buraya yerleştirebilirim.',
      proposedStartAt: at(tomorrow, '14:00'),
      proposedEndAt: at(tomorrow, '16:30'),
      targetTaskId: 't1',
      targetEventId: null,
    });
    const en = scheduleSuggestions({ tasks: [task({ title: 'Teklif hazırlama' })], commitments: [], freeBlocks: blocks, events: [], now, timezone: tz, locale: 'en' });
    expect(en[0]?.title).toBe('You have 2.5 hours free tomorrow between 14:00–16:30.');
  });
  it('uses promises when there is no task, never re-uses an item and caps the list', () => {
    const blocks = [
      { startAt: at(tomorrow, '10:00'), endAt: at(tomorrow, '11:00'), minutes: 60 },
      { startAt: at(tomorrow, '14:00'), endAt: at(tomorrow, '16:30'), minutes: 150 },
    ];
    const out = scheduleSuggestions({
      tasks: [],
      commitments: [commitment({ id: 'c1', text: "Mehmet'e teklif gönder", dueAt: at(tomorrow, '18:00') }), commitment({ id: 'c2', text: 'Rapor', direction: 'other_owes' })],
      freeBlocks: blocks,
      events: [],
      now,
      timezone: tz,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toBe('“Mehmet\'e teklif gönder” sözünü buraya yerleştirebilirim.');
    expect(out[0]?.targetTaskId).toBeNull();
  });
  it('adds prep for meetings with people and a buffer after back-to-back meetings', () => {
    const a = event({ id: 'a', title: 'Haftalık ekip', startAt: at(today, '09:00'), endAt: at(today, '10:00') });
    const b = event({ id: 'b', title: 'Ürün gözden geçirme', startAt: at(today, '10:00'), endAt: at(today, '10:30') });
    const meeting = event({ id: 'm', title: 'Mehmet ile müşteri toplantısı', startAt: at(today, '14:30'), endAt: at(today, '15:30'), attendees: [mehmet, me] });
    const events = [a, b, meeting];
    const blocks = freeBlocks(events, { date: today, timezone: tz, now });
    const out = scheduleSuggestions({ tasks: [], commitments: [], freeBlocks: blocks, events, now: at(today, '08:00'), timezone: tz });
    const kinds = out.map((s) => s.kind);
    expect(kinds).toContain('add_prep_time');
    expect(kinds).toContain('add_buffer');
    const buffer = out.find((s) => s.kind === 'add_buffer');
    expect(buffer).toMatchObject({ title: '09:00 ve 10:00 toplantıların arka arkaya.', targetEventId: 'b', proposedStartAt: at(today, '10:10'), proposedEndAt: at(today, '10:40') });
    expect(buffer?.detail).toBe("Arada mola yok; Ürün gözden geçirme toplantısını 10:10'a kaydırmayı önerebilirim.");
  });
  it('never proposes a buffer that collides with the next meeting', () => {
    const a = event({ id: 'a', title: 'A', startAt: at(today, '09:00'), endAt: at(today, '10:00') });
    const b = event({ id: 'b', title: 'B', startAt: at(today, '10:00'), endAt: at(today, '10:30') });
    const c = event({ id: 'c', title: 'C', startAt: at(today, '10:35'), endAt: at(today, '11:00') });
    const out = scheduleSuggestions({ tasks: [], commitments: [], freeBlocks: [], events: [a, b, c], now: at(today, '08:00'), timezone: tz });
    expect(out.filter((s) => s.kind === 'add_buffer' && s.targetEventId === 'b')).toHaveLength(0);
  });
});

describe('calendar · conflict options', () => {
  it('recommends moving the event that affects the fewest people, then alternatives, then keep', () => {
    const meeting = event({ id: 'a', title: 'Müşteri toplantısı', startAt: at(today, '14:00'), endAt: at(today, '15:00'), attendees: [mehmet, me], location: 'Ofis' });
    const doctor = event({ id: 'b', title: 'Doktor randevusu', startAt: at(today, '14:30'), endAt: at(today, '15:00'), source: 'apple_calendar' });
    const conflict = detectConflicts([meeting, doctor])[0];
    expect(conflict).toBeDefined();
    if (!conflict) return;
    const blocks = [
      { startAt: at(today, '12:00'), endAt: at(today, '14:00'), minutes: 120 },
      { startAt: at(today, '15:00'), endAt: at(today, '18:00'), minutes: 180 },
    ];
    const options = resolveConflictOptions(conflict, blocks, { timezone: tz, userEmail: 'yunus@example.com' });
    expect(options.map((o) => o.kind)).toEqual(['move_b', 'move_a', 'shorten_a', 'keep']);
    expect(options[0]).toMatchObject({ isRecommended: true, needsFurtherStep: true, icon: 'auto_awesome', title: "“Doktor randevusu” etkinliğini 15:00'e al" });
    expect(options[0]?.subtitle).toBe('Önerilen · 15:00–15:30 boş görünüyor.');
    expect(options[0]?.suggestion).toMatchObject({ kind: 'move_event', targetEventId: 'b', proposedStartAt: at(today, '15:00'), proposedEndAt: at(today, '15:30') });
    expect(options[1]).toMatchObject({ title: "“Müşteri toplantısı” için 12:00'ye öner", subtitle: "Mehmet Yılmaz'a öneri maili taslağı hazırlanır" });
    expect(options[2]).toMatchObject({ title: '“Müşteri toplantısı” etkinliğini 30 dk kısalt', subtitle: '14:00–14:30 · Sonrakine zamanında yetişirsin' });
    expect(options[3]).toMatchObject({ kind: 'keep', title: 'Böyle kalsın', subtitle: 'Bu çakışmayı bir daha gösterme', needsFurtherStep: false, suggestion: null });
    for (const o of options) expect(o.suggestion === null || o.suggestion.kind === 'move_event').toBe(true);
  });
  it('always offers keep, even with no free time, and speaks English', () => {
    const a = event({ id: 'a', title: 'A', startAt: at(today, '14:00'), endAt: at(today, '15:00') });
    const b = event({ id: 'b', title: 'B', startAt: at(today, '14:00'), endAt: at(today, '15:00') });
    const conflict = detectConflicts([a, b])[0];
    if (!conflict) throw new Error('expected conflict');
    const options = resolveConflictOptions(conflict, [], { locale: 'en', timezone: tz });
    expect(options.map((o) => o.kind)).toEqual(['keep']);
    expect(options[0]?.title).toBe('Keep it as is');
  });
});

describe('calendar · routes and leave-by', () => {
  const fetchOk = (json: unknown, status = 200) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = async (url: string, init: RequestInit): Promise<Response> => {
      calls.push({ url, init });
      return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
    };
    return { fetchFn, calls };
  };
  it('calls the Routes API with a field mask and parses durations', async () => {
    const { fetchFn, calls } = fetchOk({ routes: [{ duration: '2280s', distanceMeters: 12450 }] });
    const provider = new GoogleRoutesProvider(fetchFn, 'key-1');
    const est = await provider.computeRoute({ origin: 'Kadıköy', destination: 'Nişantaşı' });
    expect(est).toEqual({ durationMinutes: 38, distanceMeters: 12450, provider: 'google_routes' });
    expect(calls[0]?.url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('key-1');
    expect(headers['X-Goog-FieldMask']).toContain('routes.duration');
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ origin: { address: 'Kadıköy' }, destination: { address: 'Nişantaşı' }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' });
  });
  it('returns null without routes and throws AppError on provider errors', async () => {
    const none = new GoogleRoutesProvider(fetchOk({ routes: [] }).fetchFn, 'k');
    expect(await none.computeRoute({ origin: 'A', destination: 'B' })).toBeNull();
    const failing = new GoogleRoutesProvider(fetchOk({ error: 'x' }, 500).fetchFn, 'k');
    await expect(failing.computeRoute({ origin: 'A', destination: 'B' })).rejects.toMatchObject({ code: 'provider_unavailable' });
  });
  it('createRoutesProvider returns null for none / missing key', () => {
    expect(createRoutesProvider({ provider: 'none', apiKey: 'x' })).toBeNull();
    expect(createRoutesProvider({ provider: 'google', apiKey: '' })).toBeNull();
    expect(createRoutesProvider({ provider: 'google', apiKey: 'k', fetch: fetchOk({}).fetchFn })?.name).toBe('google_routes');
  });
  it('leaveByTime subtracts travel and buffer; null without location, origin or provider', async () => {
    const provider: RoutesProvider = { name: 'stub', computeRoute: async () => ({ durationMinutes: 38, distanceMeters: null, provider: 'stub' }) };
    const doctor = event({ title: 'Doktor randevusu', startAt: at(today, '13:30'), endAt: at(today, '14:00'), location: 'Nişantaşı' });
    const leave = await leaveByTime(doctor, provider, { origin: 'Kadıköy', bufferMinutes: 2 });
    expect(leave).toEqual({ leaveAt: at(today, '12:50'), arriveBy: at(today, '13:28'), durationMin: 38, provider: 'stub' });
    expect(await leaveByTime(doctor, null, { origin: 'Kadıköy' })).toBeNull();
    expect(await leaveByTime(doctor, provider, { origin: null })).toBeNull();
    expect(await leaveByTime(event({ title: 'Online', startAt: at(today, '13:30'), endAt: at(today, '14:00'), location: 'Online', meetingUrl: 'https://meet.google.com/x' }), provider, { origin: 'Ev' })).toBeNull();
    const failing: RoutesProvider = { name: 'f', computeRoute: async () => Promise.reject(new Error('down')) };
    expect(await leaveByTime(doctor, failing, { origin: 'Ev' })).toBeNull();
  });
});

describe('calendar · writes and plan day', () => {
  it('resolveCalendarWrite detects remote changes', () => {
    expect(resolveCalendarWrite({ expectedProviderUpdatedAt: '2026-09-01T10:00:00Z', remoteProviderUpdatedAt: '2026-09-01T10:00:00Z' })).toBe('apply');
    expect(resolveCalendarWrite({ expectedProviderUpdatedAt: '2026-09-01T10:00:00Z', remoteProviderUpdatedAt: '2026-09-02T10:00:00Z' })).toBe('conflict');
    expect(resolveCalendarWrite({ expectedProviderUpdatedAt: '2026-09-02T10:00:00Z', remoteProviderUpdatedAt: '2026-09-01T10:00:00Z' })).toBe('apply');
    expect(resolveCalendarWrite({ expectedProviderUpdatedAt: null, remoteProviderUpdatedAt: '2026-09-02T10:00:00Z' })).toBe('apply');
    expect(resolveCalendarWrite({})).toBe('apply');
  });
  it('buildPlanDay filters everything to the local date and computes blocks and warnings', () => {
    const a = event({ id: 'a', title: 'Haftalık ekip', startAt: at(today, '09:00'), endAt: at(today, '10:00') });
    const b = event({ id: 'b', title: 'Ürün gözden geçirme', startAt: at(today, '10:00'), endAt: at(today, '10:30') });
    const other = event({ id: 'o', title: 'Yarın', startAt: at(tomorrow, '09:00'), endAt: at(tomorrow, '10:00') });
    const cancelled = event({ id: 'x', title: 'İptal', startAt: at(today, '12:00'), endAt: at(today, '13:00'), status: 'cancelled' });
    const t1 = task({ id: 't1', title: 'Teklif hazırlama', dueAt: at(today, '18:00') });
    const t2 = task({ id: 't2', title: 'Sonra', dueAt: at(tomorrow, '18:00') });
    const c1 = commitment({ id: 'c1', text: "Selin'e sözleşme yorumu", dueAt: at(today, '12:00') });
    const conflict = detectConflicts([a, event({ id: 'z', title: 'Z', startAt: at(today, '09:30'), endAt: at(today, '09:45') })])[0];
    const day = buildPlanDay({
      date: today,
      timezone: tz,
      events: [other, b, a, cancelled],
      tasks: [t1, t2],
      commitments: [c1],
      suggestions: [{ id: 's', kind: 'schedule_task', title: 't', detail: 'd', proposedStartAt: at(tomorrow, '14:00'), proposedEndAt: at(tomorrow, '16:30'), reason: 'r' }],
      conflicts: conflict ? [conflict] : [],
    });
    expect(day.date).toBe(today);
    expect(day.events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(day.tasks.map((t) => t.id)).toEqual(['t1']);
    expect(day.commitments.map((c) => c.id)).toEqual(['c1']);
    expect(day.suggestions).toHaveLength(0);
    expect(day.conflicts).toHaveLength(1);
    expect(day.backToBackWarnings).toEqual([{ fromEventId: 'a', toEventId: 'b' }]);
    expect(day.freeBlocks[0]).toEqual({ startAt: at(today, '10:30'), endAt: at(today, '18:00'), minutes: 450 });
  });
});
