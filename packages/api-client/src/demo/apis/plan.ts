import type {
  CalendarConflict,
  ISODate,
  PlanDay,
  PlanResponse,
  ScheduleSuggestion,
  TaskItem,
} from '@da/domain';
import { planRequestSchema } from '@da/validation';
import type { PlanApi } from '../../datasource';
import type { DemoContext } from '../context';
import {
  backToBackWarnings,
  computeFreeBlocks,
  eventsBetween,
  eventsOnDay,
  syncConflicts,
  toCalendarConflict,
} from '../core/calendar';
import { completeInsightsFor, isActiveInsight, setInsightStatus } from '../core/insights';
import { getCommitment, getEvent } from '../core/lookup';
import { dueLabel, relativeDayLabel } from '../format';
import type { DemoState } from '../state';
import { notFound, validate } from '../validate';

const SUGGESTION_BLOCK_MINUTES = 150;

function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace('.', ',')} saat`;
}

/** Suggestions already surfaced as Today cards (kind 'suggestion') anchor the Plan so both screens agree. */
function suggestionsFromInsights(
  ctx: DemoContext,
  s: DemoState,
  key: ISODate,
): { suggestions: ScheduleSuggestion[]; coveredTaskIds: Set<string> } {
  const now = ctx.nowIso();
  const suggestions: ScheduleSuggestion[] = [];
  const coveredTaskIds = new Set<string>();
  for (const insight of s.insights) {
    if (insight.kind !== 'suggestion' || !isActiveInsight(insight, now)) continue;
    const plan = insight.actions.find((a) => a.kind === 'plan')?.payload;
    const taskId = typeof plan?.taskId === 'string' ? plan.taskId : insight.entityId;
    const startAt = typeof plan?.startAt === 'string' ? plan.startAt : insight.dueAt;
    const endAt =
      typeof plan?.endAt === 'string'
        ? plan.endAt
        : startAt
          ? ctx.clock.addMinutes(startAt, SUGGESTION_BLOCK_MINUTES)
          : null;
    const task = s.tasks.find(
      (t) => t.id === taskId && !t.deletedAt && t.status === 'open' && !t.scheduledStartAt,
    );
    if (!task || !startAt || !endAt) continue;
    coveredTaskIds.add(task.id);
    if (ctx.clock.dateKey(startAt) !== key) continue;
    suggestions.push({
      id: `sg-insight-${insight.id.slice(-4)}`,
      kind: 'schedule_task',
      title: insight.title,
      detail: insight.subtitle ?? `${task.title} görevini buraya yerleştirebilirim.`,
      proposedStartAt: startAt,
      proposedEndAt: endAt,
      targetEventId: null,
      targetTaskId: task.id,
      reason: insight.priorityReasons[0] ?? 'Takvim zekâsı',
    });
  }
  return { suggestions, coveredTaskIds };
}

function buildSuggestions(
  ctx: DemoContext,
  s: DemoState,
  key: ISODate,
  freeBlocks: PlanDay['freeBlocks'],
): ScheduleSuggestion[] {
  if (key < ctx.clock.today()) return [];
  const anchored = suggestionsFromInsights(ctx, s, key);
  const tasks = s.tasks.filter(
    (t) =>
      !t.deletedAt &&
      t.status === 'open' &&
      !t.scheduledStartAt &&
      !anchored.coveredTaskIds.has(t.id) &&
      (!t.dueAt || ctx.clock.dateKey(t.dueAt) >= key),
  );
  if (!tasks.length) return anchored.suggestions;
  const earliest = ctx.clock.now().getTime() + 60 * 60_000;
  const block = freeBlocks.find(
    (b) =>
      b.minutes >= SUGGESTION_BLOCK_MINUTES &&
      Date.parse(b.endAt) - Math.max(Date.parse(b.startAt), earliest) >=
        SUGGESTION_BLOCK_MINUTES * 60_000,
  );
  if (!block) return anchored.suggestions;
  // Prefer the afternoon slot from the design ("Yarın 14:00–16:30") when the block covers it.
  const preferredStart = ctx.clock.at(key, '14:00').getTime();
  const preferredEnd = ctx.clock.at(key, '16:30').getTime();
  const blockStart = Math.max(Date.parse(block.startAt), earliest);
  const blockEnd = Date.parse(block.endAt);
  const usePreferred = preferredStart >= blockStart && preferredEnd <= blockEnd;
  const start = usePreferred ? preferredStart : blockStart;
  const end = usePreferred
    ? preferredEnd
    : Math.min(blockEnd, blockStart + SUGGESTION_BLOCK_MINUTES * 60_000);
  const minutes = Math.round((end - start) / 60_000);
  const dayLabel = relativeDayLabel(ctx.clock, key);
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const computed = tasks.slice(0, 1).map((task): ScheduleSuggestion => ({
    id: `sg-task-${task.id.slice(-4)}-${key}`,
    kind: 'schedule_task',
    title: `${dayLabel} ${ctx.clock.hhmm(startIso)}–${ctx.clock.hhmm(endIso)} arasında ${hoursLabel(minutes)} boşluğun var.`,
    detail: `${task.title} görevini buraya yerleştirebilirim.`,
    proposedStartAt: startIso,
    proposedEndAt: endIso,
    targetEventId: null,
    targetTaskId: task.id,
    reason: task.dueAt
      ? `${task.title} görevinin son tarihi ${dueLabel(ctx.clock, task.dueAt)}; bu aralıkta toplantın yok.`
      : 'Bu aralıkta toplantın yok.',
  }));
  return [...anchored.suggestions, ...computed];
}

function buildDay(ctx: DemoContext, s: DemoState, key: ISODate): PlanDay {
  const events = eventsOnDay(s, ctx.clock, key);
  const tasks = s.tasks.filter(
    (t) =>
      !t.deletedAt &&
      t.status !== 'cancelled' &&
      ((t.scheduledStartAt && ctx.clock.dateKey(t.scheduledStartAt) === key) ||
        (t.dueAt && ctx.clock.dateKey(t.dueAt) === key)),
  );
  const commitments = s.commitments.filter(
    (c) =>
      !c.deletedAt &&
      (c.status === 'open' || c.status === 'postponed' || c.status === 'proposed') &&
      c.dueAt &&
      ctx.clock.dateKey(c.dueAt) === key,
  );
  const busy = [
    ...events.filter((e) => !e.allDay).map((e) => ({ startAt: e.startAt, endAt: e.endAt })),
    ...tasks
      .filter((t) => t.scheduledStartAt && t.scheduledEndAt)
      .map((t) => ({ startAt: t.scheduledStartAt as string, endAt: t.scheduledEndAt as string })),
  ];
  const freeBlocks = computeFreeBlocks(busy, ctx.clock, key);
  const conflicts = s.conflicts
    .filter((c) => c.status === 'open')
    .map((c) => toCalendarConflict(s, c))
    .filter(
      (c): c is CalendarConflict => c !== null && ctx.clock.dateKey(c.eventA.startAt) === key,
    );
  return {
    date: key,
    events,
    tasks,
    commitments,
    freeBlocks,
    suggestions: buildSuggestions(ctx, s, key, freeBlocks),
    conflicts,
    backToBackWarnings: backToBackWarnings(events.filter((e) => !e.allDay)),
  };
}

export function createPlanApi(ctx: DemoContext): PlanApi {
  const conflictsOf = (s: DemoState): CalendarConflict[] =>
    s.conflicts
      .filter((c) => c.status !== 'resolved')
      .map((c) => toCalendarConflict(s, c))
      .filter((c): c is CalendarConflict => c !== null);

  return {
    getPlan: (input) =>
      ctx.run((): PlanResponse => {
        const clean = validate(planRequestSchema, input);
        ctx.store.mutate((s) => syncConflicts(s, ctx.clock, () => ctx.nextId(), ctx.nowIso()));
        const s = ctx.store.state;
        const keys =
          clean.range === 'day'
            ? [clean.date]
            : Array.from({ length: 7 }, (_, i) =>
                ctx.clock.addDays(ctx.clock.weekStart(clean.date), i),
              );
        const days = keys.map((key) => buildDay(ctx, s, key));
        return {
          days,
          suggestions: days.flatMap((d) => d.suggestions),
          conflicts: days.flatMap((d) => d.conflicts),
        };
      }),
    listTasks: (input) =>
      ctx.run(() =>
        ctx.store.state.tasks
          .filter((t) => !t.deletedAt && (!input?.status || t.status === input.status))
          .sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))
          .map((t) => ({ ...t })),
      ),
    completeTask: (id, completed) =>
      ctx.run(() =>
        ctx.store.mutate((s): TaskItem => {
          const task = s.tasks.find((t) => t.id === id && !t.deletedAt);
          if (!task) throw notFound('Görev', id);
          const now = ctx.nowIso();
          task.status = completed ? 'completed' : 'open';
          task.completedAt = completed ? now : null;
          task.updatedAt = now;
          if (completed) {
            completeInsightsFor(s, 'task', id, now);
            completeInsightsFor(s, 'suggestion', id, now);
          }
          return { ...task };
        }),
      ),
    listCommitments: (input) =>
      ctx.run(() =>
        ctx.store.state.commitments
          .filter((c) => !c.deletedAt && (!input?.status || c.status === input.status))
          .sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))
          .map((c) => ({ ...c })),
      ),
    getCommitment: (id) => ctx.run(() => ({ ...getCommitment(ctx.store.state, id) })),
    completeCommitment: (id) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const c = getCommitment(s, id);
          const now = ctx.nowIso();
          c.status = 'completed';
          c.completedAt = now;
          c.updatedAt = now;
          completeInsightsFor(s, 'commitment', id, now);
          return { ...c };
        }),
      ),
    postponeCommitment: (id, until) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const c = getCommitment(s, id);
          const now = ctx.nowIso();
          c.status = 'postponed';
          c.postponedUntil = until;
          c.dueAt = until;
          c.dueText = dueLabel(ctx.clock, until);
          c.updatedAt = now;
          for (const i of s.insights) {
            if (i.entityType === 'commitment' && i.entityId === id) {
              i.dueAt = until;
              i.timeLabel = dueLabel(ctx.clock, until);
              i.forDate =
                ctx.clock.dateKey(until) > ctx.clock.today() ? ctx.clock.dateKey(until) : i.forDate;
              i.updatedAt = now;
            }
          }
          return { ...c };
        }),
      ),
    confirmCommitment: (id, accept) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const c = getCommitment(s, id);
          const now = ctx.nowIso();
          c.status = accept ? 'open' : 'cancelled';
          c.updatedAt = now;
          if (!accept)
            for (const i of s.insights)
              if (i.entityType === 'commitment' && i.entityId === id)
                setInsightStatus(s, i.id, 'dismissed', now);
          return { ...c };
        }),
      ),
    listConflicts: () =>
      ctx.run(() => {
        ctx.store.mutate((s) => syncConflicts(s, ctx.clock, () => ctx.nextId(), ctx.nowIso()));
        return conflictsOf(ctx.store.state);
      }),
    getConflict: (id) =>
      ctx.run(() => {
        const s = ctx.store.state;
        const stored = s.conflicts.find((c) => c.id === id);
        const conflict = stored ? toCalendarConflict(s, stored) : null;
        if (!conflict) throw notFound('Çakışma', id);
        return conflict;
      }),
    ignoreConflict: (id) =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const stored = s.conflicts.find((c) => c.id === id);
          if (!stored) throw notFound('Çakışma', id);
          stored.status = 'ignored';
          const now = ctx.nowIso();
          for (const i of s.insights)
            if (i.entityType === 'conflict' && i.entityId === id && i.status === 'active')
              setInsightStatus(s, i.id, 'dismissed', now);
          const conflict = toCalendarConflict(s, stored);
          if (!conflict) throw notFound('Çakışma', id);
          return conflict;
        }),
      ),
    getEvent: (id) => ctx.run(() => ({ ...getEvent(ctx.store.state, id) })),
    listEvents: (input) =>
      ctx.run(() => eventsBetween(ctx.store.state, input.from, input.to).map((e) => ({ ...e }))),
  };
}
