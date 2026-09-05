import { describe, expect, it } from 'vitest';
import type { Contact, EmailThread, FollowUp, LearnedPreference } from '@da/domain';
import {
  adjustNudgeDays,
  closeFollowUp,
  detectFollowUps,
  followUpBrief,
  followUpDueAt,
  followUpReason,
  followUpStatusAfterReply,
  followUpWaitLabel,
  refreshFollowUpStatus,
  selectNudges,
  snoozeFollowUp,
  stripSubjectPrefixes,
} from './index';
import { zonedTimeToUtc } from '../util';

const tz = 'Europe/Istanbul';
const at = (date: string, hhmm: string): string => zonedTimeToUtc(date, hhmm, tz);
const now = at('2026-09-05', '08:42');
const userEmails = ['yunus@example.com'];

let seq = 0;
function thread(partial: Partial<EmailThread> & { subject: string }): EmailThread {
  seq += 1;
  return {
    id: partial.id ?? `t-${seq}`,
    userId: 'u1',
    accountId: 'acc-1',
    externalThreadId: `ext-${seq}`,
    snippet: '',
    participants: [
      { name: 'Yunus Emre', email: 'yunus@example.com' },
      { name: 'Mehmet Yılmaz', email: 'mehmet@musteri.com' },
    ],
    lastMessageAt: at('2026-09-02', '10:15'),
    messageCount: 1,
    lastFromUser: true,
    isRead: true,
    labels: ['SENT'],
    importance: 'normal',
    category: 'waiting_for_other',
    analysis: null,
    priorityScore: 500,
    priorityReasons: [],
    triage: 'rules',
    fingerprint: `fp-${seq}`,
    userDismissed: false,
    userMarkedDone: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function followUp(partial: Partial<FollowUp> = {}): FollowUp {
  seq += 1;
  return {
    id: partial.id ?? `fu-${seq}`,
    userId: 'u1',
    threadId: partial.threadId ?? `t-${seq}`,
    contactId: null,
    counterpartName: 'Mehmet Yılmaz',
    topic: 'Teklif v2',
    sentAt: at('2026-09-02', '10:15'),
    nudgeAfterDays: 3,
    status: 'nudge_due',
    snoozedUntil: null,
    repliedAt: null,
    closedAt: null,
    source: { type: 'gmail', id: 't-x', label: 'Gmail', person: 'Mehmet Yılmaz', timestamp: at('2026-09-02', '10:15') },
    dismissCount: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function learned(kind: LearnedPreference['kind'], subjectKey: string, weight: number): LearnedPreference {
  return { id: `lp-${subjectKey}`, userId: 'u1', kind, statement: '', subjectKey, weight, evidenceCount: 3, enabled: true, lastReinforcedAt: now, createdAt: now, updatedAt: now };
}

const mehmetContact: Contact = {
  id: 'c-mehmet',
  userId: 'u1',
  displayName: 'Mehmet Yılmaz',
  emails: ['mehmet@musteri.com'],
  phones: [],
  interactionCount: 42,
  isVip: true,
  source: 'communication',
  createdAt: now,
  updatedAt: now,
};

describe('followups · detection', () => {
  it('creates a nudge_due draft for a sent thread with no reply after the cadence', () => {
    const drafts = detectFollowUps({ threads: [thread({ id: 't-mehmet', subject: 'Re: Teklif v2' })], now, userEmails, contactsById: { 'c-mehmet': mehmetContact } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      threadId: 't-mehmet',
      contactId: 'c-mehmet',
      counterpartName: 'Mehmet Yılmaz',
      topic: 'Teklif v2',
      nudgeAfterDays: 3,
      status: 'nudge_due',
      dismissCount: 0,
    });
    expect(drafts[0]?.source).toMatchObject({ type: 'gmail', label: 'Gmail', person: 'Mehmet Yılmaz', personId: 'c-mehmet', id: 't-mehmet' });
  });
  it('is still watching before the cadence elapses and uses the AI nudge hint when given', () => {
    const t = thread({
      subject: 'Sözleşme',
      lastMessageAt: at('2026-09-04', '18:00'),
      analysis: {
        summary: 'x',
        importance: 'normal',
        category: 'waiting_for_other',
        requiresUserAction: false,
        keyPoints: [],
        people: [],
        commitments: [],
        followUp: { expected: true, nudgeAfterDays: 5 },
        suggestedActions: [],
        confidence: 0.8,
        producedBy: 'ai_small',
      },
    });
    const drafts = detectFollowUps({ threads: [t], now, userEmails });
    expect(drafts[0]).toMatchObject({ status: 'watching', nudgeAfterDays: 5 });
  });
  it('skips threads that do not deserve a follow-up', () => {
    const threads = [
      thread({ subject: 'Not from me', lastFromUser: false }),
      thread({ subject: 'Low', importance: 'low' }),
      thread({ subject: 'Kampanya', category: 'promotion' }),
      thread({ subject: 'Bülten', labels: ['SENT', 'CATEGORY_PROMOTIONS'] }),
      thread({ subject: 'Kendime not', participants: [{ name: 'Yunus Emre', email: 'yunus@example.com' }] }),
      thread({ subject: 'No-reply', participants: [{ email: 'yunus@example.com' }, { email: 'noreply@shop.com' }] }),
      thread({ subject: 'Çok eski', lastMessageAt: at('2026-07-01', '10:00') }),
      thread({ subject: 'Dismissed', userDismissed: true }),
      thread({
        subject: 'AI says no',
        analysis: { summary: 'x', importance: 'normal', category: 'information', requiresUserAction: false, keyPoints: [], people: [], commitments: [], followUp: { expected: false }, suggestedActions: [], confidence: 0.9, producedBy: 'ai_small' },
      }),
    ];
    expect(detectFollowUps({ threads, now, userEmails })).toHaveLength(0);
  });
  it('respects existing follow-ups, dismissal limits and learned dismiss patterns', () => {
    const t = thread({ id: 't-mehmet', subject: 'Teklif v2' });
    const watching = detectFollowUps({ threads: [t], now, userEmails, existing: [followUp({ threadId: 't-mehmet', status: 'watching' })] });
    expect(watching).toHaveLength(0);
    const closedAfter = detectFollowUps({ threads: [t], now, userEmails, existing: [followUp({ threadId: 't-mehmet', status: 'closed', sentAt: t.lastMessageAt })] });
    expect(closedAfter).toHaveLength(0);
    const closedBefore = detectFollowUps({ threads: [t], now, userEmails, existing: [followUp({ threadId: 't-mehmet', status: 'closed', sentAt: at('2026-08-20', '10:00') })] });
    expect(closedBefore).toHaveLength(1);
    const dismissed = detectFollowUps({
      threads: [t],
      now,
      userEmails,
      contactsById: { 'c-mehmet': mehmetContact },
      existing: [followUp({ threadId: 't-old-1', contactId: 'c-mehmet', status: 'closed', dismissCount: 1 }), followUp({ threadId: 't-old-2', contactId: 'c-mehmet', status: 'closed', dismissCount: 1 })],
    });
    expect(dismissed).toHaveLength(0);
    const pattern = detectFollowUps({ threads: [t], now, userEmails, learned: [learned('dismiss_pattern', 'mehmet@musteri.com', 0.5)] });
    expect(pattern).toHaveLength(0);
  });
  it('adjusts the cadence with learned follow_up_cadence and labels Outlook accounts', () => {
    const sooner = detectFollowUps({ threads: [thread({ subject: 'A', lastMessageAt: at('2026-09-04', '10:00') })], now, userEmails, learned: [learned('follow_up_cadence', 'mehmet@musteri.com', 1)] });
    expect(sooner[0]?.nudgeAfterDays).toBe(2);
    const later = detectFollowUps({ threads: [thread({ subject: 'B', lastMessageAt: at('2026-09-04', '10:00') })], now, userEmails, learned: [learned('follow_up_cadence', 'default', -1)] });
    expect(later[0]?.nudgeAfterDays).toBe(5);
    expect(adjustNudgeDays(3, 0)).toBe(3);
    expect(adjustNudgeDays(1, 1)).toBe(1);
    expect(adjustNudgeDays(30, -1)).toBe(14);
    const outlook = detectFollowUps({ threads: [thread({ subject: 'C', accountId: 'acc-ms' })], now, userEmails, accountSourceTypes: { 'acc-ms': 'outlook' } });
    expect(outlook[0]?.source.label).toBe('Outlook');
  });
  it('strips reply prefixes from topics', () => {
    expect(stripSubjectPrefixes('Re: Fwd: Ynt: Teklif v2')).toBe('Teklif v2');
    expect(stripSubjectPrefixes('Teklif')).toBe('Teklif');
  });
});

describe('followups · lifecycle', () => {
  it('reply after the tracked message marks it replied; earlier replies are ignored', () => {
    const f = followUp();
    const replied = followUpStatusAfterReply(f, at('2026-09-05', '09:00'));
    expect(replied.status).toBe('replied');
    expect(replied.repliedAt).toBe(at('2026-09-05', '09:00'));
    expect(followUpStatusAfterReply(f, at('2026-09-01', '09:00')).status).toBe('nudge_due');
    expect(followUpStatusAfterReply(closeFollowUp(f, now), at('2026-09-06', '09:00')).status).toBe('closed');
  });
  it('snooze and close keep the record consistent', () => {
    const f = followUp();
    const snoozed = snoozeFollowUp(f, at('2026-09-07', '09:00'));
    expect(snoozed).toMatchObject({ status: 'snoozed', snoozedUntil: at('2026-09-07', '09:00') });
    expect(followUpDueAt(snoozed)).toBe(at('2026-09-07', '09:00'));
    expect(refreshFollowUpStatus(snoozed, at('2026-09-06', '09:00')).status).toBe('snoozed');
    expect(refreshFollowUpStatus(snoozed, at('2026-09-07', '10:00')).status).toBe('nudge_due');
    const closed = closeFollowUp(snoozed, now, { dismissed: true });
    expect(closed).toMatchObject({ status: 'closed', closedAt: now, snoozedUntil: null, dismissCount: 1 });
    expect(refreshFollowUpStatus(followUp({ status: 'watching', sentAt: at('2026-09-04', '10:00') }), now).status).toBe('watching');
  });
});

describe('followups · copy', () => {
  it('phrases the canonical Turkish card and English variant', () => {
    const f = followUp({ topic: 'Teklif', sentAt: at('2026-09-02', '10:15') });
    expect(followUpBrief(f, { now })).toBe('Gönderdiğin teklif mailine 3 gündür cevap gelmedi.');
    expect(followUpBrief(followUp({ topic: 'Sözleşme taslağı 4. madde' }), { now })).toBe('Gönderdiğin “Sözleşme taslağı 4. madde” mailine 3 gündür cevap gelmedi.');
    expect(followUpBrief(followUp({ topic: 'Teklif', sentAt: at('2026-09-05', '07:00') }), { now })).toBe('Bugün gönderdiğin teklif mailine henüz cevap gelmedi.');
    expect(followUpBrief(f, { now, locale: 'en' })).toBe('No reply to your Teklif email for 3 days.');
    expect(followUpWaitLabel(f, { now })).toBe('3 gün');
    expect(followUpWaitLabel(followUp({ sentAt: at('2026-09-05', '06:00') }), { now })).toBe('2 saat');
    expect(followUpWaitLabel(f, { now, locale: 'en' })).toBe('3 days');
    expect(followUpReason(f, { now })).toBe('Son mesajı sen gönderdin ve Mehmet Yılmaz 3 gündür yanıt vermedi.');
  });
});

describe('followups · nudge selection', () => {
  it('caps per day, one per thread and person, skips recently nudged and snoozed', () => {
    const candidates = [
      followUp({ id: 'a', threadId: 't-a', counterpartName: 'Mehmet Yılmaz', sentAt: at('2026-08-30', '10:00') }),
      followUp({ id: 'b', threadId: 't-b', counterpartName: 'Selin Kaya', sentAt: at('2026-08-31', '10:00') }),
      followUp({ id: 'c', threadId: 't-c', counterpartName: 'Ahmet Yılmaz', sentAt: at('2026-09-01', '10:00') }),
      followUp({ id: 'd', threadId: 't-d', counterpartName: 'Ayşe Demir', sentAt: at('2026-09-01', '12:00') }),
      followUp({ id: 'same-person', threadId: 't-e', counterpartName: 'Mehmet Yılmaz', sentAt: at('2026-08-29', '10:00') }),
      followUp({ id: 'recent', threadId: 't-recent', counterpartName: 'Ali', sentAt: at('2026-08-20', '10:00') }),
      followUp({ id: 'snoozed', threadId: 't-s', counterpartName: 'Veli', status: 'snoozed', snoozedUntil: at('2026-09-08', '09:00') }),
      followUp({ id: 'watching', threadId: 't-w', counterpartName: 'Can', status: 'watching', sentAt: at('2026-09-04', '10:00') }),
    ];
    const base = { now, timezone: tz, maxPerDay: 3, minHoursBetweenSameThread: 48, lastNudgeAtByThread: { 't-recent': at('2026-09-04', '09:00') } };
    const picked = selectNudges(candidates, base);
    expect(picked.map((f) => f.id)).toEqual(['same-person', 'b', 'c']);
    const budget = selectNudges(candidates, { ...base, sentToday: [at('2026-09-05', '07:00'), at('2026-09-05', '07:30')] });
    expect(budget.map((f) => f.id)).toEqual(['same-person']);
    expect(selectNudges(candidates, { ...base, sentToday: [at('2026-09-05', '07:00'), at('2026-09-05', '07:30'), at('2026-09-05', '08:00')] })).toEqual([]);
    const yesterdayDoesNotCount = selectNudges(candidates, { ...base, maxPerDay: 1, sentToday: [at('2026-09-04', '07:00')] });
    expect(yesterdayDoesNotCount.map((f) => f.id)).toEqual(['same-person']);
    const withoutMemory = selectNudges(candidates, { now, timezone: tz, maxPerDay: 1 });
    expect(withoutMemory.map((f) => f.id)).toEqual(['recent']);
  });
});
