/**
 * Approval executor — the ONLY place where an approved action touches the real world.
 *
 *  approved → executing → executed | failed
 *
 * Idempotent per approval: a retry of an already `executed` approval returns it unchanged; provider
 * calls carry the approval's idempotency key where the provider supports it (Graph: client request id;
 * Gmail: thread + subject dedupe happens at approval creation). Device-calendar actions cannot be
 * executed server-side (EventKit only exists on the phone); those stay `executing` with
 * `executionResult.handler = 'device'` and are finalised by `device-calendar-upsert`.
 */
import type { ApprovalAction, CommitmentCreatePayload, ReminderCreatePayload, SourceRef, TaskCreatePayload } from '@da/domain';
import { planExecution, transition, type ExecutionPlan } from '@da/server-core/approvals';
import { buildIdempotencyKey } from '@da/server-core/crypto';
import { AppError } from '@da/server-core/errors';
import { DEFAULT_NUDGE_DAYS, stripSubjectPrefixes } from '@da/server-core/followups';
import { providerClients } from '@da/server-core/providers';
import { accountIdOf, loadAccount, persistApproval, type ApprovalContext } from './approvals.ts';
import { audit } from './audit.ts';
import type { Db } from './db.ts';
import { ensureScope, loadCredentials } from './credentials.ts';
import { log } from './log.ts';

export interface ExecuteOptions {
  actor: 'user' | 'system' | 'cron';
  ctx: ApprovalContext;
}

export interface ExecuteResult {
  approval: ApprovalAction;
  /** Set when the grant lacks the scope the action needs — the app runs progressive OAuth, then retries. */
  requiredScope?: string | null;
}

/** Short, content-free failure reason stored on the row and shown on the card. */
function failureReasonFor(e: unknown): string {
  if (e instanceof AppError) {
    switch (e.code) {
      case 'oauth_expired':
        return 'connection_expired';
      case 'scope_required':
        return 'scope_required';
      case 'provider_unavailable':
        return 'provider_unavailable';
      case 'rate_limited':
        return 'rate_limited';
      case 'not_found':
        return 'target_missing';
      case 'validation':
        return 'invalid_payload';
      default:
        return e.code;
    }
  }
  return 'unknown';
}

export async function executeApproval(admin: Db, approval: ApprovalAction, opts: ExecuteOptions): Promise<ExecuteResult> {
  if (approval.status === 'executed') return { approval };
  const now = new Date().toISOString();
  const accountId = accountIdOf(approval);
  const account = accountId ? await loadAccount(admin, approval.userId, accountId) : null;
  if (accountId && !account) {
    const failed = transition(approval, 'failed', { now, locale: opts.ctx.locale, failureReason: 'account_missing' });
    await persistApproval(admin, failed);
    return { approval: failed };
  }

  const plan = planExecution(approval, account ? { provider: account.provider, kinds: account.kinds } : null, { now, locale: opts.ctx.locale });

  // Progressive OAuth: never start executing when the grant is missing the write scope.
  if (plan.requiredScope && account) {
    if (!account.grantedScopes.includes(plan.requiredScope)) {
      return { approval, requiredScope: plan.requiredScope };
    }
  }

  let executing = transition(approval, 'executing', { now, locale: opts.ctx.locale });
  await persistApproval(admin, executing);

  try {
    const result = await runPlan(admin, executing, plan, opts, account ? { provider: account.provider, id: account.id } : null);
    if (result.pendingOnDevice) {
      executing = { ...executing, executionResult: { handler: 'device', kind: plan.kind }, updatedAt: new Date().toISOString() };
      await persistApproval(admin, executing);
      return { approval: executing };
    }
    const executed = transition(executing, 'executed', { now: new Date().toISOString(), locale: opts.ctx.locale, executionResult: result.executionResult });
    await persistApproval(admin, executed);
    await audit(admin, {
      userId: approval.userId,
      action: 'approval.execute',
      actor: opts.actor,
      targetType: 'approval_action',
      targetId: approval.id,
      metadata: { type: approval.type, kind: plan.kind, attempt: executed.attemptCount },
    });
    if (approval.insightId) {
      await admin.from('insights').update({ status: 'completed', completed_at: executed.executedAt }).eq('id', approval.insightId).eq('user_id', approval.userId);
    }
    return { approval: executed };
  } catch (e) {
    const reason = failureReasonFor(e);
    const failed = transition(executing, 'failed', { now: new Date().toISOString(), locale: opts.ctx.locale, failureReason: reason });
    await persistApproval(admin, failed);
    await audit(admin, {
      userId: approval.userId,
      action: 'approval.fail',
      actor: opts.actor,
      targetType: 'approval_action',
      targetId: approval.id,
      metadata: { type: approval.type, kind: plan.kind, reason, attempt: failed.attemptCount },
    });
    log.warn('approval execution failed', { approvalId: approval.id, kind: plan.kind, reason });
    const requiredScope = e instanceof AppError && e.code === 'scope_required' ? (e.requiredScope ?? plan.requiredScope ?? null) : null;
    return requiredScope ? { approval: failed, requiredScope } : { approval: failed };
  }
}

