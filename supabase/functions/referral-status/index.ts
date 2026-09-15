/** GET /referral-status — the user's invite code, link and redemption stats. */
import type { ReferralStatusResponse } from '@da/domain';
import { assertMethod, getEnv, handler, json, requireUser } from '../_shared/mod.ts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const [{ data: profile }, { data: referrals }, { data: credits }] = await Promise.all([
      db.from('profiles').select('referral_code').eq('id', user.id).single(),
      db.from('referrals').select('status').eq('referrer_user_id', user.id),
      db
        .from('referral_credits')
        .select('days, expires_at')
        .eq('user_id', user.id)
        .order('expires_at', { ascending: false }),
    ]);
    const code = (profile as { referral_code: string } | null)?.referral_code ?? '';
    const list = (referrals ?? []) as { status: string }[];
    const creditRows = (credits ?? []) as { days: number; expires_at: string }[];
    const now = Date.now();
    const active = creditRows.find((c) => Date.parse(c.expires_at) > now);
    const response: ReferralStatusResponse = {
      code,
      inviteUrl: `${getEnv().webUrl.replace(/\/$/, '')}/app/referral?code=${encodeURIComponent(code)}`,
      invitedCount: list.length,
      redeemedCount: list.filter((r) => r.status === 'redeemed').length,
      bonusDaysEarned: creditRows.reduce((sum, c) => sum + c.days, 0),
      activeBonusUntil: active?.expires_at ?? null,
    };
    return json(response);
  }),
);
