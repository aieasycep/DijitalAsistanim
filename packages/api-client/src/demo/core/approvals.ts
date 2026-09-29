/**
 * Approval lifecycle: create (validated, idempotent) → approve → executing → executed | failed → retry.
 * Executing an approval applies the corresponding side effect to the demo state so every screen reflects it.
 */
import type {
  ApprovalAction,
  ApprovalActionType,
  ApprovalPayloadMap,
  CalendarCreatePayload,
  CalendarUpdatePayload,
  CommitmentCreatePayload,
  CreateApprovalRequest,
  EmailMessage,
  EmailSendPayload,
  EmailThread,
  ReminderCreatePayload,
  SourceType,
  TaskCreatePayload,
} from '@da/domain';
import { approvalPayloadSchemas } from '@da/validation';
import type { DemoContext } from '../context';
import { dueLabel, relativeDayLabel } from '../format';
import { sleep } from '../latency';
import type { DemoState } from '../state';
import { fold, truncate } from '../text';
import { conflict, notFound, validate } from '../validate';
import { appendAudit } from './audit';
import { syncConflicts } from './calendar';
import { completeInsightsFor, createCommitmentInsight, relabelEventInsights } from './insights';
import { findContactByEmail, findContactByName, primaryAccount, userParticipant } from './lookup';

export const PROVIDER_FAILURE_REASON = 'Sağlayıcı geçici olarak yanıt vermedi.';
const FAIL_EVERY_NTH_EMAIL = 7;
const APPROVAL_TTL_DAYS = 3;

export function pendingCount(state: DemoState): number {
  return state.approvals.filter((a) => a.status === 'pending').length;
}

export function emitPending(ctx: DemoContext): void {
  ctx.pendingChanged.emit(pendingCount(ctx.store.state));
}

export function getApproval(state: DemoState, id: string): ApprovalAction {
  const approval = state.approvals.find((a) => a.id === id);
  if (!approval) throw notFound('Onay', id);
  return approval;
}

/** Default "Ne · Neden · Ne değişecek" lines derived from the payload (used when the caller sends none). */
export function describeApproval(
  ctx: DemoContext,
  type: ApprovalActionType,
  payload: ApprovalPayloadMap[ApprovalActionType],
): { what: string; why: string; changeSummary: string[] } {
  const clock = ctx.clock;
  switch (type) {
    case 'email_send': {
      const p = payload as EmailSendPayload;
      const to = p.to.map((t) => t.name ?? t.email).join(', ');
      return {
        what: `${to} kişisine mail gönder`,
        why: 'Sen onaylayınca gönderilecek.',
        changeSummary: [`Kime: ${to}`, `Konu: ${p.subject}`, 'Gönderim: sen onaylayınca'],
      };
    }
    case 'calendar_create': {
      const p = payload as CalendarCreatePayload;
      return {
        what: `Takvime "${p.title}" ekle`,
        why: 'Kaynakta bir etkinlik bulundu.',
        changeSummary: [
          `Başlık: ${p.title}`,
          `Ne zaman: ${dueLabel(clock, p.startAt)}–${clock.hhmm(p.endAt)}`,
          'Takvim: 1 etkinlik eklenecek',
        ],
      };
    }
    case 'calendar_update': {
      const p = payload as CalendarUpdatePayload;
      const event = ctx.store.state.events.find((e) => e.id === p.eventId);
      const lines = [] as string[];
      if (p.changes.startAt)
        lines.push(`${event ? clock.hhmm(event.startAt) : '—'} → ${clock.hhmm(p.changes.startAt)}`);
      if (p.changes.title) lines.push(`Başlık: ${p.changes.title}`);
      if (p.changes.location !== undefined) lines.push(`Yer: ${p.changes.location ?? '—'}`);
      if (event && event.attendees.length > 1)
        lines.push(`${event.attendees.length - 1} katılımcıya bildirim gider`);
      return {
        what: `${event?.title ?? 'Etkinlik'} güncellensin`,
        why: 'Takvim değişikliği önerildi.',
        changeSummary: lines,
      };
    }
    case 'task_create': {
      const p = payload as TaskCreatePayload;
      const block =
        p.scheduledStartAt && p.scheduledEndAt
          ? `${relativeDayLabel(clock, p.scheduledStartAt)} ${clock.hhmm(p.scheduledStartAt)}–${clock.hhmm(p.scheduledEndAt)}`
          : null;
      return {
        what: `Görev oluştur: ${p.title}`,
        why: "Plan'a bir görev bloğu eklenecek.",
        changeSummary: [
          `Görev: ${p.title}`,
          ...(block ? [`Blok: ${block}`] : []),
          ...(p.dueAt ? [`Son tarih: ${dueLabel(clock, p.dueAt)}`] : []),
        ],
      };
    }
    case 'reminder_create': {
      const p = payload as ReminderCreatePayload;
      return {
        what: `${p.title} · ${dueLabel(clock, p.remindAt)}`,
        why: p.smartReason ?? 'Hatırlatıcı istendi.',
        changeSummary: [
          '1 hatırlatıcı · Takvimine yazılmaz',
          `Zaman: ${dueLabel(clock, p.remindAt)}`,
        ],
      };
    }
    case 'commitment_create': {
      const p = payload as CommitmentCreatePayload;
      return {
        what: p.text,
        why: p.quote ? `“${p.quote}” dedin.` : 'Toplantı notundan çıkarıldı.',
        changeSummary: [
          `Taahhüt: ${p.text}`,
          ...(p.dueText ? [`Ne zaman: ${p.dueText}`] : []),
          ...(p.counterpartName ? [`Kime: ${p.counterpartName}`] : []),
        ],
      };
    }
  }
}