interface RunOutcome {
  executionResult?: Record<string, unknown> | null;
  pendingOnDevice?: boolean;
}

async function runPlan(
  admin: Db,
  approval: ApprovalAction,
  plan: ExecutionPlan,
  opts: ExecuteOptions,
  account: { provider: string; id: string } | null,
): Promise<RunOutcome> {
  switch (plan.kind) {
    case 'internal_reminder':
      return { executionResult: await createReminder(admin, approval, plan.payload) };
    case 'internal_commitment':
      return { executionResult: await createCommitment(admin, approval, plan.payload) };
    case 'internal_task':
      return { executionResult: await createInternalTask(admin, approval, plan.payload, null, null) };
    case 'device_event_create':
    case 'device_event_update':
      return { pendingOnDevice: true };
    case 'gmail_send':
    case 'graph_send': {
      const creds = await requireCreds(admin, account, plan.requiredScope, opts);
      const clients = providerClients(creds.provider, fetch, creds.accessToken);
      const p = plan.payload;
      let externalThreadId: string | null = null;
      if (p.threadId) {
        const { data: thread } = await admin.from('email_threads').select('external_thread_id').eq('id', p.threadId).eq('user_id', approval.userId).maybeSingle();
        externalThreadId = (thread as { external_thread_id: string } | null)?.external_thread_id ?? null;
      }
      // Threading headers (In-Reply-To / References) are resolved by the provider adapter from the referenced message.
      const sent = await clients.mail.send({
        to: p.to,
        cc: p.cc ?? [],
        subject: p.subject,
        bodyText: p.bodyText,
        inReplyToExternalMessageId: p.inReplyToExternalId ?? null,
        externalThreadId,
      });
      await audit(admin, { userId: approval.userId, action: 'email.send', actor: opts.actor, targetType: 'email_thread', targetId: p.threadId ?? undefined, metadata: { provider: creds.provider, recipients: p.to.length } });
      await afterEmailSent(admin, approval, p.threadId ?? null, p.to[0]?.name ?? p.to[0]?.email ?? '', p.subject, creds.provider);
      return { executionResult: { externalMessageId: sent.externalMessageId, externalThreadId: sent.externalThreadId } };
    }
    case 'gcal_create':
    case 'graph_event_create': {
      const creds = await requireCreds(admin, account, plan.requiredScope, opts);
      const clients = providerClients(creds.provider, fetch, creds.accessToken);
      const p = plan.payload;
      const created = await clients.calendar.createEvent({
        title: p.title,
        description: p.description ?? null,
        location: p.location ?? null,
        startAt: p.startAt,
        endAt: p.endAt,
        allDay: p.allDay ?? false,
        attendees: p.attendees ?? [],
        timezone: opts.ctx.timezone,
      });
      const { data: row } = await admin
        .from('calendar_events')
        .upsert(
          {
            user_id: approval.userId,
            account_id: p.accountId,
            external_event_id: created.externalEventId,
            title: p.title,
            description: p.description ?? null,
            location: p.location ?? null,
            start_at: p.startAt,
            end_at: p.endAt,
            all_day: p.allDay ?? false,
            attendees: (p.attendees ?? []).map((a) => ({ name: a.name ?? null, email: a.email, isOrganizer: false, responseStatus: 'needsAction' })),
            organizer_is_user: true,
            status: 'confirmed',
            source: creds.provider === 'google' ? 'google_calendar' : 'outlook_calendar',
            is_ai_created: true,
            deleted_at: null,
          },
          { onConflict: 'account_id,external_event_id' },
        )
        .select('id')
        .maybeSingle();
      await audit(admin, { userId: approval.userId, action: 'calendar.write', actor: opts.actor, targetType: 'calendar_event', targetId: (row as { id: string } | null)?.id, metadata: { provider: creds.provider, op: 'create' } });
      return { executionResult: { externalEventId: created.externalEventId, eventId: (row as { id: string } | null)?.id ?? null, htmlLink: created.htmlLink } };
    }
    case 'gcal_update':
    case 'graph_event_update': {
      const creds = await requireCreds(admin, account, plan.requiredScope, opts);
      const clients = providerClients(creds.provider, fetch, creds.accessToken);
      const p = plan.payload;
      await clients.calendar.updateEvent(p.externalEventId, {
        ...(p.changes.title !== undefined ? { title: p.changes.title } : {}),
        ...(p.changes.startAt !== undefined ? { startAt: p.changes.startAt } : {}),
        ...(p.changes.endAt !== undefined ? { endAt: p.changes.endAt } : {}),
        ...(p.changes.location !== undefined ? { location: p.changes.location } : {}),
        ...(p.changes.description !== undefined ? { description: p.changes.description } : {}),
        timezone: opts.ctx.timezone,
      });
      const patch: Record<string, unknown> = {};
      if (p.changes.title !== undefined) patch.title = p.changes.title;
      if (p.changes.startAt !== undefined) patch.start_at = p.changes.startAt;
      if (p.changes.endAt !== undefined) patch.end_at = p.changes.endAt;
      if (p.changes.location !== undefined) patch.location = p.changes.location;
      if (p.changes.description !== undefined) patch.description = p.changes.description;
      if (Object.keys(patch).length) await admin.from('calendar_events').update(patch).eq('id', p.eventId).eq('user_id', approval.userId);
      await audit(admin, { userId: approval.userId, action: 'calendar.write', actor: opts.actor, targetType: 'calendar_event', targetId: p.eventId, metadata: { provider: creds.provider, op: 'update' } });
      return { executionResult: { externalEventId: p.externalEventId, eventId: p.eventId } };
    }
    case 'gtasks_create':
    case 'graph_task_create': {
      const creds = await requireCreds(admin, account, plan.requiredScope, opts);
      const clients = providerClients(creds.provider, fetch, creds.accessToken);
      const p = plan.payload;
      const created = await clients.tasks.createTask({ title: p.title, notes: p.notes ?? null, dueAt: p.dueAt ?? null });
      return { executionResult: await createInternalTask(admin, approval, p, created.externalTaskId, creds.provider) };
    }
  }
}

