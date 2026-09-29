/**
 * Briefing generation shared by the on-demand `briefing` function and the scheduled `cron-dispatch briefings` job.
 *
 * 1. Gather today's context (ranked insights, events, follow-ups, commitments, life events, done items).
 * 2. Deterministic fallback briefing (always available, no AI).
 * 3. When an LLM is configured and the budget allows: one structured call that may only re-order and
 *    narrate the candidates we supplied (no invented items — `mergeAiBriefing` enforces it).
 * 4. Persist briefing + items; the audio script is device-TTS ready.
 */
import type {
  Briefing,
  BriefingItem,
  BriefingKind,
  CalendarEvent,
  Commitment,
  FollowUp,
  Insight,
  LifeEvent,
  TaskItem,
  WeeklyMetrics,
} from '@da/domain';
import { briefingAiSchema } from '@da/validation';
import { briefing as briefingPrompt } from '@da/server-core/ai';
import {
  assembleBriefingCandidates,
  composeBriefingFallback,
  mergeAiBriefing,
  toBriefingPromptCandidates,
  type BriefingDraft,
} from '@da/server-core/briefing';
import { AppError } from '@da/server-core/errors';
import { buildWeeklyMetrics } from '@da/server-core/timeSaved';
import { aiConfigured, checkAiBudget, createAi } from './ai.ts';
import { loadLiveInsights, type UserContext } from './context.ts';
import type { Db } from './db.ts';
import { log } from './log.ts';
import { camelize, localDateKey } from './rows.ts';
import { resolvePlan } from './plan.ts';

function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO Monday of the week containing `dateKey`. */
function weekStartOf(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDaysKey(dateKey, -dow);
}

