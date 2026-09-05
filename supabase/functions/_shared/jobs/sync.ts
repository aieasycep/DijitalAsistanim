/**
 * Sync job: pull provider deltas (Gmail / Graph mail, Google / Microsoft calendar, Google Tasks / To Do)
 * into the database. Runs per `sync_states` row; webhooks and `accounts-sync-now` only mark rows due.
 * After a mail delta the analysis pipeline runs for the user (server-core triage → AI → insights).
 */
import type { CalendarEvent, EmailThread, SyncState } from '@da/domain';
import { sha256Hex } from '@da/server-core/crypto';
import { AppError } from '@da/server-core/errors';
import {
  providerClients,
  type CalendarEventDraft,
  type EmailMessageDraft,
  type ProviderId,
  type TaskDraft,
} from '@da/server-core/providers';
import { applyCalendarDelta, groupIntoThreads, mergeThreadUpdate } from '@da/server-core/sync';
import { normalizeText } from '@da/server-core/util';
import type { Db } from '../db.ts';
import { loadCredentials } from '../credentials.ts';
import { log } from '../log.ts';
import { camelize } from '../rows.ts';

export interface SyncOutcome {
  accountId: string;
  resource: SyncState['resource'];
  ok: boolean;
  added: number;
  updated: number;
  deleted: number;
  hasMore: boolean;
  error?: string;
}

interface AccountRow {
  id: string;
  user_id: string;
  provider: string;
  email: string | null;
  kinds: string[];
  controls: Record<string, boolean>;
  backfill_completed: boolean;
}

const MESSAGE_BODY_LIMIT = 20_000;

function contentFingerprint(m: EmailMessageDraft): Promise<string> {
  return sha256Hex(
    normalizeText(`${m.from.email}\n${m.subject}\n${m.bodyText ?? m.snippet}`).slice(0, 4000),
  );
}

export async function runSync(
  admin: Db,
  state: SyncState,
  opts: { now: string; backfillWindowHours?: number },
): Promise<SyncOutcome> {
  const base: SyncOutcome = {
    accountId: state.accountId,
    resource: state.resource,
    ok: false,
    added: 0,
    updated: 0,
    deleted: 0,
    hasMore: false,
  };
  const { data: accountRow } = await admin
    .from('connected_accounts')
    .select('id, user_id, provider, email, kinds, controls, backfill_completed')
    .eq('id', state.accountId)
    .is('deleted_at', null)
    .maybeSingle();
  const account = accountRow as AccountRow | null;
  if (!account || (account.provider !== 'google' && account.provider !== 'microsoft')) {
    await admin
      .from('sync_states')
      .update({ last_run_at: opts.now, last_error: 'account_unavailable' })
      .eq('id', state.id);
    return { ...base, error: 'account_unavailable' };
  }
  const provider = account.provider as ProviderId;
  await admin.from('sync_states').update({ last_run_at: opts.now }).eq('id', state.id);

  try {
    const creds = await loadCredentials(admin, account.id, { actor: 'cron' });
    const clients = providerClients(
      provider,
      (input, init) => fetch(input, init),
      creds.accessToken,
      { userEmail: account.email },
    );
    let outcome: SyncOutcome;
    if (state.resource === 'mail')
      outcome = await syncMail(admin, account, clients.mail, state, opts, base);
    else if (state.resource === 'calendar')
      outcome = await syncCalendar(admin, account, clients.calendar, state, opts, base);
    else if (state.resource === 'tasks')
      outcome = await syncTasks(admin, account, clients.tasks, state, opts, base);
    else outcome = { ...base, ok: true };
    await admin
      .from('sync_states')
      .update({ last_success_at: opts.now, error_count: 0, last_error: null })
      .eq('id', state.id);
    await admin
      .from('connected_accounts')
      .update({ last_sync_at: opts.now, status: 'active', last_error: null })
      .eq('id', account.id);
    return outcome;
  } catch (e) {
    const code = e instanceof AppError ? e.code : 'internal';
    const message = e instanceof Error ? e.message : 'unknown';
    log.warn('sync failed', { accountId: account.id, resource: state.resource, code });
    await admin
      .from('sync_states')
      .update({ error_count: state.errorCount + 1, last_error: code })
      .eq('id', state.id);
    if (code === 'oauth_expired')
      await admin
        .from('connected_accounts')
        .update({ status: 'expired', last_error: 'Bağlantı yenilenmeli' })
        .eq('id', account.id);
    else if (code === 'provider_unavailable')
      await admin
        .from('connected_accounts')
        .update({ status: 'error', last_error: 'Sağlayıcıya ulaşılamıyor' })
        .eq('id', account.id);
    return { ...base, error: `${code}: ${message.slice(0, 120)}` };
  }
}

