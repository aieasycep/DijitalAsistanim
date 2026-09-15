import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { qk } from '@da/api-client';
import { FEATURE_PLAN, FREE_QUOTAS, type EntitlementState, type Feature } from '@da/domain';
import { useSessionStore } from '@/store/session';
import { track } from '@/lib/analytics';
import { useDataSource } from './useDataSource';

const FALLBACK: EntitlementState = {
  plan: 'free',
  isPro: false,
  source: 'none',
  isTrial: false,
  quotas: FREE_QUOTAS,
  usage: { assistantQueriesToday: 0, capturesToday: 0, emailAccounts: 0, calendarAccounts: 0 },
};

/**
 * Central entitlement hook. Screens never decide subscription logic themselves:
 * `gate(feature, context)` returns true when allowed, otherwise opens the contextual paywall.
 */
export function useEntitlement() {
  const ds = useDataSource();
  const router = useRouter();
  const setEntitlement = useSessionStore((s) => s.setEntitlement);
  const status = useSessionStore((s) => s.status);
  const query = useQuery({
    queryKey: qk.entitlement,
    queryFn: async () => {
      const e = await ds.billing.getEntitlement();
      setEntitlement(e);
      return e;
    },
    enabled: status === 'signedIn',
    staleTime: 5 * 60_000,
  });
  const entitlement = query.data ?? useSessionStore.getState().entitlement ?? FALLBACK;

  const hasFeature = useCallback(
    (feature: Feature): boolean => FEATURE_PLAN[feature] === 'free' || entitlement.isPro,
    [entitlement.isPro],
  );

  const gate = useCallback(
    (feature: Feature, context: string): boolean => {
      if (hasFeature(feature)) return true;
      track('paywall_viewed', { context });
      router.push({ pathname: '/paywall', params: { context } });
      return false;
    },
    [hasFeature, router],
  );

  return {
    entitlement,
    isPro: entitlement.isPro,
    hasFeature,
    gate,
    refetch: query.refetch,
    isLoading: query.isLoading,
  };
}
