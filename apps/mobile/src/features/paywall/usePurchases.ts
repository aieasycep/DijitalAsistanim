/**
 * Store interactions for the paywall on top of `services/purchases` (RevenueCat): offerings, purchase,
 * restore and the management page. Demo builds without a store key walk the same flow through
 * `ds.billing.recordDemoPurchase`; a Supabase build without a store key reports `unavailable` — no fake
 * purchase, no fake trial.
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/monitoring';
import {
  getProOfferings,
  isPurchasesAvailable,
  openManageSubscriptions,
  purchasePro,
  restorePro,
  type ProOfferings,
  type PurchaseOutcome,
  type RestoreResult,
} from '@/services/purchases';
import { productIdFor, type PlanKey } from './paywallCopy';

export const OFFERINGS_QUERY_KEY = ['purchases', 'offerings'] as const;
const OFFERINGS_STALE_MS = 5 * 60_000;

export type RestoreOutcome = RestoreResult['outcome'];

export function usePurchases() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const entitlement = useEntitlement();
  const refetchEntitlement = entitlement.refetch;
  const available = useMemo(() => isPurchasesAvailable(), []);
  const demo = ds.mode === 'demo';

  const offerings = useQuery<ProOfferings | null>({
    queryKey: OFFERINGS_QUERY_KEY,
    queryFn: () => getProOfferings(),
    enabled: available,
    staleTime: OFFERINGS_STALE_MS,
  });

  const refreshEntitlement = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: qk.entitlement });
    await refetchEntitlement();
  }, [queryClient, refetchEntitlement]);

  const purchase = useMutation<PurchaseOutcome, unknown, PlanKey>({
    mutationFn: async (plan) => {
      const productId = productIdFor(plan);
      if (available) {
        const pkg = offerings.data?.[plan] ?? null;
        if (!pkg) return 'unavailable';
        const result = await purchasePro(pkg);
        if (result.outcome !== 'purchased') return result.outcome;
        const appUserId = result.customerInfo?.originalAppUserId;
        if (appUserId) {
          try {
            await ds.billing.linkRevenueCatUser(appUserId);
          } catch (e) {
            captureError(e, { where: 'usePurchases.linkRevenueCatUser' });
          }
        }
        await refreshEntitlement();
        track('subscription_started', { productId });
        if (offerings.data?.hasIntroOffer) track('trial_started', { productId });
        return 'purchased';
      }
      if (demo && ds.billing.recordDemoPurchase) {
        await ds.billing.recordDemoPurchase({ productId });
        await refreshEntitlement();
        track('subscription_started', { productId });
        return 'purchased';
      }
      return 'unavailable';
    },
  });

  const restore = useMutation<RestoreOutcome, unknown, void>({
    mutationFn: async () => {
      if (available) {
        const result = await restorePro();
        if (result.outcome === 'restored') await refreshEntitlement();
        return result.outcome;
      }
      if (demo) {
        const fresh = await refetchEntitlement();
        return fresh.data?.isPro ? 'restored' : 'nothing';
      }
      return 'unavailable';
    },
  });

  const manage = useCallback(() => openManageSubscriptions(), []);

  return {
    available,
    demo,
    offerings: offerings.data ?? null,
    offeringsLoading: available && offerings.isPending,
    refetchOfferings: offerings.refetch,
    purchase,
    restore,
    manage,
  };
}