async function syncMail(
  admin: Db,
  account: AccountRow,
  mail: ReturnType<typeof providerClients>['mail'],
  state: SyncState,
  opts: { now: string; backfillWindowHours?: number },
  base: SyncOutcome,
): Promise<SyncOutcome> {
  if (account.controls.readEmail === false) return { ...base, ok: true };
  const delta = await mail.sync({
    cursor: state.cursor ?? null,
    pageToken: state.backfillPageToken ?? null,
    maxMessages: 100,
    backfillWindowHours: opts.backfillWindowHours ?? 72,
    now: opts.now,
  });
  if (delta.fullResyncRequired) {
    await admin
      .from('sync_states')
      .update({ cursor: null, backfill_page_token: null })
      .eq('id', state.id);
    return { ...base, ok: true, hasMore: true };
  }
  let added = 0;
  let updated = 0;
  const threads = groupIntoThreads(delta.messages);
  const externalIds = threads.map((t) => t.externalThreadId);
  const { data: existingRows } = externalIds.length
    ? await admin
        .from('email_threads')
        .select('*')
        .eq('account_id', account.id)
        .in('external_thread_id', externalIds)
    : { data: [] };
  const existingByExt = new Map(
    camelize<EmailThread[]>(existingRows ?? []).map((t) => [t.externalThreadId, t]),
  );

  for (const draft of threads) {
    const messages = delta.messages.filter((m) =>
      draft.externalMessageIds.includes(m.externalMessageId),
    );
    const fingerprint = await sha256Hex(
      `${account.id}:${draft.externalThreadId}:${draft.lastMessageAt}:${draft.messageCount}`,
    );
    let threadId: string;
    const existing = existingByExt.get(draft.externalThreadId);
    if (existing) {
      const { data: storedIds } = await admin
        .from('email_messages')
        .select('external_message_id')
        .eq('thread_id', existing.id);
      const known = new Set(
        ((storedIds ?? []) as { external_message_id: string }[]).map((m) => m.external_message_id),
      );
      const addedMessages = messages.filter((m) => !known.has(m.externalMessageId)).length;
      const patch = mergeThreadUpdate(existing, draft, { addedMessages });
      if (Object.keys(patch).length) {
        await admin
          .from('email_threads')
          .update({
            ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
            ...(patch.snippet !== undefined ? { snippet: patch.snippet } : {}),
            ...(patch.participants !== undefined ? { participants: patch.participants } : {}),
            ...(patch.lastMessageAt !== undefined ? { last_message_at: patch.lastMessageAt } : {}),
            ...(patch.messageCount !== undefined ? { message_count: patch.messageCount } : {}),
            ...(patch.lastFromUser !== undefined ? { last_from_user: patch.lastFromUser } : {}),
            ...(patch.isRead !== undefined ? { is_read: patch.isRead } : {}),
            ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
            ...(patch.userDismissed !== undefined ? { user_dismissed: patch.userDismissed } : {}),
            ...(patch.userMarkedDone !== undefined
              ? { user_marked_done: patch.userMarkedDone }
              : {}),
            ...(addedMessages > 0 ? { fingerprint, analyzed_at: null } : {}),
          })
          .eq('id', existing.id);
        updated += 1;
      }
      threadId = existing.id;
    } else {
      const { data: inserted, error } = await admin
        .from('email_threads')
        .insert({
          user_id: account.user_id,
          account_id: account.id,
          external_thread_id: draft.externalThreadId,
          subject: draft.subject,
          snippet: draft.snippet,
          participants: draft.participants,
          last_message_at: draft.lastMessageAt,
          message_count: draft.messageCount,
          last_from_user: draft.lastFromUser,
          is_read: draft.isRead,
          labels: draft.labels,
          fingerprint,
        })
        .select('id')
        .single();
      if (error || !inserted)
        throw new AppError('internal', `Konuşma kaydedilemedi: ${error?.message ?? ''}`);
      threadId = (inserted as { id: string }).id;
      added += 1;
    }
    const rows = [];
    for (const m of messages) {
      rows.push({
        user_id: account.user_id,
        account_id: account.id,
        thread_id: threadId,
        external_message_id: m.externalMessageId,
        from_participant: m.from,
        to_participants: m.to,
        cc_participants: m.cc,
        subject: m.subject,
        snippet: m.snippet,
        body_text: m.bodyText ? m.bodyText.slice(0, MESSAGE_BODY_LIMIT) : null,
        sent_at: m.sentAt,
        is_from_user: m.isFromUser,
        has_attachments: m.hasAttachments,
        attachments: m.attachments,
        labels: m.labels,
        web_url: m.webUrl ?? null,
        fingerprint: await contentFingerprint(m),
        deleted_at: null,
      });
    }
    if (rows.length) {
      const { error } = await admin
        .from('email_messages')
        .upsert(rows, { onConflict: 'account_id,external_message_id' });
      if (error) throw new AppError('internal', `Mesajlar kaydedilemedi: ${error.message}`);
    }
  }
  let deleted = 0;
  if (delta.deletedExternalIds.length) {
    const { data } = await admin
      .from('email_messages')
      .update({ deleted_at: opts.now })
      .eq('account_id', account.id)
      .in('external_message_id', delta.deletedExternalIds)
      .select('id');
    deleted = Array.isArray(data) ? data.length : 0;
  }
  await admin
    .from('sync_states')
    .update({
      ...(delta.nextCursor ? { cursor: delta.nextCursor } : {}),
      backfill_page_token: delta.nextPageToken ?? null,
      ...(!delta.hasMore && !state.backfillUntil ? { backfill_until: opts.now } : {}),
    })
    .eq('id', state.id);
  if (!delta.hasMore && !account.backfill_completed)
    await admin
      .from('connected_accounts')
      .update({ backfill_completed: true })
      .eq('id', account.id);
  return { ...base, ok: true, added, updated, deleted, hasMore: delta.hasMore };
}