async function requireCreds(admin: Db, account: { provider: string; id: string } | null, requiredScope: string | null, opts: ExecuteOptions) {
  if (!account) throw new AppError('validation', 'Bu işlem için bağlı bir hesap gerekli.');
  const creds = await loadCredentials(admin, account.id, { actor: opts.actor === 'cron' ? 'cron' : opts.actor });
  ensureScope(creds, requiredScope);
  return creds;
}

async function createReminder(admin: Db, approval: ApprovalAction, p: ReminderCreatePayload): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('reminders')
    .insert({
      user_id: approval.userId,
      title: p.title,
      body: p.body ?? null,
      remind_at: p.remindAt,
      option: p.option,
      status: 'scheduled',
      target_type: p.targetType ?? null,
      target_id: p.targetId ?? null,
      source: approval.source ?? null,
      smart_reason: p.smartReason ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new AppError('internal', `Hatırlatıcı oluşturulamadı: ${error?.message ?? ''}`);
  const id = (data as { id: string }).id;
  await audit(admin, { userId: approval.userId, action: 'reminder.write', actor: 'system', targetType: 'reminder', targetId: id, metadata: { option: p.option } });
  return { reminderId: id };
}

async function createCommitment(admin: Db, approval: ApprovalAction, p: CommitmentCreatePayload): Promise<Record<string, unknown>> {
  const dedupeKey = await buildIdempotencyKey('commitment', {
    text: p.text.trim().toLocaleLowerCase('tr-TR'),
    direction: p.direction,
    counterpart: p.counterpartName?.trim().toLocaleLowerCase('tr-TR') ?? null,
    dueAt: p.dueAt ?? null,
  });
  const source: SourceRef = approval.source ?? { type: 'meeting_note', id: approval.id, label: 'Toplantı notu', timestamp: approval.createdAt };
  const { data, error } = await admin
    .from('commitments')
    .upsert(
      {
        user_id: approval.userId,
        text: p.text,
        quote: p.quote ?? null,
        direction: p.direction,
        counterpart_name: p.counterpartName ?? null,
        due_at: p.dueAt ?? null,
        due_text: p.dueText ?? null,
        status: 'open',
        source,
        confidence: 1,
        related_event_id: p.relatedEventId ?? null,
        dedupe_key: dedupeKey,
        deleted_at: null,
      },
      { onConflict: 'user_id,dedupe_key' },
    )
    .select('id')
    .single();
  if (error || !data) throw new AppError('internal', `Söz kaydedilemedi: ${error?.message ?? ''}`);
  return { commitmentId: (data as { id: string }).id };
}

async function createInternalTask(
  admin: Db,
  approval: ApprovalAction,
  p: TaskCreatePayload,
  externalTaskId: string | null,
  provider: string | null,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('tasks')
    .insert({
      user_id: approval.userId,
      account_id: externalTaskId ? (p.accountId ?? null) : null,
      external_task_id: externalTaskId,
      title: p.title,
      notes: p.notes ?? null,
      due_at: p.dueAt ?? null,
      status: 'open',
      source: approval.source ?? null,
      provider: provider ?? 'internal',
      scheduled_start_at: p.scheduledStartAt ?? null,
      scheduled_end_at: p.scheduledEndAt ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new AppError('internal', `Görev oluşturulamadı: ${error?.message ?? ''}`);
  const id = (data as { id: string }).id;
  await audit(admin, { userId: approval.userId, action: 'task.write', actor: 'system', targetType: 'task', targetId: id, metadata: { provider: provider ?? 'internal' } });
  return { taskId: id, externalTaskId };
}

/** After a reply goes out: the thread is "handled" and a follow-up watch starts. */
async function afterEmailSent(admin: Db, approval: ApprovalAction, threadId: string | null, counterpartName: string, subject: string, provider: string): Promise<void> {
  if (!threadId) return;
  const now = new Date().toISOString();
  await admin
    .from('email_threads')
    .update({ last_from_user: true, last_message_at: now, user_marked_done: true })
    .eq('id', threadId)
    .eq('user_id', approval.userId);
  const source: SourceRef = {
    type: provider === 'google' ? 'gmail' : 'outlook',
    id: threadId,
    label: provider === 'google' ? 'Gmail' : 'Outlook',
    person: counterpartName,
    timestamp: now,
  };
  await admin.from('follow_ups').upsert(
    {
      user_id: approval.userId,
      thread_id: threadId,
      counterpart_name: counterpartName,
      topic: stripSubjectPrefixes(subject),
      sent_at: now,
      nudge_after_days: DEFAULT_NUDGE_DAYS,
      status: 'watching',
      snoozed_until: null,
      replied_at: null,
      closed_at: null,
      source,
    },
    { onConflict: 'user_id,thread_id' },
  );
}