export function createApprovalCore<T extends ApprovalActionType>(
  ctx: DemoContext,
  req: CreateApprovalRequest<T>,
): ApprovalAction<T> {
  const state = ctx.store.state;
  const existing = state.approvals.find((a) => a.idempotencyKey === req.idempotencyKey);
  if (existing) return existing as ApprovalAction<T>;
  const schema = approvalPayloadSchemas[req.type];
  const payload = validate(schema, req.payload) as unknown as ApprovalPayloadMap[T];
  const derived = describeApproval(ctx, req.type, payload);
  const now = ctx.nowIso();
  const approval: ApprovalAction<T> = {
    id: ctx.nextId(),
    userId: ctx.userId,
    type: req.type,
    status: 'pending',
    what: req.what?.trim() || derived.what,
    why: req.why?.trim() || derived.why,
    changeSummary: req.changeSummary?.length ? req.changeSummary : derived.changeSummary,
    source: req.source ?? null,
    payload,
    originalPayload: JSON.parse(JSON.stringify(payload)) as ApprovalPayloadMap[T],
    editedByUser: false,
    idempotencyKey: req.idempotencyKey,
    expiresAt: ctx.clock.atIso(ctx.clock.addDays(ctx.clock.today(), APPROVAL_TTL_DAYS), '23:59'),
    approvedAt: null,
    rejectedAt: null,
    executedAt: null,
    executionResult: null,
    failureReason: null,
    attemptCount: 0,
    requestedBy: req.requestedBy,
    insightId: req.insightId ?? null,
    requiredScope: null,
    createdAt: now,
    updatedAt: now,
  };
  ctx.store.mutate((s) => {
    s.approvals.push(approval);
    appendAudit(ctx, s, 'approval.create', {
      actor: req.requestedBy === 'assistant' || req.requestedBy === 'voice' ? 'assistant' : 'user',
      targetType: 'approval_action',
      targetId: approval.id,
      metadata: { type: req.type },
    });
  });
  emitPending(ctx);
  return approval;
}

