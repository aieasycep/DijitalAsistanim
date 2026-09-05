/**
 * Scheduled jobs driven by pg_cron → cron-dispatch. Each job is idempotent and bounded per tick.
 */
import type { BriefingKind, BriefingSchedule, FollowUp, SyncState } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import { followUpDueAt, refreshFollowUpStatus, waitingDays } from '@da/server-core/followups';
import {
  buildEveningNotification,
  buildFollowUpNotification,
  buildMiddayNotification,
  buildMorningNotification,
  buildReminderNotification,
  buildWeeklyNotification,
  dueBriefings,
} from '@da/server-core/notifications';
import {
  createGmailClient,
  createGraphClient,
  GRAPH_MAX_SUBSCRIPTION_MINUTES,
} from '@da/server-core/providers';
import {
  exportBundleManifest,
  exportUrlExpiry,
  EXPORT_EXCLUDED_TABLES,
} from '@da/server-core/retention';
import {
  initialAnalysisWindow,
  needsSubscription,
  selectDueStates,
  subscriptionRenewalDue,
} from '@da/server-core/sync';
import { generateBriefing } from '../briefing.ts';
import { loadUserContext } from '../context.ts';
import { loadCredentials } from '../credentials.ts';
import type { Db } from '../db.ts';
import { getEnv } from '../env.ts';
import { log } from '../log.ts';
import { resolvePlan } from '../plan.ts';
import { loadPushTarget, sendPush } from '../push.ts';
import { camelize, localDateKey } from '../rows.ts';
import { runPipeline } from './pipeline.ts';
import { runSync } from './sync.ts';

export interface JobResult {
  processed: number;
  details?: Record<string, number | string>;
}

const USER_PAGE = 200;

async function* activeUsers(admin: Db): AsyncGenerator<{ id: string; timezone: string }> {
  let from = 0;
  for (;;) {
    const { data } = await admin
      .from('profiles')
      .select('id, timezone')
      .not('onboarding_completed_at', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, from + USER_PAGE - 1);
    const rows = (data ?? []) as { id: string; timezone: string }[];
    for (const r of rows) yield r;
    if (rows.length < USER_PAGE) return;
    from += USER_PAGE;
  }
}

// --- Briefings ---------------------------------------------------------------------------------------

export async function runBriefingsJob(admin: Db, now: string): Promise<JobResult> {
  let processed = 0;
  let sent = 0;
  for await (const u of activeUsers(admin)) {
    try {
      const ctx = await loadUserContext(admin, u.id);
      const schedule = ctx.preferences?.briefing as BriefingSchedule | undefined;
      if (!schedule) continue;
      const { data: logRows } = await admin
        .from('briefing_send_log')
        .select('kind, local_date')
        .eq('user_id', u.id)
        .gte('local_date', localDateKey(new Date(Date.parse(now) - 8 * 86_400_000), ctx.timezone));
      const lastSent: Partial<Record<BriefingKind, string>> = {};
      for (const r of (logRows ?? []) as { kind: BriefingKind; local_date: string }[]) {
        if (!lastSent[r.kind] || (lastSent[r.kind] as string) < r.local_date)
          lastSent[r.kind] = r.local_date;
      }
      const due = dueBriefings({ schedule, timezone: ctx.timezone, now, lastSent });
      if (due.length === 0) continue;
      const plan = await resolvePlan(admin, u.id);
      const isPro = plan.plan === 'pro';
      const today = localDateKey(now, ctx.timezone);
      for (const kind of due) {
        processed += 1;
        if (kind !== 'morning' && !isPro) {
          await admin
            .from('briefing_send_log')
            .upsert(
              { user_id: u.id, kind, local_date: today, sent_at: now, briefing_id: null },
              { onConflict: 'user_id,kind,local_date' },
            );
          continue;
        }
        const briefing = await generateBriefing(admin, ctx, kind, today);
        await admin
          .from('briefing_send_log')
          .upsert(
            { user_id: u.id, kind, local_date: today, sent_at: now, briefing_id: briefing.id },
            { onConflict: 'user_id,kind,local_date' },
          );
        const target = await loadPushTarget(admin, u.id, { isPro, timezone: ctx.timezone });
        if (!target) continue;
        const nctx = { locale: ctx.locale, timezone: ctx.timezone, now };
        const payload =
          kind === 'morning'
            ? buildMorningNotification(
                { count: briefing.highlightNumber, briefingId: briefing.id },
                nctx,
              )
            : kind === 'midday'
              ? buildMiddayNotification(
                  { count: briefing.highlightNumber, briefingId: briefing.id },
                  nctx,
                )
              : kind === 'evening'
                ? buildEveningNotification(
                    { count: briefing.highlightNumber, briefingId: briefing.id },
                    nctx,
                  )
                : buildWeeklyNotification(
                    {
                      important: briefing.weekly?.importantItems ?? briefing.highlightNumber,
                      timeSavedMinutes: briefing.weekly?.estimatedTimeSavedMinutes ?? 0,
                      briefingId: briefing.id,
                    },
                    nctx,
                  );
        if (kind === 'midday' && !briefing.hasChanges) continue;
        const res = await sendPush(admin, target, payload);
        if (res.status === 'sent') sent += 1;
      }
    } catch (e) {
      log.warn('briefing job user failed', { error: e instanceof Error ? e.message : 'unknown' });
    }
  }
  return { processed, details: { sent } };
}

