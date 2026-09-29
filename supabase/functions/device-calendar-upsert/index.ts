/**
 * POST /device-calendar-upsert { accountId, events[] } — events read on device (EventKit / Android provider).
 * Server-side we normalize, upsert, and flag the account so the next pipeline run rebuilds insights.
 */
import { z } from 'zod';
import { AppError } from '@da/server-core/errors';
import { transition } from '@da/server-core/approvals';
import {
  adminClient,
  assertMethod,
  audit,
  handler,
  json,
  parseInput,
  requireUser,
  uuidParam,
} from '../_shared/mod.ts';
import { loadApproval, persistApproval } from '../_shared/approvals.ts';
import { isoDateTimeSchema } from '@da/validation';

const attendeeSchema = z.object({
  name: z.string().max(200).nullish(),
  email: z.string().max(320).nullish(),
  contactId: z.string().nullish(),
  isOrganizer: z.boolean().default(false),
  responseStatus: z.enum(['accepted', 'declined', 'tentative', 'needsAction']).nullish(),
});

const eventSchema = z.object({
  externalEventId: z.string().min(1).max(500),
  calendarId: z.string().min(1).max(300).default('primary'),
  title: z.string().max(500).default(''),
  description: z.string().max(8000).nullish(),
  location: z.string().max(500).nullish(),
  meetingUrl: z.string().max(1000).nullish(),
  meetingProvider: z.enum(['google_meet', 'teams', 'zoom', 'other']).nullish(),
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  allDay: z.boolean().default(false),
  attendees: z.array(attendeeSchema).max(200).default([]),
  organizerIsUser: z.boolean().default(false),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).default('confirmed'),
  providerUpdatedAt: isoDateTimeSchema.nullish(),
  source: z.enum(['apple_calendar', 'device_calendar']),
});

/** Outcome of a device-executed approval (calendar_create/update on EventKit / the Android provider). */
const approvalResultSchema = z.object({
  approvalId: uuidParam,
  outcome: z.enum(['executed', 'failed']),
  externalEventId: z.string().max(500).optional(),
  failureReason: z.string().max(80).optional(),
});

const schema = z.object({
  accountId: uuidParam,
  events: z.array(eventSchema).max(2000),
  removedExternalIds: z.array(z.string()).max(2000).optional(),
  approvalResult: approvalResultSchema.optional(),
});

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, schema);
    const admin = adminClient();

    const { data: account } = await admin
      .from('connected_accounts')
      .select('id, provider')
      .eq('id', input.accountId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    const acc = account as { id: string; provider: string } | null;
    if (!acc) throw new AppError('not_found', 'Hesap bulunamadı.');
    if (acc.provider !== 'apple' && acc.provider !== 'device')
      throw new AppError('validation', 'Bu uç nokta yalnızca cihaz takvimleri içindir.');

    const rows = input.events.map((e) => ({
      user_id: user.id,
      account_id: input.accountId,
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
      deleted_at: null,
    }));

    let upserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await admin
        .from('calendar_events')
        .upsert(chunk, { onConflict: 'account_id,external_event_id' });
      if (error) throw new AppError('internal', `Etkinlikler kaydedilemedi: ${error.message}`);
      upserted += chunk.length;
    }
    if (input.removedExternalIds?.length) {
      await admin
        .from('calendar_events')
        .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
        .eq('account_id', input.accountId)
        .in('external_event_id', input.removedExternalIds);
    }
    await admin
      .from('connected_accounts')
      .update({ last_sync_at: new Date().toISOString(), status: 'active', last_error: null })
      .eq('id', input.accountId);
    await admin.from('sync_states').upsert(
      {
        user_id: user.id,
        account_id: input.accountId,
        resource: 'calendar',
        mode: 'polling',
        last_success_at: new Date().toISOString(),
        last_run_at: null,
      },
      { onConflict: 'account_id,resource' },
    );

    if (input.approvalResult) {
      const r = input.approvalResult;
      const approval = await loadApproval(admin, user.id, r.approvalId);
      const handler = (approval.executionResult as { handler?: string } | null)?.handler;
      if (approval.status === 'executing' && handler === 'device') {
        const now = new Date().toISOString();
        if (r.outcome === 'executed') {
          const executed = transition(approval, 'executed', {
            now,
            executionResult: { handler: 'device', externalEventId: r.externalEventId ?? null },
          });
          await persistApproval(admin, executed);
          if (r.externalEventId) {
            await admin
              .from('calendar_events')
              .update({ is_ai_created: true })
              .eq('account_id', input.accountId)
              .eq('external_event_id', r.externalEventId);
          }
          if (approval.insightId)
            await admin
              .from('insights')
              .update({ status: 'completed', completed_at: now })
              .eq('id', approval.insightId)
              .eq('user_id', user.id);
          await audit(admin, {
            userId: user.id,
            action: 'approval.execute',
            actor: 'user',
            targetType: 'approval_action',
            targetId: approval.id,
            metadata: { type: approval.type, kind: 'device' },
          });
          await audit(admin, {
            userId: user.id,
            action: 'calendar.write',
            actor: 'user',
            targetType: 'calendar_event',
            metadata: {
              provider: acc.provider,
              op: approval.type === 'calendar_update' ? 'update' : 'create',
            },
          });
        } else {
          const failed = transition(approval, 'failed', {
            now,
            failureReason: r.failureReason ?? 'device_write_failed',
          });
          await persistApproval(admin, failed);
          await audit(admin, {
            userId: user.id,
            action: 'approval.fail',
            actor: 'user',
            targetType: 'approval_action',
            targetId: approval.id,
            metadata: {
              type: approval.type,
              kind: 'device',
              reason: failed.failureReason ?? 'unknown',
            },
          });
        }
      }
    }
    return json({ upserted });
  }),
);