/** Runs the simulated execution of an approved (or failed → retried) approval and applies its side effect. */
export async function executeApprovalCore(ctx: DemoContext, id: string): Promise<ApprovalAction> {
  const start = getApproval(ctx.store.state, id);
  if (start.status !== 'approved' && start.status !== 'failed')
    throw conflict('Bu onay çalıştırılabilir durumda değil.');
  let plannedFailure = false;
  ctx.store.mutate((s) => {
    const a = getApproval(s, id);
    a.status = 'executing';
    a.attemptCount += 1;
    a.failureReason = null;
    a.updatedAt = ctx.nowIso();
    if (a.type === 'email_send' && a.attemptCount === 1) {
      s.counters.emailSendExecutions += 1;
      plannedFailure = s.counters.emailSendExecutions % FAIL_EVERY_NTH_EMAIL === 0;
    }
  });
  await sleep(ctx.timings.approvalExecutionMs);
  const result = ctx.store.mutate((s) => {
    const a = s.approvals.find((x) => x.id === id);
    if (!a) throw notFound('Onay', id);
    if (a.status !== 'executing') return a;
    const now = ctx.nowIso();
    if (plannedFailure) {
      a.status = 'failed';
      a.failureReason = PROVIDER_FAILURE_REASON;
      a.updatedAt = now;
      appendAudit(ctx, s, 'approval.fail', {
        actor: 'system',
        targetType: 'approval_action',
        targetId: a.id,
        metadata: { type: a.type, attempt: a.attemptCount },
      });
      return a;
    }
    a.executionResult = applyApprovalEffect(ctx, s, a);
    a.status = 'executed';
    a.executedAt = now;
    a.updatedAt = now;
    if (a.insightId) {
      const insight = s.insights.find((i) => i.id === a.insightId);
      if (insight && insight.status === 'active') {
        insight.status = 'completed';
        insight.updatedAt = now;
      }
    }
    appendAudit(ctx, s, 'approval.execute', {
      actor: 'system',
      targetType: 'approval_action',
      targetId: a.id,
      metadata: { type: a.type },
    });
    return a;
  });
  emitPending(ctx);
  return result;
}

function sourceTypeForAccount(state: DemoState, accountId: string): SourceType {
  const account = state.accounts.find((a) => a.id === accountId);
  switch (account?.provider) {
    case 'microsoft':
      return 'microsoft_calendar';
    case 'apple':
      return 'apple_calendar';
    case 'device':
      return 'device_calendar';
    default:
      return 'google_calendar';
  }
}

