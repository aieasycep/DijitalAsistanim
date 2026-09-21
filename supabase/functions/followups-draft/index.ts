/**
 * POST /followups-draft { followUpId } — "Nazikçe hatırlat": a short, warm follow-up draft for a thread the
 * user is still waiting on. Text only; sending requires the email_send approval like every other mail.
 */
import { z } from 'zod';
import type { FollowUp } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import { followUpBrief } from '@da/server-core/followups';
import { draftReplyForThread } from '../_shared/draft.ts';
import { loadUserContext } from '../_shared/context.ts';
import {
  adminClient,
  assertMethod,
  enforceRateLimit,
  handler,
  json,
  parseInput,
  requireUser,
  uuidParam,
} from '../_shared/mod.ts';
import { camelize } from '../_shared/rows.ts';

const schema = z.object({ followUpId: uuidParam });

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user, db } = await requireUser(req);
    const { followUpId } = await parseInput(req, schema);
    await enforceRateLimit('ai_call', user.id);
    const admin = adminClient();
    const { data } = await db
      .from('follow_ups')
      .select('*')
      .eq('id', followUpId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data) throw new AppError('not_found', 'Takip kaydı bulunamadı.');
    const followUp = camelize<FollowUp>(data);
    const ctx = await loadUserContext(admin, user.id);
    const now = new Date().toISOString();
    const brief = followUpBrief(followUp, { locale: ctx.locale, timezone: ctx.timezone, now });
    const instructions =
      ctx.locale === 'en'
        ? `Write a short, friendly follow-up nudge. Context: ${brief}. Do not apologise excessively; ask for a status update and offer help.`
        : `Kısa ve nazik bir hatırlatma yaz. Bağlam: ${brief}. Aşırı özür dileme; durumu sor ve yardımcı olmayı teklif et.`;
    const response = await draftReplyForThread(db, admin, {
      userId: user.id,
      threadId: followUp.threadId,
      tone: 'friendly',
      instructions,
    });
    return json(response);
  }),
);
