import type { FirstAnalysisProgress, Insight } from '@da/domain';
import { initialAnalysisStartSchema } from '@da/validation';
import type { OnboardingApi } from '../../datasource';
import type { DemoContext } from '../context';
import { selectPriorities, todayInsights } from '../core/insights';
import { BRIEFING_MORNING } from '../ids';
import { schedule } from '../latency';
import { validate } from '../validate';

/** Findings grow step by step: 127 mail · 8 potansiyel önemli · 4 etkinlik · 2 takip. */
const STEPS: Array<Partial<FirstAnalysisProgress> & { step: FirstAnalysisProgress['step'] }> = [
  { step: 'scanning', emailsFound: 48 },
  { step: 'classifying', emailsFound: 127, potentialImportant: 3 },
  { step: 'calendar', potentialImportant: 8, upcomingEvents: 4 },
  { step: 'open_loops', possibleFollowUps: 2 },
  { step: 'done' },
];

export function createOnboardingApi(ctx: DemoContext): OnboardingApi {
  let cancelTimers: Array<() => void> = [];

  const finalize = (): void => {
    ctx.store.mutate((s) => {
      if (!s.analysis || s.analysis.step === 'done' || s.analysis.step === 'failed') return;
      const now = ctx.nowIso();
      s.analysis = {
        ...s.analysis,
        step: 'done',
        emailsFound: 127,
        potentialImportant: 8,
        upcomingEvents: 4,
        possibleFollowUps: 2,
        completedAt: now,
      };
      s.profile.firstAnalysisCompletedAt = s.profile.firstAnalysisCompletedAt ?? now;
      s.stats.lastAnalyzedAt = now;
    });
  };

  const applyStep = (index: number): void => {
    ctx.store.mutate((s) => {
      const step = STEPS[index];
      if (!s.analysis || !step) return;
      if (s.analysis.step === 'done' || s.analysis.step === 'failed') return;
      s.analysis = { ...s.analysis, ...step };
      if (step.step === 'done') {
        const now = ctx.nowIso();
        s.analysis.completedAt = now;
        s.profile.firstAnalysisCompletedAt = s.profile.firstAnalysisCompletedAt ?? now;
        s.stats.lastAnalyzedAt = now;
      }
    });
  };

  const resultInsights = (): Insight[] =>
    selectPriorities(todayInsights(ctx.store.state, ctx.clock), ctx.clock, 5);

  const currentStatus = (): FirstAnalysisProgress & {
    insights: Insight[];
    briefingId?: string | null;
  } => {
    const s = ctx.store.state;
    if (!s.analysis) {
      const completedAt = s.profile.firstAnalysisCompletedAt;
      const done: FirstAnalysisProgress = {
        step: completedAt ? 'done' : 'scanning',
        emailsFound: completedAt ? 127 : 0,
        potentialImportant: completedAt ? 8 : 0,
        upcomingEvents: completedAt ? 4 : 0,
        possibleFollowUps: completedAt ? 2 : 0,
        startedAt: completedAt ?? ctx.nowIso(),
        completedAt: completedAt ?? null,
        windowHours: 72,
        error: null,
      };
      return {
        ...done,
        insights: completedAt ? resultInsights() : [],
        briefingId: completedAt ? BRIEFING_MORNING : null,
      };
    }
    // A snapshot hydrated mid-analysis has no timers left: settle it once its expected duration elapsed.
    const elapsed = Date.parse(ctx.nowIso()) - Date.parse(s.analysis.startedAt);
    if (
      s.analysis.step !== 'done' &&
      s.analysis.step !== 'failed' &&
      elapsed > STEPS.length * ctx.timings.analysisStepMs + 1000
    )
      finalize();
    const progress = ctx.store.state.analysis ?? s.analysis;
    const done = progress.step === 'done';
    return {
      ...progress,
      insights: done ? resultInsights() : [],
      briefingId: done ? BRIEFING_MORNING : null,
    };
  };

  return {
    startInitialAnalysis: (input) =>
      ctx.run(() => {
        const clean = validate(initialAnalysisStartSchema, input ?? {});
        for (const cancel of cancelTimers) cancel();
        cancelTimers = [];
        const progress: FirstAnalysisProgress = {
          step: 'scanning',
          emailsFound: 0,
          potentialImportant: 0,
          upcomingEvents: 0,
          possibleFollowUps: 0,
          startedAt: ctx.nowIso(),
          completedAt: null,
          windowHours: clean.windowHours ?? 72,
          error: null,
        };
        ctx.store.mutate((s) => {
          s.analysis = progress;
        });
        STEPS.forEach((_, index) => {
          cancelTimers.push(
            schedule(ctx.timings.analysisStepMs * (index + 1), () => applyStep(index)),
          );
        });
        return { ...progress };
      }),
    getInitialAnalysisStatus: () => ctx.run(currentStatus),
  };
}
