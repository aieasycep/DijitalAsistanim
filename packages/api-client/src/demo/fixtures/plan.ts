import type { Commitment, FollowUp, Reminder, TaskItem } from '@da/domain';
import {
  COMMITMENT_MEHMET_FEEDBACK,
  COMMITMENT_MEHMET_TEKLIF,
  COMMITMENT_SELIN_YORUM,
  CONTACT_MEHMET,
  CONTACT_SELIN,
  EVENT_MEHMET_MEETING,
  FOLLOWUP_HUKUK_SOZLESME,
  FOLLOWUP_MEHMET_TEKLIF,
  POST_MEETING_NOTE_MEHMET,
  REMINDER_AHMET_TEKLIF,
  TASK_TEKLIF_HAZIRLAMA,
  THREAD_AHMET_REVIZE,
  THREAD_HUKUK_SOZLESME,
  THREAD_MEHMET_TEKLIF_V2,
  THREAD_SELIN_SOZLESME,
} from '../ids';
import { source, type FixtureContext } from './types';

export function buildTasks(f: FixtureContext): TaskItem[] {
  return [
    {
      id: TASK_TEKLIF_HAZIRLAMA,
      userId: f.userId,
      accountId: null,
      externalTaskId: null,
      title: 'Teklif hazırlama',
      notes: 'Mehmet için v3 teklif',
      dueAt: f.lt(1, '18:00'),
      status: 'open',
      completedAt: null,
      source: source('user', 'manual', 'Sen', f.lt(-1, '17:30')),
      provider: 'internal',
      scheduledStartAt: null,
      scheduledEndAt: null,
      priority: 'high',
      createdAt: f.lt(-1, '17:30'),
      updatedAt: f.lt(-1, '17:30'),
      deletedAt: null,
    },
  ];
}

export function buildCommitments(f: FixtureContext): Commitment[] {
  return [
    {
      id: COMMITMENT_MEHMET_TEKLIF,
      userId: f.userId,
      text: "Mehmet'e teklif gönder",
      quote: 'yarın göndereceğim',
      direction: 'user_owes',
      counterpartName: 'Mehmet Yılmaz',
      counterpartContactId: CONTACT_MEHMET,
      dueAt: f.lt(1, '18:00'),
      dueText: 'yarın',
      status: 'open',
      source: source('meeting_note', POST_MEETING_NOTE_MEHMET, 'Toplantı notu', f.lt(-4, '15:31'), {
        person: 'Mehmet Yılmaz',
      }),
      confidence: 0.9,
      completedAt: null,
      postponedUntil: null,
      relatedEventId: EVENT_MEHMET_MEETING,
      createdAt: f.lt(-4, '15:31'),
      updatedAt: f.lt(-4, '15:31'),
      deletedAt: null,
    },
    {
      id: COMMITMENT_SELIN_YORUM,
      userId: f.userId,
      text: "Selin'e sözleşme yorumu",
      quote: null,
      direction: 'user_owes',
      counterpartName: 'Selin Kaya',
      counterpartContactId: CONTACT_SELIN,
      dueAt: f.lt(1, '12:00'),
      dueText: 'yarın 12:00',
      status: 'open',
      source: source('gmail', THREAD_SELIN_SOZLESME, 'Gmail', f.lt(-1, '15:40'), {
        person: 'Selin Kaya',
      }),
      confidence: 0.85,
      completedAt: null,
      postponedUntil: null,
      relatedEventId: null,
      createdAt: f.lt(-1, '15:45'),
      updatedAt: f.lt(-1, '15:45'),
      deletedAt: null,
    },
    {
      id: COMMITMENT_MEHMET_FEEDBACK,
      userId: f.userId,
      text: 'Mehmet Teklif v2 geri bildirimi gönderecek',
      quote: 'hafta içinde dönüş yapacağım',
      direction: 'other_owes',
      counterpartName: 'Mehmet Yılmaz',
      counterpartContactId: CONTACT_MEHMET,
      dueAt: f.lt(0, '18:00'),
      dueText: 'bu hafta',
      status: 'open',
      source: source('gmail', THREAD_MEHMET_TEKLIF_V2, 'Gmail', f.lt(-3, '10:15'), {
        person: 'Mehmet Yılmaz',
      }),
      confidence: 0.7,
      completedAt: null,
      postponedUntil: null,
      relatedEventId: null,
      createdAt: f.lt(-3, '10:20'),
      updatedAt: f.lt(-3, '10:20'),
      deletedAt: null,
    },
  ];
}

export function buildFollowUps(f: FixtureContext): FollowUp[] {
  return [
    {
      id: FOLLOWUP_MEHMET_TEKLIF,
      userId: f.userId,
      threadId: THREAD_MEHMET_TEKLIF_V2,
      contactId: CONTACT_MEHMET,
      counterpartName: 'Mehmet Yılmaz',
      topic: 'Teklif v2',
      sentAt: f.lt(-3, '10:15'),
      nudgeAfterDays: 3,
      status: 'nudge_due',
      snoozedUntil: null,
      repliedAt: null,
      closedAt: null,
      source: source('gmail', THREAD_MEHMET_TEKLIF_V2, 'Gmail', f.lt(-3, '10:15'), {
        person: 'Mehmet Yılmaz',
      }),
      dismissCount: 0,
      createdAt: f.lt(-3, '10:20'),
      updatedAt: f.lt(0, '06:00'),
    },
    {
      id: FOLLOWUP_HUKUK_SOZLESME,
      userId: f.userId,
      threadId: THREAD_HUKUK_SOZLESME,
      contactId: null,
      counterpartName: 'Hukuk Ekibi',
      topic: 'Sözleşme yorumu',
      sentAt: f.lt(-14, '11:05'),
      nudgeAfterDays: 7,
      status: 'nudge_due',
      snoozedUntil: null,
      repliedAt: null,
      closedAt: null,
      source: source('gmail', THREAD_HUKUK_SOZLESME, 'Gmail', f.lt(-14, '11:05'), {
        person: 'Hukuk Ekibi',
      }),
      dismissCount: 1,
      createdAt: f.lt(-14, '11:10'),
      updatedAt: f.lt(-7, '09:00'),
    },
  ];
}

export function buildReminders(f: FixtureContext): Reminder[] {
  return [
    {
      id: REMINDER_AHMET_TEKLIF,
      userId: f.userId,
      title: "Ahmet'e revize teklif",
      body: "Bugün 17:00'ye kadar",
      remindAt: f.lt(0, '12:10'),
      option: 'smart',
      status: 'scheduled',
      targetType: 'email_thread',
      targetId: THREAD_AHMET_REVIZE,
      source: source('gmail', THREAD_AHMET_REVIZE, 'Gmail', f.lt(0, '08:42'), {
        person: 'Ahmet Yılmaz',
      }),
      smartReason: 'Takviminde 12:10 boş; toplantından önce.',
      localNotificationId: null,
      createdAt: f.lt(0, '08:50'),
      updatedAt: f.lt(0, '08:50'),
    },
  ];
}