function eventRow(account: AccountRow, e: CalendarEventDraft) {
  return {
    user_id: account.user_id,
    account_id: account.id,
    external_event_id: e.externalEventId,
    calendar_id: e.calendarId,
    title: e.title,
    description: e.description ?? null,
    location: e.location ?? null,
    meeting_url: e.meetingUrl ?? null,
    meeting_provider: e.meetingProvider ?? null,
    start_at: e.startAt,
    end_at: e.endAt,
    all_day: e.allDay,
    attendees: e.attendees,
    organizer_is_user: e.organizerIsUser,
    status: e.status,
    provider_updated_at: e.providerUpdatedAt ?? null,
    source: e.source,
    is_ai_created: e.isAiCreated,
    deleted_at: null,
  };
}

async function syncCalendar(
  admin: Db,
  account: AccountRow,
  calendar: ReturnType<typeof providerClients>['calendar'],
  state: SyncState,
  opts: { now: string },
  base: SyncOutcome,
): Promise<SyncOutcome> {
  if (account.controls.readEvents === false) return { ...base, ok: true };
  const delta = await calendar.sync({
    cursor: state.cursor ?? null,
    pageToken: state.backfillPageToken ?? null,
    windowDaysBack: 30,
    windowDaysForward: 60,
    now: opts.now,
  });
  if (delta.fullResyncRequired) {
    await admin
      .from('sync_states')
      .update({ cursor: null, backfill_page_token: null })
      .eq('id', state.id);
    return { ...base, ok: true, hasMore: true };
  }
  const externalIds = [...delta.events.map((e) => e.externalEventId), ...delta.deletedExternalIds];
  const { data: existingRows } = externalIds.length
    ? await admin
        .from('calendar_events')
        .select('*')
        .eq('account_id', account.id)
        .in('external_event_id', externalIds)
    : { data: [] };
  const application = applyCalendarDelta(camelize<CalendarEvent[]>(existingRows ?? []), delta);
  if (application.upserts.length) {
    const { error } = await admin.from('calendar_events').upsert(
      application.upserts.map((e) => eventRow(account, e)),
      { onConflict: 'account_id,external_event_id' },
    );
    if (error) throw new AppError('internal', `Etkinlikler kaydedilemedi: ${error.message}`);
  }
  if (application.deletes.length) {
    await admin
      .from('calendar_events')
      .update({ deleted_at: opts.now, status: 'cancelled' })
      .in(
        'id',
        application.deletes.map((d) => d.id),
      );
  }
  await admin
    .from('sync_states')
    .update({
      ...(delta.nextCursor ? { cursor: delta.nextCursor } : {}),
      backfill_page_token: delta.nextPageToken ?? null,
    })
    .eq('id', state.id);
  return {
    ...base,
    ok: true,
    added: application.upserts.length,
    deleted: application.deletes.length,
    hasMore: delta.hasMore,
  };
}

