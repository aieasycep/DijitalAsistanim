import { describe, expect, it } from 'vitest';
import type { ApprovalAction, ApprovalActionType, ApprovalPayloadMap, ApprovalStatus } from '@da/domain';
import { AppError } from '../errors';
import {
  applyEdit,
  approvalRequiredScope,
  canTransition,
  createApproval,
  expireIfDue,
  isExpired,
  planExecution,
  requiredScopeFor,
  summarizeChange,
  transition,
  type CreateApprovalInput,
} from './index';

const now = '2026-09-04T05:42:00.000Z'; // Friday 08:42 Istanbul
const tz = 'Europe/Istanbul';
const accountId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';

const emailPayload: ApprovalPayloadMap['email_send'] = {
  accountId,
  threadId,
  to: [{ name: 'Ahmet Yılmaz', email: 'ahmet@musteri.com' }],
  cc: [{ name: null, email: 'zeynep@firma.com' }],
  subject: 'Re: Revize teklif',
  bodyText: 'Merhaba Ahmet Bey, revize teklifi ekte iletiyorum.',
  tone: 'professional',
};

function request<T extends ApprovalActionType>(type: T, payload: ApprovalPayloadMap[T], extra: Partial<CreateApprovalInput<T>> = {}): CreateApprovalInput<T> {
  return { type, what: 'Ahmet Yılmaz’a yanıt gönder', why: 'Teklif için dönüş bekliyor', payload, requestedBy: 'email_detail', ...extra };
}

async function pendingEmail(): Promise<ApprovalAction<'email_send'>> {
  return createApproval(request('email_send', emailPayload), { userId: 'u1', now, timezone: tz, provider: 'google' });
}

describe('approvals · state machine', () => {
  it('allows exactly the documented transitions', () => {
    const ok: [ApprovalStatus, ApprovalStatus][] = [
      ['pending', 'approved'],
      ['pending', 'rejected'],
      ['pending', 'expired'],
      ['approved', 'executing'],
      ['executing', 'executed'],
      ['executing', 'failed'],
      ['failed', 'executing'],
    ];
    for (const [from, to] of ok) expect(canTransition(from, to, { attemptCount: 0 })).toBe(true);
    const bad: [ApprovalStatus, ApprovalStatus][] = [
      ['pending', 'executing'],
      ['pending', 'executed'],
      ['approved', 'executed'],
      ['approved', 'rejected'],
      ['executed', 'executing'],
      ['rejected', 'approved'],
      ['expired', 'approved'],
    ];
    for (const [from, to] of bad) expect(canTransition(from, to, { attemptCount: 0 })).toBe(false);
  });

  it('caps retries at 3 attempts', () => {
    expect(canTransition('failed', 'executing', { attemptCount: 2 })).toBe(true);
    expect(canTransition('failed', 'executing', { attemptCount: 3 })).toBe(false);
  });

  it('transition stamps timestamps, counts attempts and throws conflict otherwise', async () => {
    const a = await pendingEmail();
    const approved = transition(a, 'approved', { now: '2026-09-04T06:00:00.000Z' });
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBe('2026-09-04T06:00:00.000Z');
    expect(a.status).toBe('pending');
    const executing = transition(approved, 'executing', { now: '2026-09-04T06:00:01.000Z' });
    expect(executing.attemptCount).toBe(1);
    const failed = transition(executing, 'failed', { now: '2026-09-04T06:00:02.000Z', failureReason: 'provider_unavailable' });
    expect(failed.failureReason).toBe('provider_unavailable');
    const retry = transition(failed, 'executing', { now: '2026-09-04T06:00:03.000Z' });
    expect(retry.attemptCount).toBe(2);
    expect(retry.failureReason).toBeNull();
    const executed = transition(retry, 'executed', { now: '2026-09-04T06:00:04.000Z', executionResult: { messageId: 'gm-1' } });
    expect(executed.executedAt).toBe('2026-09-04T06:00:04.000Z');
    expect(executed.executionResult).toEqual({ messageId: 'gm-1' });

    expect(() => transition(executed, 'executing', { now })).toThrow(AppError);
    try {
      transition(a, 'executed', { now });
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe('conflict');
      expect(err.status).toBe(409);
      expect(err.details).toMatchObject({ from: 'pending', to: 'executed' });
      expect(err.message).toBe('Bu işlem şu anki durumunda yapılamıyor.');
    }
    const exhausted = { ...failed, attemptCount: 3 };
    expect(() => transition(exhausted, 'executing', { now })).toThrow(AppError);
  });

  it('refuses to approve an expired approval and expireIfDue expires it', async () => {
    const a = await pendingEmail();
    const later = '2026-09-07T05:42:00.000Z';
    expect(a.expiresAt).toBe(later);
    expect(isExpired(a, '2026-09-07T05:41:59.000Z')).toBe(false);
    expect(isExpired(a, later)).toBe(true);
    try {
      transition(a, 'approved', { now: later });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as AppError).code).toBe('conflict');
      expect((e as AppError).details).toMatchObject({ reason: 'expired' });
    }
    expect(expireIfDue(a, later).status).toBe('expired');
    expect(expireIfDue(a, now)).toBe(a);
    expect(isExpired({ status: 'executed', expiresAt: a.expiresAt }, later)).toBe(false);
  });
});

