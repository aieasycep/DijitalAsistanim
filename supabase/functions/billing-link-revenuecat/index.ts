/** POST /billing-link-revenuecat { appUserId } — bind the RevenueCat app user id to this profile (webhooks map events by it). */
import { z } from 'zod';
import { AppError } from '@da/server-core/errors';
import { adminClient, assertMethod, audit, handler, json, parseInput, requireUser } from '../_shared/mod.ts';

const schema = z.object({ appUserId: z.string().min(3).max(200) });

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const { appUserId } = await parseInput(req, schema);
    const admin = adminClient();
    const { data: clash } = await admin.from('profiles').select('id').eq('revenuecat_app_user_id', appUserId).neq('id', user.id).maybeSingle();
    if (clash) throw new AppError('conflict', 'Bu mağaza hesabı başka bir kullanıcıya bağlı.');
    const { error } = await admin.from('profiles').update({ revenuecat_app_user_id: appUserId }).eq('id', user.id);
    if (error) throw new AppError('internal', `Bağlama başarısız: ${error.message}`);
    await admin.from('subscriptions').update({ revenuecat_app_user_id: appUserId }).eq('user_id', user.id).eq('source', 'revenuecat');
    await audit(admin, { userId: user.id, action: 'subscription.change', actor: 'user', targetType: 'revenuecat', targetId: appUserId, metadata: { linked: true } });
    return json({ ok: true as const });
  }),
);
