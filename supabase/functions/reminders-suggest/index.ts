/**
 * POST /reminders-suggest { targetType, targetId, dueAt? } — the 6 reminder options (30 dk önce, 1 saat önce,
 * bu akşam, yarın sabah, uygun zamanda, özel) computed from the target's time, the user's calendar (free slots)
 * and quiet hours. Pure computation in @da/server-core/reminders; no AI call.
 */
import type { SmartReminderSuggestResponse } from '@da/domain';
import { smartReminderSuggestSchema } from '@da/validation';
import { AppError } from '@da/server-core/errors';
import { computeReminderOptions, type ReminderTarget } from '@da/server-core/reminders';
import {
  adminClient,
  assertMethod,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';

type Db = ReturnType<typeof adminClient>;

async function loadTarget(
  db: Db,
  userId: string,
  type: string,
  id: string,
  dueAtOverride: string | null | undefined,
): Promise<ReminderTarget> {
  const one = async (table: string, columns: string) => {
    const { data } = await db
      .from(table)
      .select(columns)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) throw new AppError('not_found', 'Hatırlatıcı hedefi bulunamadı.');
    return data as unknown as Record<string, string | null>;
  };
  switch (type) {
    case 'calendar_event': {
      const r = await one('calendar_events', 'start_at');
      return { startAt: r.start_at ?? null, dueAt: null, isMeeting: true };
    }
    case 'email_thread': {
      const { data } = await db
        .from('email_threads')
        .select('analysis')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!data) throw new AppError('not_found', 'Hatırlatıcı hedefi bulunamadı.');
      const a = (data as { analysis: { deadline?: string | null } | null }).analysis;
      return { dueAt: dueAtOverride ?? a?.deadline ?? null, startAt: null, isMeeting: false };
    }
    case 'task': {
      const r = await one('tasks', 'due_at, scheduled_start_at');
      return {
        dueAt: dueAtOverride ?? r.due_at ?? null,
        startAt: r.scheduled_start_at ?? null,
        isMeeting: false,
      };
    }
    case 'commitment': {
      const r = await one('commitments', 'due_at');
      return { dueAt: dueAtOverride ?? r.due_at ?? null, startAt: null, isMeeting: false };
    }
    case 'life_event': {
      const r = await one('life_events', 'event_at');
      return { dueAt: dueAtOverride ?? r.event_at ?? null, startAt: null, isMeeting: false };
    }
    case 'insight': {
      const r = await one('insights', 'due_at');
      return { dueAt: dueAtOverride ?? r.due_at ?? null, startAt: null, isMeeting: false };
    }
    case 'follow_up': {
      const r = await one('follow_ups', 'sent_at, nudge_after_days, snoozed_until');
      const due =
        r.snoozed_until ??
        (r.sent_at
          ? new Date(
              Date.parse(r.sent_at) + Number(r.nudge_after_days ?? 3) * 86_400_000,
            ).toISOString()
          : null);
      return { dueAt: dueAtOverride ?? due, startAt: null, isMeeting: false };
    }
    default:
      return { dueAt: dueAtOverride ?? null, startAt: null, isMeeting: false };
  }
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, smartReminderSuggestSchema);
    const admin = adminClient();
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + 72 * 3600 * 1000).toISOString();

    const [target, { data: prefs }, { data: notif }, { data: events }] = await Promise.all([
      loadTarget(admin, user.id, input.targetType, input.targetId, input.dueAt),
      admin
        .from('user_preferences')
        .select('locale, timezone')
        .eq('user_id', user.id)
        .maybeSingle(),
      admin
        .from('notification_preferences')
        .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end, meeting_lead_minutes')
        .eq('user_id', user.id)
        .maybeSingle(),
      admin
        .from('calendar_events')
        .select('start_at, end_at')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .eq('all_day', false)
        .lte('start_at', horizonEnd)
        .gte('end_at', now.toISOString())
        .limit(200),
    ]);
    const p = prefs as { locale: 'tr' | 'en'; timezone: string } | null;
    const n = notif as {
      quiet_hours_enabled: boolean;
      quiet_hours_start: string;
      quiet_hours_end: string;
      meeting_lead_minutes: number;
    } | null;

    const response: SmartReminderSuggestResponse = computeReminderOptions({
      target,
      now: now.toISOString(),
      timezone: p?.timezone ?? 'Europe/Istanbul',
      locale: p?.locale ?? 'tr',
      busy: ((events ?? []) as { start_at: string; end_at: string }[]).map((e) => ({
        startAt: e.start_at,
        endAt: e.end_at,
      })),
      quietHours: n
        ? { enabled: n.quiet_hours_enabled, start: n.quiet_hours_start, end: n.quiet_hours_end }
        : null,
      meetingLeadMinutes: n?.meeting_lead_minutes ?? 25,
    });
    return json(response);
  }),
);