describe('approvals · createApproval', () => {
  it('validates, keeps the original payload, computes a stable idempotency key and scope', async () => {
    const a = await pendingEmail();
    expect(a.status).toBe('pending');
    expect(a.userId).toBe('u1');
    expect(a.editedByUser).toBe(false);
    expect(a.originalPayload).toEqual(emailPayload);
    expect(a.originalPayload).not.toBe(a.payload);
    expect(a.idempotencyKey).toMatch(/^approval:email_send:[0-9a-f]{32}$/);
    expect(a.requiredScope).toBe('https://www.googleapis.com/auth/gmail.send');
    expect(a.changeSummary).toEqual(['Kime: Ahmet Yılmaz', 'Bilgi: zeynep@firma.com', 'Konu: Re: Revize teklif']);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);

    const again = await createApproval(request('email_send', { ...emailPayload, bodyText: 'Farklı bir taslak.' }), { userId: 'u1', now, timezone: tz });
    expect(again.idempotencyKey).toBe(a.idempotencyKey);
    const otherUser = await createApproval(request('email_send', emailPayload), { userId: 'u2', now, timezone: tz });
    expect(otherUser.idempotencyKey).not.toBe(a.idempotencyKey);
    const explicit = await createApproval(request('email_send', emailPayload, { idempotencyKey: 'client:abcdef123456' }), { userId: 'u1', now, timezone: tz });
    expect(explicit.idempotencyKey).toBe('client:abcdef123456');
  });

  it('rejects invalid payloads with a validation error listing issues', async () => {
    const bad = { ...emailPayload, to: [] } as unknown as ApprovalPayloadMap['email_send'];
    await expect(createApproval(request('email_send', bad), { userId: 'u1', now, timezone: tz })).rejects.toMatchObject({ code: 'validation', status: 400 });
    const badCal = { accountId, title: 'Toplantı', startAt: '2026-09-05T10:00:00.000Z', endAt: '2026-09-05T09:00:00.000Z' };
    await expect(createApproval(request('calendar_create', badCal), { userId: 'u1', now, timezone: tz })).rejects.toMatchObject({ code: 'validation' });
  });

  it('honours a custom TTL and generates summaries in English when asked', async () => {
    const a = await createApproval(request('email_send', emailPayload), { userId: 'u1', now, timezone: tz, ttlHours: 24, locale: 'en' });
    expect(a.expiresAt).toBe('2026-09-05T05:42:00.000Z');
    expect(a.changeSummary[0]).toBe('To: Ahmet Yılmaz');
    expect(a.changeSummary[2]).toBe('Subject: Re: Revize teklif');
  });
});

describe('approvals · applyEdit', () => {
  it('validates, marks editedByUser and regenerates the summary while keeping the original', async () => {
    const a = await pendingEmail();
    const edited = applyEdit(a, { ...emailPayload, subject: 'Re: Revize teklif (güncel)', cc: [] }, { now: '2026-09-04T06:00:00.000Z', timezone: tz });
    expect(edited.editedByUser).toBe(true);
    expect(edited.payload.subject).toBe('Re: Revize teklif (güncel)');
    expect(edited.originalPayload.subject).toBe('Re: Revize teklif');
    expect(edited.changeSummary).toEqual(['Kime: Ahmet Yılmaz', 'Konu: Re: Revize teklif (güncel)']);
    expect(edited.updatedAt).toBe('2026-09-04T06:00:00.000Z');
  });

  it('refuses edits on non-pending approvals, invalid payloads and account retargeting', async () => {
    const a = await pendingEmail();
    const approved = transition(a, 'approved', { now });
    expect(() => applyEdit(approved, emailPayload, { now, timezone: tz })).toThrow('Yalnızca bekleyen işlemler düzenlenebilir.');
    expect(() => applyEdit(a, { ...emailPayload, subject: '' }, { now, timezone: tz })).toThrow(AppError);
    try {
      applyEdit(a, { ...emailPayload, accountId: '44444444-4444-4444-8444-444444444444' }, { now, timezone: tz });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as AppError).code).toBe('validation');
      expect((e as AppError).details).toMatchObject({ field: 'accountId' });
    }
  });
});

