/**
 * GET /plan?date&range — Plan tab: per-day timeline (events, tasks, promises), free blocks, deterministic
 * schedule suggestions ("Yarın 14:00–16:30 arasında 2,5 saat boşluğun var."), back-to-back warnings and
 * conflicts with resolution options. Nothing is written to any calendar here — every suggestion becomes an
 * approval when the user taps it.
 */
import type {
  CalendarConflict,
  CalendarEvent,
  Commitment,
  PlanDay,
  PlanResponse,
  ScheduleSuggestion,
  TaskItem,
} from '@da/domain';
import { planRequestSchema } from '@da/validation';
import {
  detectBackToBack,
  detectConflicts,
  freeBlocks,
  resolveConflictOptions,
  scheduleSuggestions,
} from '@da/server-core/calendar';
import { AppError } from '@da/server-core/errors';
import { loadUserContext } from '../_shared/context.ts';
import {
  adminClient,
  assertMethod,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';
import { camelize, localDateKey } from '../_shared/rows.ts';

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const input = await parseInput(req, planRequestSchema);
    const ctx = await loadUserContext(db, user.id);
    const now = new Date().toISOString();
    const days = input.range === 'week' ? 7 : 1;
    const dateKeys = Array.from({ length: days }, (_, i) => addDays(input.date, i));
    // Wide UTC window (±1 day) so timezone edges never drop an event; grouping happens by local date below.
    const from = new Date(`${addDays(input.date, -1)}T00:00:00Z`).toISOString();
    const to = new Date(`${addDays(input.date, days + 1)}T00:00:00Z`).toISOString();

    const [
      { data: eventRows, error },
      { data: taskRows },
      { data: commitmentRows },
      { data: conflictRows },
    ] = await Promise.all([
      db
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('start_at', from)
        .lt('start_at', to)
        .order('start_at', { ascending: true })
        .limit(500),
      db
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .eq('status', 'open')
        .limit(200),
      db
        .from('commitments')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('status', ['open', 'proposed', 'postponed'])
        .limit(200),
      db.from('calendar_conflicts').select('*').eq('user_id', user.id).eq('status', 'ignored'),
    ]);
    if (error) throw new AppError('internal', `Takvim okunamadı: ${error.message}`);
    const events = camelize<CalendarEvent[]>(eventRows ?? []).filter(
      (e) => e.status !== 'cancelled',
    );
    const tasks = camelize<TaskItem[]>(taskRows ?? []);
    const commitments = camelize<Commitment[]>(commitmentRows ?? []);
    const ignoredPairs = new Set(
      ((conflictRows ?? []) as { event_a_id: string; event_b_id: string }[]).map(
        (c) => `${c.event_a_id}:${c.event_b_id}`,
      ),
    );
    const userEmail = ctx.email;

    const admin = adminClient();
    const planDays: PlanDay[] = [];
    const allSuggestions: ScheduleSuggestion[] = [];
    const allConflicts: CalendarConflict[] = [];

    for (const date of dateKeys) {
      const dayEvents = events.filter((e) => localDateKey(e.startAt, ctx.timezone) === date);
      const blocks = freeBlocks(dayEvents, { date, timezone: ctx.timezone, now, userEmail });
      const dayTasks = tasks.filter(
        (t) =>
          (t.scheduledStartAt && localDateKey(t.scheduledStartAt, ctx.timezone) === date) ||
          (t.dueAt && localDateKey(t.dueAt, ctx.timezone) === date),
      );
      const dayCommitments = commitments.filter(
        (c) => c.dueAt && localDateKey(c.dueAt, ctx.timezone) === date,
      );
      const suggestions = scheduleSuggestions({
        tasks,
        commitments,
        freeBlocks: blocks,
        events: dayEvents,
        now,
        timezone: ctx.timezone,
        locale: ctx.locale,
        userEmail,
      });
      const detected = detectConflicts(dayEvents, { userEmail });
      const conflicts: CalendarConflict[] = [];
      for (const c of detected) {
        if (
          ignoredPairs.has(`${c.eventA.id}:${c.eventB.id}`) ||
          ignoredPairs.has(`${c.eventB.id}:${c.eventA.id}`)
        )
          continue;
        const options = resolveConflictOptions(c, blocks, {
          locale: ctx.locale,
          timezone: ctx.timezone,
          now,
          userEmail,
        });
        const withSuggestions: CalendarConflict = {
          ...c,
          suggestions: options
            .map((o) => o.suggestion)
            .filter((s): s is ScheduleSuggestion => Boolean(s)),
        };
        // Persist so /conflict/[id] and "Yoksay" have a stable id.
        const { data: saved } = await admin
          .from('calendar_conflicts')
          .upsert(
            {
              user_id: user.id,
              event_a_id: c.eventA.id,
              event_b_id: c.eventB.id,
              overlap_minutes: c.overlapMinutes,
              suggestions: withSuggestions.suggestions,
              status: 'open',
            },
            { onConflict: 'user_id,event_a_id,event_b_id', ignoreDuplicates: false },
          )
          .select('id, status')
          .maybeSingle();
        const row = saved as { id: string; status: CalendarConflict['status'] } | null;
        if (row?.status === 'ignored') continue;
        conflicts.push({
          ...withSuggestions,
          id: row?.id ?? withSuggestions.id,
          status: row?.status ?? 'open',
        });
      }
      const backToBack = detectBackToBack(dayEvents, { userEmail }).map((w) => ({
        fromEventId: w.fromEventId,
        toEventId: w.toEventId,
      }));
      planDays.push({
        date,
        events: dayEvents,
        tasks: dayTasks,
        commitments: dayCommitments,
        freeBlocks: blocks,
        suggestions,
        conflicts,
        backToBackWarnings: backToBack,
      });
      allSuggestions.push(...suggestions);
      allConflicts.push(...conflicts);
    }

    const response: PlanResponse = {
      days: planDays,
      suggestions: allSuggestions.slice(0, 8),
      conflicts: allConflicts,
    };
    return json(response);
  }),
);