function taskRow(account: AccountRow, t: TaskDraft) {
  return {
    user_id: account.user_id,
    account_id: account.id,
    external_task_id: t.externalTaskId,
    title: t.title,
    notes: t.notes ?? null,
    due_at: t.dueAt ?? null,
    status: t.status,
    completed_at: t.completedAt ?? null,
    provider: t.provider,
    priority: t.priority,
    source: {
      type: account.provider === 'google' ? 'google_tasks' : 'microsoft_todo',
      id: t.externalTaskId,
      label: account.provider === 'google' ? 'Google Tasks' : 'Microsoft To Do',
      timestamp: t.providerUpdatedAt ?? new Date().toISOString(),
      ...(t.webUrl ? { url: t.webUrl } : {}),
    },
    deleted_at: null,
  };
}

async function syncTasks(
  admin: Db,
  account: AccountRow,
  tasks: ReturnType<typeof providerClients>['tasks'],
  state: SyncState,
  opts: { now: string },
  base: SyncOutcome,
): Promise<SyncOutcome> {
  if (account.controls.readTasks === false) return { ...base, ok: true };
  const delta = await tasks.sync({ cursor: state.cursor ?? null, now: opts.now });
  if (delta.fullResyncRequired) {
    await admin.from('sync_states').update({ cursor: null }).eq('id', state.id);
    return { ...base, ok: true, hasMore: true };
  }
  if (delta.tasks.length) {
    const { error } = await admin.from('tasks').upsert(
      delta.tasks.map((t) => taskRow(account, t)),
      { onConflict: 'account_id,external_task_id' },
    );
    if (error) throw new AppError('internal', `Görevler kaydedilemedi: ${error.message}`);
  }
  if (delta.deletedExternalIds.length)
    await admin
      .from('tasks')
      .update({ deleted_at: opts.now })
      .eq('account_id', account.id)
      .in('external_task_id', delta.deletedExternalIds);
  await admin
    .from('sync_states')
    .update({ ...(delta.nextCursor ? { cursor: delta.nextCursor } : {}) })
    .eq('id', state.id);
  return {
    ...base,
    ok: true,
    added: delta.tasks.length,
    deleted: delta.deletedExternalIds.length,
    hasMore: delta.hasMore,
  };
}