describe('approvals · summarizeChange', () => {
  it('renders calendar creation with relative Turkish day labels and the calendar name', () => {
    const lines = summarizeChange(
      'calendar_create',
      { accountId, title: 'Teklif görüşmesi', startAt: '2026-09-05T06:10:00.000Z', endAt: '2026-09-05T07:00:00.000Z', location: 'Levent ofis', attendees: [{ email: 'ahmet@musteri.com' }, { email: 'zeynep@firma.com' }] },
      { timezone: tz, now, provider: 'google' },
    );
    expect(lines).toEqual(['Başlık: Teklif görüşmesi', 'Ne zaman: Yarın 09:10–10:00', 'Nerede: Levent ofis', 'Katılımcı: 2 kişi', 'Takvim: Google']);
  });

  it('renders all-day events, updates, tasks, reminders and commitments (tr + en)', () => {
    const allDay = summarizeChange('calendar_create', { accountId, title: 'Bayram', startAt: '2026-09-07T00:00:00.000Z', endAt: '2026-09-08T00:00:00.000Z', allDay: true }, { timezone: tz, now, provider: 'device' });
    expect(allDay).toEqual(['Başlık: Bayram', 'Ne zaman: Pazartesi (tüm gün)', 'Takvim: Cihaz takvimi']);

    const update = summarizeChange(
      'calendar_update',
      { accountId, eventId, externalEventId: 'ext-1', changes: { startAt: '2026-09-04T11:00:00.000Z', endAt: '2026-09-04T11:30:00.000Z', location: 'Zoom', description: 'x' } },
      { timezone: tz, now, provider: 'microsoft', locale: 'en' },
    );
    expect(update).toEqual(['New time: Today 14:00–14:30', 'New location: Zoom', 'Description will be updated', 'Calendar: Microsoft']);

    const task = summarizeChange('task_create', { accountId, title: 'Teklifi revize et', dueAt: '2026-09-08T14:00:00.000Z' }, { timezone: tz, now, provider: 'google' });
    expect(task).toEqual(['Görev: Teklifi revize et', 'Son tarih: Salı 17:00', 'Liste: Google Tasks']);
    const internalTask = summarizeChange('task_create', { title: 'Fatura öde' }, { timezone: tz, now });
    expect(internalTask).toEqual(['Görev: Fatura öde', 'Liste: Dijital Asistan']);

    const reminder = summarizeChange('reminder_create', { title: 'Ahmet’i ara', remindAt: '2026-09-04T16:00:00.000Z', option: 'this_evening' }, { timezone: tz, now });
    expect(reminder).toEqual(['Hatırlatıcı: Ahmet’i ara', 'Ne zaman: Bugün 19:00']);

    const commitment = summarizeChange('commitment_create', { text: 'Mehmet’e teklif gönder', direction: 'user_owes', counterpartName: 'Mehmet Kaya', dueText: 'haftaya' }, { timezone: tz, now });
    expect(commitment).toEqual(['Sözün: Mehmet’e teklif gönder', 'Kime: Mehmet Kaya', 'Son tarih: haftaya']);
    const expected = summarizeChange('commitment_create', { text: 'Sözleşme taslağı', direction: 'other_owes', counterpartName: 'Ayşe', dueAt: '2026-09-11T08:00:00.000Z' }, { timezone: tz, now, locale: 'en' });
    expect(expected).toEqual(['Expected: Sözleşme taslağı', 'From: Ayşe', 'Due: 11 September 11:00']);
  });
});