function utcRangeForLocalDay(dateKey: string, timezone: string): { from: string; to: string } {
  // Local midnight → UTC via Intl offset probing (DST-safe for the given day).
  const probe = new Date(`${dateKey}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(probe);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const offsetMin = (hh - 12) * 60 + mm;
  const from = new Date(probe.getTime() - 12 * 3600_000 - offsetMin * 60_000);
  return { from: from.toISOString(), to: new Date(from.getTime() + 86_400_000).toISOString() };
}

export async function latestBriefing(
  db: Db,
  userId: string,
  kind: BriefingKind,
  date: string,
): Promise<Briefing | null> {
  const { data } = await db
    .from('briefings')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('for_date', date)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const b = camelize<Briefing>(data);
  const { data: items } = await db
    .from('briefing_items')
    .select('*')
    .eq('briefing_id', b.id)
    .order('position', { ascending: true });
  return { ...b, items: camelize<BriefingItem[]>(items ?? []) };
}

interface GenerateOptions {
  regenerate?: boolean;
  /** Skip AI even when configured (e.g. cron under budget pressure). */
  fallbackOnly?: boolean;
}

export async function generateBriefing(
  admin: Db,
  ctx: UserContext,
  kind: BriefingKind,
  dateInput: string | undefined,
  opts: GenerateOptions = {},
): Promise<Briefing> {
  const now = new Date().toISOString();
  const today = localDateKey(now, ctx.timezone);
  const date = kind === 'weekly' ? weekStartOf(dateInput ?? today) : (dateInput ?? today);
  const existing = await latestBriefing(admin, ctx.userId, kind, date);
  if (existing && !opts.regenerate) return existing;

  const dayRange = utcRangeForLocalDay(date, ctx.timezone);
  const weekEnd = addDaysKey(date, 6);
  const rangeTo = kind === 'weekly' ? utcRangeForLocalDay(weekEnd, ctx.timezone).to : dayRange.to;
  const lookAhead =
    kind === 'evening' ? utcRangeForLocalDay(addDaysKey(date, 1), ctx.timezone).to : rangeTo;

  const [
    insights,
    completed,
    { data: events },
    { data: followUps },
    { data: commitments },
    { data: lifeEvents },
    { data: tasksDone },
    { count: analyzedEmails },
  ] = await Promise.all([
    loadLiveInsights(admin, ctx.userId),
    admin
      .from('insights')
      .select('*')
      .eq('user_id', ctx.userId)
      .eq('status', 'completed')
      .gte('completed_at', dayRange.from)
      .lt('completed_at', dayRange.to),
    admin
      .from('calendar_events')
      .select('*')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('start_at', dayRange.from)
      .lt('start_at', lookAhead)
      .order('start_at', { ascending: true })
      .limit(200),
    admin
      .from('follow_ups')
      .select('*')
      .eq('user_id', ctx.userId)
      .in('status', ['watching', 'nudge_due', 'snoozed'])
      .limit(100),
    admin
      .from('commitments')
      .select('*')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .in('status', ['open', 'proposed', 'postponed'])
      .limit(100),
    admin
      .from('life_events')
      .select('*')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .in('status', ['upcoming', 'today'])
      .limit(50),
    admin
      .from('tasks')
      .select('*')
      .eq('user_id', ctx.userId)
      .eq('status', 'completed')
      .gte('completed_at', dayRange.from)
      .lt('completed_at', dayRange.to),
    admin
      .from('email_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .gte(
        'last_message_at',
        kind === 'weekly' ? dayRange.from : new Date(Date.parse(now) - 86_400_000).toISOString(),
      ),
  ]);

  const weekly = kind === 'weekly' ? await weeklyMetrics(admin, ctx, date, weekEnd) : null;
  const calendarAccounts = ctx.accounts.filter((a) => a.kinds.includes('calendar')).length;
  const context = {
    insights,
    events: camelize<CalendarEvent[]>(events ?? []),
    followUps: camelize<FollowUp[]>(followUps ?? []),
    commitments: camelize<Commitment[]>(commitments ?? []),
    lifeEvents: camelize<LifeEvent[]>(lifeEvents ?? []),
    completedToday: camelize<Insight[]>(completed ?? []),
    tasksDoneToday: camelize<TaskItem[]>(tasksDone ?? []),
    now,
    timezone: ctx.timezone,
    locale: ctx.locale,
    userName: ctx.firstName || ctx.displayName,
    counts: {
      analyzedEmails: analyzedEmails ?? 0,
      analyzedCalendars: calendarAccounts,
      analyzedDays: kind === 'weekly' ? 7 : 1,
    },
    sinceAt:
      kind === 'midday' ? new Date(Date.parse(dayRange.from) + 6 * 3600_000).toISOString() : null,
    weekly,
    userEmail: ctx.email,
  };

  const candidates = assembleBriefingCandidates(kind, context);
  let draft: BriefingDraft = composeBriefingFallback(kind, candidates, context);
  let producedBy: 'fallback' | 'ai' = 'fallback';

  if (!opts.fallbackOnly && aiConfigured()) {
    try {
      const plan = await resolvePlan(admin, ctx.userId);
      const aiCtx = {
        userId: ctx.userId,
        plan: plan.plan,
        timezone: ctx.timezone,
        locale: ctx.locale,
      };
      await checkAiBudget(aiCtx, 2500);
      const promptCandidates = toBriefingPromptCandidates(candidates, { insights });
      const { data: learned } = await admin
        .from('learned_preferences')
        .select('statement')
        .eq('user_id', ctx.userId)
        .eq('enabled', true)
        .eq('kind', 'briefing_focus')
        .limit(6);
      const spec = briefingPrompt({
        now,
        locale: ctx.locale,
        timezone: ctx.timezone,
        kind,
        date,
        userName: context.userName,
        counts: draft.counts,
        candidates: promptCandidates,
        changesSinceMorning:
          kind === 'midday'
            ? draft.items.filter((i) => i.section === 'changes').map((i) => i.title)
            : undefined,
        completedToday: kind === 'evening' ? context.completedToday.map((i) => i.title) : undefined,
        weekly,
        focus: ((learned ?? []) as { statement: string }[]).map((l) => l.statement),
      });
      const result = await createAi(aiCtx).generateStructured(briefingAiSchema, spec, {
        userId: ctx.userId,
        locale: ctx.locale,
        cacheKey: `briefing:${ctx.userId}:${kind}:${date}:${draft.items.length}:${draft.highlightNumber}`,
        cacheTtlSec: 6 * 3600,
      });
      draft = mergeAiBriefing(
        draft,
        result.data,
        promptCandidates.map((c) => c.id),
      );
      producedBy = 'ai';
    } catch (e) {
      log.warn('briefing ai fallback', { kind, error: e instanceof Error ? e.message : 'unknown' });
    }
  }

  const version = existing ? existing.version + 1 : 1;
  const { data: row, error } = await admin
    .from('briefings')
    .insert({
      user_id: ctx.userId,
      kind,
      for_date: date,
      generated_at: now,
      headline: draft.headline,
      highlight_number: draft.highlightNumber,
      subline: draft.subline,
      mood: draft.mood,
      narrative: draft.narrative,
      outlook: draft.outlook ?? null,
      counts: draft.counts,
      audio: draft.audio ?? null,
      estimated_read_sec: draft.estimatedReadSec,
      weekly: draft.weekly ?? null,
      has_changes: draft.hasChanges,
      version,
      produced_by: producedBy,
    })
    .select('*')
    .single();
  if (error || !row)
    throw new AppError('internal', `Brifing kaydedilemedi: ${error?.message ?? ''}`);
  const saved = camelize<Briefing>(row);
  const itemRows = draft.items.map((it, position) => ({
    briefing_id: saved.id,
    user_id: ctx.userId,
    section: it.section,
    position,
    icon: it.icon,
    title: it.title,
    meta: it.meta ?? null,
    source: it.source ?? null,
    insight_id: it.insightId ?? null,
    entity_type: it.entityType ?? null,
    entity_id: it.entityId ?? null,
    chapter_index: it.chapterIndex ?? null,
    status: it.status ?? null,
  }));
  let items: BriefingItem[] = [];
  if (itemRows.length) {
    const { data: inserted, error: itemErr } = await admin
      .from('briefing_items')
      .insert(itemRows)
      .select('*');
    if (itemErr)
      throw new AppError('internal', `Brifing öğeleri kaydedilemedi: ${itemErr.message}`);
    items = camelize<BriefingItem[]>(inserted ?? []).sort((a, b) => a.position - b.position);
  }
  return { ...saved, items };
}

async function weeklyMetrics(
  admin: Db,
  ctx: UserContext,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyMetrics> {
  const from = utcRangeForLocalDay(weekStart, ctx.timezone).from;
  const to = utcRangeForLocalDay(weekEnd, ctx.timezone).to;
  const [
    { count: analyzedEmails },
    { data: important },
    { data: followUps },
    { data: meetings },
    { data: deadlines },
    { data: drafts },
  ] = await Promise.all([
    admin
      .from('email_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .gte('last_message_at', from)
      .lt('last_message_at', to),
    admin
      .from('insights')
      .select('id, status, kind, due_at, source')
      .eq('user_id', ctx.userId)
      .gte('created_at', from)
      .lt('created_at', to),
    admin
      .from('follow_ups')
      .select('status, counterpart_name')
      .eq('user_id', ctx.userId)
      .gte('sent_at', from)
      .lt('sent_at', to),
    admin
      .from('calendar_events')
      .select('start_at, prep_generated_at, attendees')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('start_at', from)
      .lt('start_at', to),
    admin
      .from('insights')
      .select('status, due_at')
      .eq('user_id', ctx.userId)
      .eq('kind', 'deadline')
      .gte('created_at', from)
      .lt('created_at', to),
    admin
      .from('approval_actions')
      .select('type, status')
      .eq('user_id', ctx.userId)
      .eq('type', 'email_send')
      .gte('created_at', from)
      .lt('created_at', to),
  ]);
  const importantRows = (important ?? []) as {
    status: string;
    kind: string;
    source: { person?: string } | null;
  }[];
  const meetingRows = (meetings ?? []) as {
    start_at: string;
    prep_generated_at: string | null;
    attendees: { name?: string | null; isOrganizer?: boolean }[];
  }[];
  const followRows = (followUps ?? []) as { status: string; counterpart_name: string }[];
  const deadlineRows = (deadlines ?? []) as { status: string; due_at: string | null }[];
  const draftRows = (drafts ?? []) as { status: string }[];
  const nowMs = Date.now();

  const people = new Map<string, number>();
  for (const m of meetingRows)
    for (const a of m.attendees ?? [])
      if (a.name && !a.isOrganizer) people.set(a.name, (people.get(a.name) ?? 0) + 1);
  for (const f of followRows)
    people.set(f.counterpart_name, (people.get(f.counterpart_name) ?? 0) + 1);
  for (const i of importantRows)
    if (i.source?.person) people.set(i.source.person, (people.get(i.source.person) ?? 0) + 1);
  const meetingsByDay: Record<string, number> = {};
  for (const m of meetingRows) {
    const key = localDateKey(m.start_at, ctx.timezone);
    meetingsByDay[key] = (meetingsByDay[key] ?? 0) + 1;
  }
  const nextFrom = to;
  const nextTo = utcRangeForLocalDay(addDaysKey(weekEnd, 7), ctx.timezone).to;
  const [{ count: nextMeetings }, { count: nextDeadlines }] = await Promise.all([
    admin
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('start_at', nextFrom)
      .lt('start_at', nextTo),
    admin
      .from('insights')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .eq('kind', 'deadline')
      .eq('status', 'active')
      .gte('due_at', nextFrom)
      .lt('due_at', nextTo),
  ]);

  return buildWeeklyMetrics({
    weekStart,
    weekEnd,
    analyzedEmails: analyzedEmails ?? 0,
    importantItems: importantRows.length,
    followUps: followRows.length,
    followUpsAnswered: followRows.filter((f) => f.status === 'replied').length,
    meetings: meetingRows.length,
    meetingsWithPrep: meetingRows.filter((m) => m.prep_generated_at).length,
    deadlines: deadlineRows.length,
    deadlinesMissed: deadlineRows.filter(
      (d) => d.status === 'active' && d.due_at && Date.parse(d.due_at) < nowMs,
    ).length,
    timeSaved: {
      unreadLowPriorityMails: Math.max(0, (analyzedEmails ?? 0) - importantRows.length),
      importantSummariesRead: importantRows.filter((i) => i.status === 'completed').length,
      prepNotesGenerated: meetingRows.filter((m) => m.prep_generated_at).length,
      followUpDraftsUsed: followRows.filter((f) => f.status === 'replied' || f.status === 'closed')
        .length,
      repliesDrafted: draftRows.filter((d) => d.status === 'executed').length,
      deadlinesCaught: deadlineRows.filter((d) => d.status === 'completed').length,
    },
    meetingsByDay,
    topPeople: [...people.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    nextWeek: { meetings: nextMeetings ?? 0, deadlines: nextDeadlines ?? 0 },
    locale: ctx.locale,
  });
}
