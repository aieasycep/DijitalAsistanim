import type { EntitlementState, ReferralStatusResponse } from '@da/domain';
import { PRO_QUOTAS, PRODUCT_IDS, REFERRAL_BONUS_DAYS } from '@da/domain';
import { referralRedeemSchema } from '@da/validation';
import type { BillingApi } from '../../datasource';
import type { DemoContext } from '../context';
import { appendAudit } from '../core/audit';
import { buildDemoSubscription, REFERRAL_CODE } from '../fixtures/profile';
import type { DemoState } from '../state';
import { ClientApiError } from '../../errors';
import { validate } from '../validate';

const VALID_INVITE_CODES = ['DEMO2026'];

function usageFor(ctx: DemoContext, s: DemoState): EntitlementState['usage'] {
  const today = ctx.clock.today();
  const live = s.accounts.filter((a) => !a.deletedAt);
  return {
    assistantQueriesToday: s.usage.date === today ? s.usage.assistantQueries : 0,
    capturesToday: s.usage.date === today ? s.usage.captures : 0,
    emailAccounts: live.filter((a) => a.kinds.includes('email')).length,
    calendarAccounts: live.filter((a) => a.kinds.includes('calendar')).length,
  };
}

function entitlementFor(ctx: DemoContext, s: DemoState): EntitlementState {
  const active = s.subscriptions.find(
    (sub) => sub.status === 'active' || sub.status === 'trial' || sub.status === 'referral_bonus',
  );
  const bonusActive = s.referral.bonusUntil && s.referral.bonusUntil > ctx.nowIso();
  const isPro = Boolean(active) || Boolean(bonusActive);
  return {
    plan: isPro ? 'pro' : 'free',
    isPro,
    source: active ? active.source : bonusActive ? 'referral' : 'none',
    expiresAt: active?.expiresAt ?? s.referral.bonusUntil ?? null,
    isTrial: active?.isTrial ?? false,
    quotas: isPro
      ? { ...PRO_QUOTAS }
      : {
          maxEmailAccounts: 1,
          maxCalendarAccounts: 1,
          assistantQueriesPerDay: 10,
          capturesPerDay: 5,
        },
    usage: usageFor(ctx, s),
  };
}

export function createBillingApi(ctx: DemoContext): BillingApi {
  return {
    getEntitlement: () => ctx.run(() => entitlementFor(ctx, ctx.store.state)),
    recordDemoPurchase: (input) =>
      ctx.run(() => {
        const productId = input.productId;
        if (productId !== PRODUCT_IDS.monthly && productId !== PRODUCT_IDS.annual)
          throw new ClientApiError({ code: 'validation', message: 'Bilinmeyen ürün.' });
        const now = ctx.nowIso();
        const days = productId === PRODUCT_IDS.annual ? 365 : 30;
        const expiresAt = ctx.clock.addMinutes(ctx.clock.now(), days * 24 * 60);
        return ctx.store.mutate((s) => {
          const existing = s.subscriptions.find((sub) => sub.source === 'demo');
          if (existing) {
            existing.status = 'active';
            existing.plan = 'pro';
            existing.productId = productId;
            existing.startsAt = now;
            existing.expiresAt = expiresAt;
            existing.willRenew = true;
            existing.updatedAt = now;
          } else {
            s.subscriptions.unshift(
              buildDemoSubscription({ userId: ctx.userId, productId, now, expiresAt }),
            );
          }
          s.profile.plan = 'pro';
          s.profile.updatedAt = now;
          appendAudit(ctx, s, 'subscription.change', {
            targetType: 'subscription',
            targetId: s.subscriptions[0]?.id ?? null,
            metadata: { op: 'demo_purchase', productId },
          });
          return entitlementFor(ctx, s);
        });
      }),
    listSubscriptions: () =>
      ctx.run(() => ctx.store.state.subscriptions.map((sub) => ({ ...sub }))),
    linkRevenueCatUser: (appUserId) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          s.revenueCatAppUserId = appUserId;
          for (const sub of s.subscriptions) sub.revenuecatAppUserId = appUserId;
          appendAudit(ctx, s, 'subscription.change', {
            targetType: 'subscription',
            targetId: s.subscriptions[0]?.id ?? null,
            metadata: { op: 'link_revenuecat' },
          });
        });
      }),
    getReferralStatus: () =>
      ctx.run((): ReferralStatusResponse => {
        const s = ctx.store.state;
        return {
          code: s.profile.referralCode,
          inviteUrl: `${ctx.webUrl}/app/referral?code=${encodeURIComponent(s.profile.referralCode)}`,
          invitedCount: s.referral.invitedCount,
          redeemedCount: s.referral.redeemedCount,
          bonusDaysEarned: s.referral.bonusDaysEarned,
          activeBonusUntil: s.referral.bonusUntil,
        };
      }),
    redeemReferral: (input) =>
      ctx.run(() => {
        const parsed = referralRedeemSchema.safeParse(input);
        const code = parsed.success ? parsed.data.code : input.code.trim().toUpperCase();
        const s = ctx.store.state;
        if (code === s.profile.referralCode || code === REFERRAL_CODE)
          return { ok: false, reason: 'self_referral' };
        if (s.referral.redeemedCode) return { ok: false, reason: 'already_redeemed' };
        if (!parsed.success || !VALID_INVITE_CODES.includes(code))
          return { ok: false, reason: 'invalid' };
        validate(referralRedeemSchema, input);
        ctx.store.mutate((st) => {
          const now = ctx.nowIso();
          st.referral.redeemedCode = code;
          st.referral.redeemedAt = now;
          st.referral.bonusUntil = ctx.clock.addMinutes(
            ctx.clock.now(),
            REFERRAL_BONUS_DAYS * 24 * 60,
          );
          st.profile.referredByCode = code;
          st.profile.updatedAt = now;
          appendAudit(ctx, st, 'referral.redeem', {
            targetType: 'referral',
            targetId: code,
            metadata: { bonusDays: REFERRAL_BONUS_DAYS },
          });
        });
        return { ok: true, bonusDays: REFERRAL_BONUS_DAYS };
      }),
  };
}