export function applyApprovalEffect(
  ctx: DemoContext,
  state: DemoState,
  approval: ApprovalAction,
): Record<string, unknown> {
  const now = ctx.nowIso();
  switch (approval.type) {
    case 'email_send':
      return sendEmail(ctx, state, approval as ApprovalAction<'email_send'>, now);
    case 'calendar_create': {
      const p = approval.payload as CalendarCreatePayload;
      const accountId = state.accounts.some((a) => a.id === p.accountId)
        ? p.accountId
        : (primaryAccount(state)?.id ?? p.accountId);
      const id = ctx.nextId();
      state.events.push({
        id,
        userId: ctx.userId,
        accountId,
        externalEventId: `ev-${id.slice(-6)}`,
        calendarId: 'primary',
        title: p.title,
        description: p.description ?? null,
        location: p.location ?? null,
        meetingUrl: null,
        meetingProvider: null,
        startAt: p.startAt,
        endAt: p.endAt,
        allDay: p.allDay ?? false,
        attendees: (p.attendees ?? []).map((a) => ({
          name: a.name ?? null,
          email: a.email,
          contactId: findContactByEmail(state, a.email)?.id ?? null,
          isOrganizer: false,
          responseStatus: 'needsAction',
        })),
        organizerIsUser: true,
        status: 'confirmed',
        providerUpdatedAt: now,
        source: sourceTypeForAccount(state, accountId),
        prepGeneratedAt: null,
        postMeetingHandledAt: null,
        isAiCreated: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      syncConflicts(state, ctx.clock, () => ctx.nextId(), now);
      appendAudit(ctx, state, 'calendar.write', {
        actor: 'system',
        targetType: 'calendar_event',
        targetId: id,
        metadata: { op: 'create' },
      });
      return { eventId: id };
    }
    case 'calendar_update': {
      const p = approval.payload as CalendarUpdatePayload;
      const event = state.events.find((e) => e.id === p.eventId && !e.deletedAt);
      if (!event) throw notFound('Etkinlik', p.eventId);
      if (
        p.expectedProviderUpdatedAt &&
        event.providerUpdatedAt &&
        p.expectedProviderUpdatedAt !== event.providerUpdatedAt
      ) {
        throw conflict('Etkinlik sağlayıcıda değişmiş; öneri artık geçerli değil.');
      }
      if (p.changes.title) event.title = p.changes.title;
      if (p.changes.startAt) event.startAt = p.changes.startAt;
      if (p.changes.endAt) event.endAt = p.changes.endAt;
      if (p.changes.startAt && !p.changes.endAt) {
        const original = approval.originalPayload as CalendarUpdatePayload;
        const duration =
          Date.parse(event.endAt) - Date.parse(original.changes.startAt ?? event.startAt);
        if (duration <= 0)
          event.endAt = new Date(Date.parse(event.startAt) + 60 * 60_000).toISOString();
      }
      if (p.changes.location !== undefined) event.location = p.changes.location ?? null;
      if (p.changes.description !== undefined) event.description = p.changes.description ?? null;
      event.providerUpdatedAt = now;
      event.updatedAt = now;
      relabelEventInsights(state, ctx.clock, event.id, event.startAt, now);
      syncConflicts(state, ctx.clock, () => ctx.nextId(), now);
      for (const stored of state.conflicts) {
        if (stored.status === 'resolved') completeInsightsFor(state, 'conflict', stored.id, now);
      }
      appendAudit(ctx, state, 'calendar.write', {
        actor: 'system',
        targetType: 'calendar_event',
        targetId: event.id,
        metadata: { op: 'update' },
      });
      return { eventId: event.id, startAt: event.startAt, endAt: event.endAt };
    }
    case 'task_create': {
      const p = approval.payload as TaskCreatePayload;
      const existing = state.tasks.find(
        (t) => !t.deletedAt && t.status === 'open' && fold(t.title) === fold(p.title),
      );
      if (existing) {
        existing.scheduledStartAt = p.scheduledStartAt ?? existing.scheduledStartAt;
        existing.scheduledEndAt = p.scheduledEndAt ?? existing.scheduledEndAt;
        existing.dueAt = p.dueAt ?? existing.dueAt;
        existing.notes = p.notes ?? existing.notes;
        existing.updatedAt = now;
        if (existing.scheduledStartAt) completeInsightsFor(state, 'suggestion', existing.id, now);
        appendAudit(ctx, state, 'task.write', {
          actor: 'system',
          targetType: 'task',
          targetId: existing.id,
          metadata: { op: 'schedule' },
        });
        return { taskId: existing.id, scheduled: Boolean(existing.scheduledStartAt) };
      }
      const id = ctx.nextId();
      state.tasks.push({
        id,
        userId: ctx.userId,
        accountId: p.accountId ?? null,
        externalTaskId: null,
        title: p.title,
        notes: p.notes ?? null,
        dueAt: p.dueAt ?? null,
        status: 'open',
        completedAt: null,
        source: approval.source ?? {
          type: 'assistant',
          id: approval.id,
          label: 'Asistan',
          timestamp: now,
        },
        provider: 'internal',
        scheduledStartAt: p.scheduledStartAt ?? null,
        scheduledEndAt: p.scheduledEndAt ?? null,
        priority: 'normal',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      appendAudit(ctx, state, 'task.write', {
        actor: 'system',
        targetType: 'task',
        targetId: id,
        metadata: { op: 'create' },
      });
      return { taskId: id };
    }
    case 'reminder_create': {
      const p = approval.payload as ReminderCreatePayload;
      const id = ctx.nextId();
      state.reminders.push({
        id,
        userId: ctx.userId,
        title: p.title,
        body: p.body ?? null,
        remindAt: p.remindAt,
        option: p.option,
        status: 'scheduled',
        targetType: p.targetType ?? null,
        targetId: p.targetId ?? null,
        source: approval.source ?? null,
        smartReason: p.smartReason ?? null,
        localNotificationId: null,
        createdAt: now,
        updatedAt: now,
      });
      appendAudit(ctx, state, 'reminder.write', {
        actor: 'system',
        targetType: 'reminder',
        targetId: id,
        metadata: { option: p.option },
      });
      return { reminderId: id, remindAt: p.remindAt };
    }
    case 'commitment_create': {
      const p = approval.payload as CommitmentCreatePayload;
      const id = ctx.nextId();
      const contact = p.counterpartName ? findContactByName(state, p.counterpartName) : undefined;
      const commitment = {
        id,
        userId: ctx.userId,
        text: p.text,
        quote: p.quote ?? null,
        direction: p.direction,
        counterpartName: p.counterpartName ?? contact?.displayName ?? null,
        counterpartContactId: contact?.id ?? null,
        dueAt: p.dueAt ?? null,
        dueText: p.dueText ?? null,
        status: 'open' as const,
        source: approval.source ?? {
          type: 'meeting_note' as const,
          id: approval.id,
          label: 'Toplantı notu',
          timestamp: now,
        },
        confidence: 0.85,
        completedAt: null,
        postponedUntil: null,
        relatedEventId: p.relatedEventId ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      state.commitments.push(commitment);
      createCommitmentInsight(ctx, state, commitment, ctx.clock.today());
      return { commitmentId: id };
    }
  }
}

function sendEmail(
  ctx: DemoContext,
  state: DemoState,
  approval: ApprovalAction<'email_send'>,
  executedAt: string,
): Record<string, unknown> {
  const p = approval.payload;
  const me = userParticipant(state);
  const accountId = state.accounts.some((a) => a.id === p.accountId)
    ? p.accountId
    : (primaryAccount(state)?.id ?? p.accountId);
  let thread: EmailThread | undefined = p.threadId
    ? state.threads.find((t) => t.id === p.threadId && !t.deletedAt)
    : undefined;
  // A reply can never precede the message it answers (the seed's morning mails may be "later" than a frozen clock).
  const now = thread
    ? new Date(
        Math.max(Date.parse(executedAt), Date.parse(thread.lastMessageAt) + 60_000),
      ).toISOString()
    : executedAt;
  if (!thread) {
    const id = ctx.nextId();
    thread = {
      id,
      userId: ctx.userId,
      accountId,
      externalThreadId: `t-${id.slice(-6)}`,
      subject: p.subject,
      snippet: truncate(p.bodyText, 120),
      participants: [me, ...p.to],
      lastMessageAt: now,
      messageCount: 0,
      lastFromUser: true,
      isRead: true,
      labels: ['SENT'],
      importance: 'normal',
      category: 'waiting_for_other',
      analysis: null,
      priorityScore: 200,
      priorityReasons: ['Sen gönderdin'],
      triage: 'skip',
      fingerprint: `fp-${id.slice(-6)}`,
      userDismissed: false,
      userMarkedDone: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    state.threads.push(thread);
  }
  const messageId = ctx.nextId();
  const message: EmailMessage = {
    id: messageId,
    userId: ctx.userId,
    accountId,
    threadId: thread.id,
    externalMessageId: `m-${messageId.slice(-6)}`,
    from: me,
    to: p.to,
    cc: p.cc ?? [],
    subject: p.subject,
    snippet: truncate(p.bodyText, 120),
    bodyText: p.bodyText,
    sentAt: now,
    isFromUser: true,
    hasAttachments: false,
    attachments: [],
    labels: ['SENT'],
    webUrl: `https://mail.google.com/mail/u/0/#sent/m-${messageId.slice(-6)}`,
    fingerprint: `fp-${messageId.slice(-6)}`,
    analysis: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  state.messages.push(message);
  thread.lastMessageAt = now;
  thread.messageCount += 1;
  thread.lastFromUser = true;
  thread.isRead = true;
  thread.userMarkedDone = true;
  thread.updatedAt = now;
  if (thread.category === 'action_required' || thread.category === 'waiting_for_user')
    thread.category = 'waiting_for_other';
  completeInsightsFor(state, 'email_thread', thread.id, now);
  for (const followUp of state.followUps) {
    if (
      followUp.threadId === thread.id &&
      followUp.status !== 'closed' &&
      followUp.status !== 'replied'
    ) {
      followUp.status = 'closed';
      followUp.closedAt = now;
      followUp.updatedAt = now;
      completeInsightsFor(state, 'follow_up', followUp.id, now);
    }
  }
  for (const c of state.commitments) {
    if (c.direction === 'user_owes' && c.status === 'open' && c.source.id === thread.id) {
      c.status = 'completed';
      c.completedAt = now;
      c.updatedAt = now;
      completeInsightsFor(state, 'commitment', c.id, now);
    }
  }
  for (const to of p.to) {
    const contact = findContactByEmail(state, to.email);
    if (contact) {
      contact.lastContactAt = now;
      contact.interactionCount += 1;
      contact.updatedAt = now;
    }
  }
  appendAudit(ctx, state, 'email.send', {
    actor: 'system',
    targetType: 'email_thread',
    targetId: thread.id,
    metadata: { messageId },
  });
  return { messageId, threadId: thread.id, sentAt: now };
}