describe('approvals · scopes & execution plans', () => {
  it('maps action types to provider scopes and null for internal or scope-less providers', () => {
    expect(requiredScopeFor('email_send', 'google')).toBe('https://www.googleapis.com/auth/gmail.send');
    expect(approvalRequiredScope('email_send', 'microsoft')).toBe('Mail.Send');
    expect(approvalRequiredScope('calendar_create', 'google')).toBe('https://www.googleapis.com/auth/calendar.events');
    expect(approvalRequiredScope('calendar_update', 'microsoft')).toBe('Calendars.ReadWrite');
    expect(approvalRequiredScope('task_create', 'google')).toBe('https://www.googleapis.com/auth/tasks');
    expect(approvalRequiredScope('task_create', 'microsoft')).toBe('Tasks.ReadWrite');
    expect(approvalRequiredScope('reminder_create', 'google')).toBeNull();
    expect(approvalRequiredScope('commitment_create', 'microsoft')).toBeNull();
    expect(approvalRequiredScope('email_send', 'device')).toBeNull();
    expect(approvalRequiredScope('calendar_create', null)).toBeNull();
  });

  it('plans provider-specific execution for approved actions', async () => {
    const a = transition(await pendingEmail(), 'approved', { now });
    const gmail = planExecution(a, { provider: 'google', kinds: ['email', 'calendar'] }, { now });
    expect(gmail).toMatchObject({ kind: 'gmail_send', approvalId: a.id, idempotencyKey: a.idempotencyKey, requiredScope: 'https://www.googleapis.com/auth/gmail.send' });
    expect(gmail.payload).toBe(a.payload);
    expect(planExecution(a, { provider: 'microsoft', kinds: ['email'] }, { now }).kind).toBe('graph_send');

    const cal = transition(await createApproval(request('calendar_create', { accountId, title: 'Toplantı', startAt: '2026-09-05T06:10:00.000Z', endAt: '2026-09-05T07:00:00.000Z' }), { userId: 'u1', now, timezone: tz }), 'approved', { now });
    expect(planExecution(cal, { provider: 'google', kinds: ['calendar'] }, { now }).kind).toBe('gcal_create');
    expect(planExecution(cal, { provider: 'microsoft', kinds: ['calendar'] }, { now }).kind).toBe('graph_event_create');
    const device = planExecution(cal, { provider: 'device', kinds: ['calendar'] }, { now });
    expect(device).toMatchObject({ kind: 'device_event_create', requiredScope: null });

    const upd = transition(await createApproval(request('calendar_update', { accountId, eventId, externalEventId: 'ext', changes: { title: 'Yeni' } }), { userId: 'u1', now, timezone: tz }), 'approved', { now });
    expect(planExecution(upd, { provider: 'google', kinds: ['calendar'] }, { now }).kind).toBe('gcal_update');
    expect(planExecution(upd, { provider: 'apple', kinds: ['calendar'] }, { now }).kind).toBe('device_event_update');

    const task = transition(await createApproval(request('task_create', { accountId, title: 'Görev' }), { userId: 'u1', now, timezone: tz }), 'approved', { now });
    expect(planExecution(task, { provider: 'google', kinds: ['email', 'tasks'] }, { now }).kind).toBe('gtasks_create');
    expect(planExecution(task, { provider: 'microsoft', kinds: ['tasks'] }, { now }).kind).toBe('graph_task_create');
    expect(planExecution(task, { provider: 'google', kinds: ['email'] }, { now })).toMatchObject({ kind: 'internal_task', requiredScope: null });
    const localTask = transition(await createApproval(request('task_create', { title: 'Yerel görev' }), { userId: 'u1', now, timezone: tz }), 'approved', { now });
    expect(planExecution(localTask, null, { now }).kind).toBe('internal_task');

    const rem = transition(await createApproval(request('reminder_create', { title: 'Ara', remindAt: '2026-09-04T16:00:00.000Z', option: 'custom' }), { userId: 'u1', now, timezone: tz }), 'approved', { now });
    expect(planExecution(rem, null, { now }).kind).toBe('internal_reminder');
    const com = transition(await createApproval(request('commitment_create', { text: 'Söz', direction: 'user_owes' }), { userId: 'u1', now, timezone: tz }), 'approved', { now });
    expect(planExecution(com, { provider: 'google', kinds: ['email'] }, { now }).kind).toBe('internal_commitment');
  });

  it('never plans execution for pending, expired or account-less provider actions', async () => {
    const pending = await pendingEmail();
    expect(() => planExecution(pending, { provider: 'google', kinds: ['email'] }, { now })).toThrow('İşlem onaylanmadan çalıştırılamaz.');
    const approved = transition(pending, 'approved', { now });
    expect(() => planExecution(approved, { provider: 'google', kinds: ['email'] }, { now: '2026-09-08T00:00:00.000Z' })).toThrow(AppError);
    expect(() => planExecution(approved, null, { now })).toThrow('Bu işlem için bağlı bir hesap gerekli.');
    expect(() => planExecution(approved, { provider: 'google', kinds: ['calendar'] }, { now })).toThrow(AppError);
    expect(() => planExecution(approved, { provider: 'device', kinds: ['email'] }, { now })).toThrow('Bu hesap bu işlemi desteklemiyor.');
    const retry = transition(transition(approved, 'executing', { now }), 'failed', { now });
    expect(planExecution(transition(retry, 'executing', { now }), { provider: 'google', kinds: ['email'] }, { now }).kind).toBe('gmail_send');
  });
});