// --- Reminders --------------------------------------------------------------------------------------

export async function runRemindersJob(admin: Db, now: string): Promise<JobResult> {
  const { data } = await admin
    .from('reminders')
    .select('*')
    .eq('status', 'scheduled')
    .lte('remind_at', now)
    .order('remind_at', { ascending: true })
    .limit(200);
  const rows = (data ?? []) as {
    id: string;
    user_id: string;
    title: string;
    target_type: string | null;
    target_id: string | null;
  }[];
  let sent = 0;
  const targets = new Map<
    string,
    Awaited<ReturnType<typeof loadPushTarget>> & { locale: 'tr' | 'en' }
  >();
  for (const r of rows) {
    let target = targets.get(r.user_id);
    if (target === undefined) {
      const ctx = await loadUserContext(admin, r.user_id);
      const plan = await resolvePlan(admin, r.user_id);
      const t = await loadPushTarget(admin, r.user_id, {
        isPro: plan.plan === 'pro',
        timezone: ctx.timezone,
      });
      target = t ? { ...t, locale: ctx.locale } : (null as never);
      targets.set(r.user_id, target);
    }
    const deepLink =
      r.target_type === 'email_thread' && r.target_id
        ? `/email/${r.target_id}`
        : r.target_type === 'calendar_event' && r.target_id
          ? `/meeting/${r.target_id}/prep`
          : r.target_type === 'commitment'
            ? '/commitments'
            : r.target_type === 'life_event' && r.target_id
              ? `/life/${r.target_id}`
              : null;
    if (target) {
      const res = await sendPush(
        admin,
        target,
        buildReminderNotification(
          { reminderId: r.id, title: r.title, deepLink },
          { locale: target.locale, timezone: target.timezone, now },
        ),
        { isCritical: true },
      );
      if (res.status === 'sent') sent += 1;
    }
    await admin.from('reminders').update({ status: 'fired', fired_at: now }).eq('id', r.id);
  }
  return { processed: rows.length, details: { sent } };
}

// --- Follow-ups -------------------------------------------------------------------------------------

