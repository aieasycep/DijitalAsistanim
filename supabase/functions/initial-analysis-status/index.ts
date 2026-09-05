/** GET /initial-analysis-status — onboarding progress + the first insights once available. */
import { assertMethod, handler, json, requireUser } from '../_shared/mod.ts';
import { camelize } from '../_shared/rows.ts';
import type { FirstAnalysisProgress, Insight } from '@da/domain';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const { data: run } = await db.from('first_analysis_runs').select('*').eq('user_id', user.id).maybeSingle();
    const progress: FirstAnalysisProgress = run
      ? {
          step: (run as { step: FirstAnalysisProgress['step'] }).step,
          emailsFound: (run as { emails_found: number }).emails_found,
          potentialImportant: (run as { potential_important: number }).potential_important,
          upcomingEvents: (run as { upcoming_events: number }).upcoming_events,
          possibleFollowUps: (run as { possible_follow_ups: number }).possible_follow_ups,
          startedAt: (run as { started_at: string }).started_at,
          completedAt: (run as { completed_at: string | null }).completed_at,
          windowHours: (run as { window_hours: number }).window_hours,
          error: (run as { error: string | null }).error,
        }
      : { step: 'scanning', emailsFound: 0, potentialImportant: 0, upcomingEvents: 0, possibleFollowUps: 0, startedAt: new Date().toISOString(), completedAt: null, windowHours: 72, error: null };

    let insights: Insight[] = [];
    let briefingId: string | null = (run as { briefing_id?: string | null } | null)?.briefing_id ?? null;
    if (progress.step === 'done') {
      const { data } = await db.from('insights').select('*').eq('user_id', user.id).eq('status', 'active').is('deleted_at', null).order('priority_score', { ascending: false }).limit(5);
      insights = camelize<Insight[]>(data ?? []);
      if (!briefingId) {
        const { data: b } = await db.from('briefings').select('id').eq('user_id', user.id).eq('kind', 'morning').order('generated_at', { ascending: false }).limit(1).maybeSingle();
        briefingId = (b as { id: string } | null)?.id ?? null;
      }
    }
    return json({ ...progress, insights, briefingId });
  }),
);
