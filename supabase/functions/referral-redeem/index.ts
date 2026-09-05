/**
 * POST /referral-redeem { code, deviceFingerprintHash? } — both sides receive 14 days of Pro.
 * Abuse rules live in @da/server-core/referral (self-referral, one per account, new accounts only,
 * device reuse, referrer cap); this function only loads the inputs and persists the outcome.
 */
import { referralRedeemSchema } from '@da/validation';
import { AppError } from '@da/server-core/errors';
import { normalizeReferralCode, validateRedemption } from '@da/server-core/referral';
import { adminClient, assertMethod, audit, enforceRateLimit, handler, json, parseInput, requireUser } from '../_shared/mod.ts';

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, referralRedeemSchema);
    await enforceRateLimit('referral_redeem', user.id);
    const admin = adminClient();
    const now = new Date().toISOString();
    const code = normalizeReferralCode(input.code);

    const [{ data: me }, { data: referrerRow }, { data: myRedemption }] = await Promise.all([
      admin.from('profiles').select('id, created_at, locale, referred_by_code').eq('id', user.id).single(),
      admin.from('profiles').select('id').eq('referral_code', code).maybeSingle(),
      admin.from('referrals').select('id').eq('referred_user_id', user.id).eq('status', 'redeemed').maybeSingle(),
    ]);
    const profile = me as { id: string; created_at: string; locale: 'tr' | 'en'; referred_by_code: string | null } | null;
    if (!profile) throw new AppError('not_found', 'Profil bulunamadı.');
    const referrerUserId = (referrerRow as { id: string } | null)?.id ?? null;

    let referrerRedemptionsLast30d = 0;
    let referrerDeviceHashes: string[] = [];
    let referrerCreditExpiresAt: string | null = null;
    if (referrerUserId) {
      const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
      const [{ count }, { data: devices }, { data: credit }] = await Promise.all([
        admin.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_user_id', referrerUserId).eq('status', 'redeemed').gte('redeemed_at', since),
        admin.from('referrals').select('device_fingerprint_hash').eq('referred_user_id', referrerUserId).not('device_fingerprint_hash', 'is', null),
        admin.from('referral_credits').select('expires_at').eq('user_id', referrerUserId).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      referrerRedemptionsLast30d = count ?? 0;
      referrerDeviceHashes = ((devices ?? []) as { device_fingerprint_hash: string }[]).map((d) => d.device_fingerprint_hash);
      referrerCreditExpiresAt = (credit as { expires_at: string } | null)?.expires_at ?? null;
    }

    const result = validateRedemption({
      code,
      redeemerUserId: user.id,
      redeemerCreatedAt: profile.created_at,
      redeemerAlreadyRedeemed: Boolean(myRedemption) || Boolean(profile.referred_by_code),
      referrerUserId,
      referrerRedemptionsLast30d,
      deviceFingerprintHash: input.deviceFingerprintHash ?? null,
      referrerDeviceHashes,
      referrerCreditExpiresAt,
      now,
      locale: profile.locale ?? 'tr',
    });

    if (!result.ok) {
      if (referrerUserId && result.reason !== 'invalid') {
        await admin.from('referrals').insert({
          referrer_user_id: referrerUserId,
          referred_user_id: user.id,
          code,
          status: 'rejected',
          rejection_reason: result.reason,
          device_fingerprint_hash: input.deviceFingerprintHash ?? null,
        });
      }
      return json({ ok: false as const, reason: result.reason, message: result.message });
    }

    const { data: referral, error } = await admin
      .from('referrals')
      .insert({
        referrer_user_id: result.referrerUserId,
        referred_user_id: user.id,
        code,
        status: 'redeemed',
        redeemed_at: now,
        device_fingerprint_hash: input.deviceFingerprintHash ?? null,
      })
      .select('id')
      .single();
    if (error || !referral) {
      if (error?.code === '23505') return json({ ok: false as const, reason: 'already_redeemed' });
      throw new AppError('internal', `Davet kaydedilemedi: ${error?.message ?? ''}`);
    }
    const referralId = (referral as { id: string }).id;
    const { error: creditErr } = await admin.from('referral_credits').insert(
      result.credits.map((c) => ({ user_id: c.userId, referral_id: referralId, days: c.days, starts_at: c.startsAt, expires_at: c.expiresAt, role: c.role })),
    );
    if (creditErr) throw new AppError('internal', `Bonus tanımlanamadı: ${creditErr.message}`);
    await admin.from('profiles').update({ referred_by_code: code }).eq('id', user.id);

    const bonusDays = result.credits.find((c) => c.role === 'referred')?.days ?? 0;
    await Promise.all([
      audit(admin, { userId: user.id, action: 'referral.redeem', actor: 'user', targetType: 'referral', targetId: referralId, metadata: { role: 'referred', days: bonusDays } }),
      audit(admin, { userId: result.referrerUserId, action: 'referral.redeem', actor: 'system', targetType: 'referral', targetId: referralId, metadata: { role: 'referrer', days: bonusDays } }),
    ]);
    return json({ ok: true as const, bonusDays });
  }),
);