export async function runFollowUpsJob(admin: Db, now: string): Promise<JobResult> {
  await admin.schema('internal').rpc('expire_approvals');
  const { data } = await admin
    .from('follow_ups')
    .select('*')
    .in('status', ['watching', 'snoozed', 'nudge_due'])
    .limit(500);
  const rows = camelize<(FollowUp & { lastNudgedAt?: string | null })[]>(data ?? []);
  let nudged = 0;
  let processed = 0;
  const byUser = new Map<string, { timezone: string; locale: 'tr' | 'en'; isPro: boolean }>();
  for (const f of rows) {
    let u = byUser.get(f.userId);
    if (!u) {
      const ctx = await loadUserContext(admin, f.userId);
      const plan = await resolvePlan(admin, f.userId);
      u = { timezone: ctx.timezone, locale: ctx.locale, isPro: plan.plan === 'pro' };
      byUser.set(f.userId, u);
    }
    const refreshed = refreshFollowUpStatus(f, now, u.timezone);
    if (refreshed.status !== f.status) {
      await admin.from('follow_ups').update({ status: refreshed.status }).eq('id', f.id);
      processed += 1;
    }
    if (refreshed.status !== 'nudge_due') continue;
    const lastNudged = f.lastNudgedAt ? Date.parse(f.lastNudgedAt) : 0;
    if (Date.parse(now) - lastNudged < 86_400_000) continue;
    if (Date.parse(followUpDueAt(f, u.timezone)) > Date.parse(now)) continue;
    const target = await loadPushTarget(admin, f.userId, { isPro: u.isPro, timezone: u.timezone });
    if (target) {
      const res = await sendPush(
        admin,
        target,
        buildFollowUpNotification(
          {
            followUpId: f.id,
            person: f.counterpartName,
            days: waitingDays(f, now, u.timezone),
            threadId: f.threadId,
          },
          { locale: u.locale, timezone: u.timezone, now },
        ),
      );
      if (res.status === 'sent') nudged += 1;
    }
    await admin.from('follow_ups').update({ last_nudged_at: now }).eq('id', f.id);
  }
  return { processed, details: { nudged } };
}

// --- Sync poll --------------------------------------------------------------------------------------

export async function runSyncPollJob(
  admin: Db,
  now: string,
  filter: { userId?: string; accountId?: string; resource?: SyncState['resource'] } = {},
): Promise<JobResult> {
  let q = admin.from('sync_states').select('*').neq('resource', 'notifications');
  if (filter.userId) q = q.eq('user_id', filter.userId);
  if (filter.accountId) q = q.eq('account_id', filter.accountId);
  if (filter.resource) q = q.eq('resource', filter.resource);
  const { data } = await q.limit(2000);
  const states = camelize<SyncState[]>(data ?? []);
  const plans = new Map<string, boolean>();
  for (const s of states) {
    if (!plans.has(s.userId))
      plans.set(s.userId, (await resolvePlan(admin, s.userId)).plan === 'pro');
  }
  const due = selectDueStates(states, {
    now,
    isProByUser: (id) => plans.get(id) ?? false,
    limit: 25,
  });
  const touchedUsers = new Set<string>();
  let ok = 0;
  for (const state of due) {
    const outcome = await runSync(admin, state, { now });
    if (outcome.ok) ok += 1;
    if (outcome.ok && (outcome.added > 0 || outcome.updated > 0 || outcome.deleted > 0))
      touchedUsers.add(state.userId);
  }
  for (const userId of touchedUsers) {
    try {
      await runPipeline(admin, userId, { now, reason: 'sync' });
    } catch (e) {
      log.warn('pipeline failed after sync', { error: e instanceof Error ? e.message : 'unknown' });
    }
  }
  return { processed: due.length, details: { ok, pipelines: touchedUsers.size } };
}

// --- Webhook subscriptions ------------------------------------------------------------------------------

