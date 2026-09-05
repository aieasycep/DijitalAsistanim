import type { ApprovalAction, CalendarCreatePayload, EmailSendPayload } from '@da/domain';
import {
  ACCOUNT_GMAIL,
  APPROVAL_AHMET_REPLY,
  APPROVAL_BASVURU_CALENDAR,
  INSIGHT_AHMET_REVIZE,
  INSIGHT_GIRISIM_DEADLINE,
  THREAD_AHMET_REVIZE,
  THREAD_GIRISIM_BASVURU,
} from '../ids';
import { source, type FixtureContext } from './types';

export function buildApprovals(f: FixtureContext): ApprovalAction[] {
  const ahmetPayload: EmailSendPayload = {
    accountId: ACCOUNT_GMAIL,
    threadId: THREAD_AHMET_REVIZE,
    inReplyToExternalId: 'm-ahmet-1',
    to: [{ name: 'Ahmet Yılmaz', email: 'ahmet@firma.com' }],
    subject: 'Re: Revize teklif',
    bodyText: `Merhaba Ahmet,\n\nRevize teklifi bugün 17:00'den önce PDF olarak iletiyorum.\n\nİyi çalışmalar,\n${f.userName}`,
    tone: 'professional',
  };
  const basvuruPayload: CalendarCreatePayload = {
    accountId: ACCOUNT_GMAIL,
    title: 'Girişim Programı başvurusu',
    startAt: f.lt(0, '16:30'),
    endAt: f.lt(0, '17:00'),
    description: 'Son başvuru 17:00',
  };
  const emailSend: ApprovalAction<'email_send'> = {
    id: APPROVAL_AHMET_REPLY,
    userId: f.userId,
    type: 'email_send',
    status: 'pending',
    what: "Ahmet Yılmaz'a yanıt gönder",
    why: "Revize teklifi bugün 17:00'ye kadar bekliyor.",
    changeSummary: ['Kime: Ahmet Yılmaz', 'Konu: Re: Revize teklif', 'Gönderim: sen onaylayınca'],
    source: source('gmail', THREAD_AHMET_REVIZE, 'Gmail', f.lt(0, '08:42'), {
      person: 'Ahmet Yılmaz',
    }),
    payload: ahmetPayload,
    originalPayload: { ...ahmetPayload },
    editedByUser: false,
    idempotencyKey: 'email_send:e1:draft-1',
    expiresAt: f.lt(2, '23:59'),
    approvedAt: null,
    rejectedAt: null,
    executedAt: null,
    executionResult: null,
    failureReason: null,
    attemptCount: 0,
    requestedBy: 'email_detail',
    insightId: INSIGHT_AHMET_REVIZE,
    requiredScope: null,
    createdAt: f.lt(0, '08:44'),
    updatedAt: f.lt(0, '08:44'),
  };
  const calendarCreate: ApprovalAction<'calendar_create'> = {
    id: APPROVAL_BASVURU_CALENDAR,
    userId: f.userId,
    type: 'calendar_create',
    status: 'pending',
    what: 'Takvime "Başvuru son saati" ekle',
    why: "Başvuru bugün 17:00'de kapanıyor.",
    changeSummary: [
      'Başlık: Girişim Programı başvurusu',
      'Ne zaman: Bugün 16:30–17:00',
      'Takvim: Google',
    ],
    source: source('gmail', THREAD_GIRISIM_BASVURU, 'Gmail', f.lt(-1, '16:10'), {
      person: 'Girişim Programı',
    }),
    payload: basvuruPayload,
    originalPayload: { ...basvuruPayload },
    editedByUser: false,
    idempotencyKey: 'calendar_create:e3:1',
    expiresAt: f.lt(0, '17:00'),
    approvedAt: null,
    rejectedAt: null,
    executedAt: null,
    executionResult: null,
    failureReason: null,
    attemptCount: 0,
    requestedBy: 'email_detail',
    insightId: INSIGHT_GIRISIM_DEADLINE,
    requiredScope: null,
    createdAt: f.lt(0, '08:46'),
    updatedAt: f.lt(0, '08:46'),
  };
  return [emailSend, calendarCreate];
}
