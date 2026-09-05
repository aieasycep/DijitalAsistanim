import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type { CalendarConflict, PlanDay, ScheduleSuggestion } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';
import { useFormatCtx } from '../flow/useFormatCtx';
import { todayKey, weekKeys, weekStartOf } from './dates';

export type PlanRange = 'day' | 'week';

/**
 * One week query serves both modes: the day view picks its PlanDay out of the week, so switching
 * Gün ↔ Hafta and tapping day chips never refetches, and the top suggestion can live on another day.
 */
export function usePlan(initialDate?: string | null) {
  const ds = useDataSource();
  const ctx = useFormatCtx();
  const today = todayKey(ctx);
  const [range, setRange] = useState<PlanRange>('day');
  const [date, setDate] = useState<string>(
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : today,
  );
  const weekStart = weekStartOf(date);

  const query = useQuery({
    queryKey: qk.plan(weekStart, 'week'),
    queryFn: () => ds.plan.getPlan({ date: weekStart, range: 'week' }),
  });

  const days = useMemo<PlanDay[]>(() => {
    const byKey = new Map((query.data?.days ?? []).map((d) => [d.date, d] as const));
    return weekKeys(weekStart).map(
      (key) =>
        byKey.get(key) ?? {
          date: key,
          events: [],
          tasks: [],
          commitments: [],
          freeBlocks: [],
          suggestions: [],
          conflicts: [],
          backToBackWarnings: [],
        },
    );
  }, [query.data, weekStart]);

  const day = useMemo(() => days.find((d) => d.date === date) ?? days[0], [days, date]);

  const suggestions = useMemo<ScheduleSuggestion[]>(() => {
    const now = (ctx.now ?? new Date()).getTime();
    return [...(query.data?.suggestions ?? [])]
      .filter((s) => Date.parse(s.proposedEndAt) > now)
      .sort((a, b) => Date.parse(a.proposedStartAt) - Date.parse(b.proposedStartAt));
  }, [query.data, ctx.now]);

  const conflicts = useMemo<CalendarConflict[]>(
    () => (query.data?.conflicts ?? []).filter((c) => c.status === 'open'),
    [query.data],
  );

  const shiftWeek = useCallback((delta: number) => {
    setDate((d) => {
      const next = new Date(`${d}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + delta * 7);
      return next.toISOString().slice(0, 10);
    });
  }, []);

  return {
    ...query,
    range,
    setRange,
    date,
    setDate,
    today,
    weekStart,
    days,
    day,
    suggestions,
    conflicts,
    shiftWeek,
  };
}