export async function runRenewSubscriptionsJob(admin: Db, now: string): Promise<JobResult> {
  const env = getEnv();
  const gmailPush = Boolean(env.google.pubsubTopic && env.google.pubsubVerificationToken);
  const graphPush = Boolean(env.microsoft.webhookUrl && env.microsoft.webhookClientState);
  if (!gmailPush && !graphPush)
    return { processed: 0, details: { skipped: 'webhooks_not_configured' } };
  const { data } = await admin
    .from('sync_states')
    .select('*, connected_accounts!inner(provider, deleted_at)')
    .in('resource', ['mail', 'calendar'])
    .is('connected_accounts.deleted_at', null)
    .limit(1000);
  const rows = (data ?? []) as (Record<string, unknown> & {
    connected_accounts: { provider: string };
  })[];
  let processed = 0;
  for (const row of rows) {
    const state = camelize<SyncState>(row);
    const provider = row.connected_accounts.provider;
    const wantsWebhook =
      (provider === 'google' && gmailPush && state.resource === 'mail') ||
      (provider === 'microsoft' && graphPush);
    if (!wantsWebhook) continue;
    const candidate = { ...state, mode: 'webhook' as const };
    if (!needsSubscription(candidate) && !subscriptionRenewalDue(candidate, now)) continue;
    try {
      const creds = await loadCredentials(admin, state.accountId, { actor: 'cron' });
      const fetchImpl = (input: string, init: RequestInit) => fetch(input, init);
      if (provider === 'google') {
        const gmail = createGmailClient(fetchImpl, creds.accessToken, {});
        const watch = await gmail.watch({
          topicName: env.google.pubsubTopic as string,
          labelIds: ['INBOX'],
        });
        await admin
          .from('sync_states')
          .update({
            mode: 'webhook',
            subscription_id: watch.subscriptionId,
            subscription_expires_at: watch.expiresAt,
          })
          .eq('id', state.id);
      } else {
        const graph = createGraphClient(fetchImpl, creds.accessToken, {});
        const resource =
          state.resource === 'mail' ? '/me/mailFolders/inbox/messages' : '/me/events';
        const result = state.subscriptionId
          ? await graph.subscriptions
              .renew(state.subscriptionId, GRAPH_MAX_SUBSCRIPTION_MINUTES, now)
              .catch(() => null)
          : null;
        const sub =
          result ??
          (await graph.subscriptions.create({
            resource,
            changeType: 'created,updated,deleted',
            notificationUrl: env.microsoft.webhookUrl as string,
            clientState: env.microsoft.webhookClientState as string,
            expirationMinutes: GRAPH_MAX_SUBSCRIPTION_MINUTES,
            now,
          }));
        await admin
          .from('sync_states')
          .update({
            mode: 'webhook',
            subscription_id: sub.subscriptionId,
            subscription_expires_at: sub.expiresAt,
          })
          .eq('id', state.id);
      }
      processed += 1;
    } catch (e) {
      log.warn('subscription renewal failed', {
        accountId: state.accountId,
        error: e instanceof AppError ? e.code : 'unknown',
      });
      await admin
        .from('sync_states')
        .update({ mode: 'polling', subscription_id: null, subscription_expires_at: null })
        .eq('id', state.id);
    }
  }
  return { processed };
}

// --- Retention --------------------------------------------------------------------------------------

export async function runRetentionJob(admin: Db, now: string): Promise<JobResult> {
  const { data, error } = await admin.schema('internal').rpc('run_retention_cleanup');
  if (error) throw new AppError('internal', `Saklama temizliği başarısız: ${error.message}`);
  const rows = (data ?? []) as {
    user_id: string;
    deleted_threads: number;
    deleted_messages: number;
    deleted_memory: number;
    deleted_captures: number;
  }[];
  // Storage objects of soft-deleted captures
  const { data: captures } = await admin
    .from('captures')
    .select('id, user_id, storage_path')
    .not('deleted_at', 'is', null)
    .not('storage_path', 'is', null)
    .limit(500);
  let removedFiles = 0;
  for (const c of (captures ?? []) as { id: string; storage_path: string }[]) {
    const { error: rmErr } = await admin.storage.from('captures').remove([c.storage_path]);
    if (!rmErr) {
      await admin
        .from('captures')
        .update({ storage_path: null, extracted_text: null })
        .eq('id', c.id);
      removedFiles += 1;
    }
  }
  // Expired exports
  const { data: expired } = await admin
    .from('data_export_requests')
    .select('id, storage_path')
    .eq('status', 'expired')
    .not('storage_path', 'is', null)
    .limit(200);
  for (const e of (expired ?? []) as { id: string; storage_path: string }[]) {
    await admin.storage.from('exports').remove([e.storage_path]);
    await admin
      .from('data_export_requests')
      .update({ storage_path: null, download_url: null })
      .eq('id', e.id);
  }
  void now;
  return {
    processed: rows.length,
    details: {
      removedFiles,
      threads: rows.reduce((s, r) => s + r.deleted_threads, 0),
      messages: rows.reduce((s, r) => s + r.deleted_messages, 0),
    },
  };
}

