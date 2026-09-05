/**
 * POST /initial-analysis-start { windowHours? } — starts the first 72-hour analysis after the user connected
 * at least one source. The heavy work runs in cron-dispatch (backfill job) so this returns immediately; the
 * app polls initial-analysis-status. Idempotent: a run already in progress is returned as-is.
 */
import type { InitialAnalysisStatusResponse } from '@da/domain';
import { initialAnalysisStartSchema } from '@da/validation';
import { AppError } from '@da/server-core/errors';
import { kickJob } from '../_shared/internal.ts';
import {
  adminClient,
  assertMethod,
  audit,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';

const STALE_MS = 20 * 60_000;

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, initialAnalysisStartSchema);
    const admin = adminClient();
    const now = new Date().toISOString();

    const { count } = await admin
      .from('connected_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null);
    if (!count) throw new AppError('validation', 'Analiz için önce bir hesap bağlamalısın.');

    const { data: existing } = await admin
      .from('first_analysis_runs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    const run = existing as {
      step: string;
      started_at: string;
      completed_at: string | null;
    } | null;
    const inProgress =
      run &&
      run.step !== 'done' &&
      run.step !== 'failed' &&
      Date.now() - Date.parse(run.started_at) < STALE_MS;
    if (!inProgress) {
      const { error } = await admin
        .from('first_analysis_runs')
        .upsert(
          {
            user_id: user.id,
            step: 'scanning',
            emails_found: 0,
            potential_important: 0,
            upcoming_events: 0,
            possible_follow_ups: 0,
            window_hours: input.windowHours ?? 72,
            started_at: now,
            completed_at: null,
            error: null,
            briefing_id: null,
          },
          { onConflict: 'user_id' },
        );
      if (error) throw new AppError('internal', `Analiz başlatılamadı: ${error.message}`);
      await audit(admin, {
        userId: user.id,
        action: 'sync.run',
        actor: 'user',
        targetType: 'first_analysis',
        metadata: { windowHours: input.windowHours ?? 72 },
      });
      kickJob('backfill', { userId: user.id });
    }
    const { data: fresh } = await admin
      .from('first_analysis_runs')
      .select('*')
      .eq('user_id', user.id)
      .single();
    const r = fresh as {
      step: InitialAnalysisStatusResponse['step'];
      emails_found: number;
      potential_important: number;
      upcoming_events: number;
      possible_follow_ups: number;
      started_at: string;
      completed_at: string | null;
      window_hours: number;
      error: string | null;
      briefing_id: string | null;
    };
    const response: InitialAnalysisStatusResponse = {
      step: r.step,
      emailsFound: r.emails_found,
      potentialImportant: r.potential_important,
      upcomingEvents: r.upcoming_events,
      possibleFollowUps: r.possible_follow_ups,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      windowHours: r.window_hours,
      error: r.error,
      insights: [],
      briefingId: r.briefing_id,
    };
    return json(response);
  }),
);
