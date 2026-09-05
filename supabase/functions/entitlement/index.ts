/** GET /entitlement — central entitlement snapshot (RevenueCat OR referral bonus OR demo/promo grant). */
import { FREE_QUOTAS, PRO_QUOTAS, type EntitlementState } from '@da/domain';
import { assertMethod, handler, json, requireUser } from '../_shared/mod.ts';

interface RpcResult {
  isPro: boolean;
  source: 'revenuecat' | 'promo' | 'demo' | 'referral' | 'none';
  expiresAt: string | null;
  isTrial: boolean;
  assistantQueriesToday: number;
  capturesToday: number;
  emailAccounts: number;
  calendarAccounts: number;
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { db } = await requireUser(req);
    const { data, error } = await db.rpc('my_entitlement');
    if (error) throw new Error(`entitlement rpc failed: ${error.message}`);
    const r = (data ?? {}) as Partial<RpcResult>;
    const isPro = Boolean(r.isPro);
    const state: EntitlementState = {
      plan: isPro ? 'pro' : 'free',
      isPro,
      source: r.source ?? 'none',
      expiresAt: r.expiresAt ?? null,
      isTrial: Boolean(r.isTrial),
      quotas: isPro ? { ...PRO_QUOTAS } : { ...FREE_QUOTAS },
      usage: {
        assistantQueriesToday: r.assistantQueriesToday ?? 0,
        capturesToday: r.capturesToday ?? 0,
        emailAccounts: r.emailAccounts ?? 0,
        calendarAccounts: r.calendarAccounts ?? 0,
      },
    };
    return json(state);
  }),
);