// --- Exports ------------------------------------------------------------------------------------------

const EXPORT_TABLES = [
  'profiles',
  'user_preferences',
  'notification_preferences',
  'connected_accounts',
  'contacts',
  'vip_people',
  'priority_rules',
  'learned_preferences',
  'email_threads',
  'email_messages',
  'calendar_events',
  'tasks',
  'reminders',
  'commitments',
  'follow_ups',
  'life_events',
  'insights',
  'briefings',
  'briefing_items',
  'approval_actions',
  'assistant_threads',
  'assistant_messages',
  'memory_chunks',
  'captures',
  'post_meeting_notes',
  'subscriptions',
  'referral_credits',
  'audit_logs',
];

export async function runExportsJob(admin: Db, now: string): Promise<JobResult> {
  const { data } = await admin
    .from('data_export_requests')
    .select('id, user_id')
    .eq('status', 'requested')
    .order('created_at', { ascending: true })
    .limit(5);
  const requests = (data ?? []) as { id: string; user_id: string }[];
  let processed = 0;
  for (const req of requests) {
    await admin.from('data_export_requests').update({ status: 'processing' }).eq('id', req.id);
    try {
      const manifest = exportBundleManifest(
        EXPORT_TABLES.filter((t) => !(EXPORT_EXCLUDED_TABLES as readonly string[]).includes(t)),
      );
      const bundle: Record<string, unknown> = {
        exportedAt: now,
        format: 'json',
        manifest,
        tables: {} as Record<string, unknown[]>,
      };
      const tables = bundle.tables as Record<string, unknown[]>;
      for (const t of manifest.tables) {
        const column = t.name === 'profiles' ? 'id' : 'user_id';
        const rows: unknown[] = [];
        for (let from = 0; ; from += 1000) {
          const { data: page, error } = await admin
            .from(t.name)
            .select('*')
            .eq(column, req.user_id)
            .range(from, from + 999);
          if (error) throw new AppError('internal', `${t.name}: ${error.message}`);
          const list = (page ?? []) as Record<string, unknown>[];
          for (const row of list) {
            if (t.name === 'memory_chunks') delete row.embedding;
            rows.push(row);
          }
          if (list.length < 1000) break;
        }
        tables[t.name] = rows;
      }
      const body = new TextEncoder().encode(JSON.stringify(bundle, null, 2));
      const path = `${req.user_id}/${req.id}.json`;
      const { error: upErr } = await admin.storage
        .from('exports')
        .upload(path, body, { contentType: 'application/json', upsert: true });
      if (upErr) throw new AppError('internal', `Yükleme başarısız: ${upErr.message}`);
      const { data: signed } = await admin.storage.from('exports').createSignedUrl(path, 24 * 3600);
      await admin
        .from('data_export_requests')
        .update({
          status: 'ready',
          storage_path: path,
          download_url: signed?.signedUrl ?? null,
          url_expires_at: exportUrlExpiry(now),
          completed_at: now,
          size_bytes: body.byteLength,
        })
        .eq('id', req.id);
      processed += 1;
    } catch (e) {
      log.warn('export failed', {
        requestId: req.id,
        error: e instanceof Error ? e.message : 'unknown',
      });
      await admin
        .from('data_export_requests')
        .update({ status: 'failed', failure_reason: e instanceof AppError ? e.code : 'internal' })
        .eq('id', req.id);
    }
  }
  return { processed };
}

