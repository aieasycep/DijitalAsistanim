import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { resetAnalytics } from '@/lib/analytics';
import { describeError } from '@/lib/errors';
import { captureError } from '@/lib/monitoring';
import { wipeLocalData } from '@/lib/storage';
import {
  cacheNotificationPreferences,
  cancelAllLocalNotifications,
  unregisterPushToken,
} from '@/services/notifications';
import { resetPurchasesUser } from '@/services/purchases';
import { useSessionStore } from '@/store/session';

export interface UseSignOutResult {
  /** Resolves `true` once the session is gone; the root layout then redirects to the welcome screen. */
  signOut: () => Promise<boolean>;
  busy: boolean;
}

/**
 * Sign-out hygiene in order: detach this device's push token (needs a valid session), drop scheduled
 * local notifications and the store identity, end the session, clear DataSource + local caches,
 * then reset analytics and the in-memory session store.
 */
export function useSignOut(): UseSignOutResult {
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const signOut = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      await unregisterPushToken(ds);
      await cancelAllLocalNotifications();
      await resetPurchasesUser();
      await ds.auth.signOut();
      await ds.clearLocalState();
      cacheNotificationPreferences(null);
      await wipeLocalData();
      qc.clear();
      resetAnalytics();
      useSessionStore.getState().reset();
      return true;
    } catch (e) {
      captureError(e, { where: 'signOut' });
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' });
      return false;
    } finally {
      setBusy(false);
    }
  }, [ds, qc, t, toast]);

  return { signOut, busy };
}