// --- Initial analysis (backfill) ---------------------------------------------------------------------------

/**
 * Without `userId` (scheduled tick): resume stale runs (a function instance died mid-analysis).
 * With `userId`: run the first analysis for that user now.
 */
export async function runBackfillJob(
  admin: Db,
  now: string,
  input: { userId?: string },
): Promise<JobResult> {
  if (!input.userId) {
    const staleBefore = new Date(Date.parse(now) - 15 * 60_000).toISOString();
    const { data: stale } = await admin
      .from('first_analysis_runs')
      .select('user_id')
      .not('step', 'in', '("done","failed")')
      .lt('started_at', staleBefore)
      .limit(3);
    let processed = 0;
    for (const r of (stale ?? []) as { user_id: string }[]) {
      await admin
        .from('first_analysis_runs')
        .update({ started_at: now, error: null })
        .eq('user_id', r.user_id);
      const res = await runBackfillJob(admin, now, { userId: r.user_id });
      processed += res.processed;
    }
    return { processed, details: { resumed: (stale ?? []).length } };
  }
  const userId = input.userId;
  const { data: runRow } = await admin
    .from('first_analysis_runs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  const run = runRow as { window_hours: number; step: string } | null;
  const windowHours = run?.window_hours ?? 72;
  const setStep = (step: string, patch: Record<string, unknown> = {}) =>
    admin
      .from('first_analysis_runs')
      .update({ step, ...patch })
      .eq('user_id', userId);
  try {
    const window = initialAnalysisWindow({ now, windowHours });
    const { data: states } = await admin
      .from('sync_states')
      .select('*')
      .eq('user_id', userId)
      .in('resource', ['mail', 'calendar', 'tasks']);
    const list = camelize<SyncState[]>(states ?? []);
    // Mail first (bounded pages), then calendar, then tasks.
    for (const resource of ['mail', 'calendar', 'tasks'] as const) {
      if (resource === 'calendar') await setStep('calendar');
      for (const state of list.filter((s) => s.resource === resource)) {
        let pages = 0;
        let current = state;
        for (;;) {
          const outcome = await runSync(admin, current, {
            now,
            backfillWindowHours: window.windowHours,
          });
          pages += 1;
          if (!outcome.ok || !outcome.hasMore || pages >= 6) break;
          const { data: fresh } = await admin
            .from('sync_states')
            .select('*')
            .eq('id', state.id)
            .maybeSingle();
          if (!fresh) break;
          current = camelize<SyncState>(fresh);
        }
      }
      if (resource === 'mail') {
        const { count } = await admin
          .from('email_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('deleted_at', null);
        await setStep('classifying', { emails_found: count ?? 0 });
        await runPipeline(admin, userId, { now, reason: 'initial' });
        const { count: important } = await admin
          .from('email_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('importance', ['critical', 'high']);
        await admin
          .from('first_analysis_runs')
          .update({ potential_important: important ?? 0 })
          .eq('user_id', userId);
      }
    }
    const { count: events } = await admin
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('start_at', now);
    await setStep('open_loops', { upcoming_events: events ?? 0 });
    await runPipeline(admin, userId, { now, reason: 'initial' });
    const { count: followUps } = await admin
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['watching', 'nudge_due']);
    const ctx = await loadUserContext(admin, userId);
    const briefing = await generateBriefing(admin, ctx, 'morning', undefined, { regenerate: true });
    await setStep('done', {
      possible_follow_ups: followUps ?? 0,
      completed_at: now,
      briefing_id: briefing.id,
      error: null,
    });
    await admin
      .from('profiles')
      .update({ first_analysis_completed_at: now })
      .eq('id', userId)
      .is('first_analysis_completed_at', null);
    return { processed: 1 };
  } catch (e) {
    const code = e instanceof AppError ? e.code : 'internal';
    log.warn('initial analysis failed', { userId, code });
    await setStep('failed', { error: code, completed_at: now });
    return { processed: 0, details: { error: code } };
  }
}
