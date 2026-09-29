import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { captureError } from '@/lib/monitoring';
import { clearLocalSession, detachDeviceFromAccount } from '@/lib/sessionHygiene';

export interface UseSignOutResult {
  /** Resolves `true` once the session is gone; the root layout then redirects to the welcome screen. */
  signOut: () => Promise<boolean>;
  busy: boolean;
}

/**
 * Sign-out in order: detach this device's push token (needs a valid session), end the session, then the
 * shared local hygiene (`clearLocalSession`) — the same steps account deletion and a vanished session run.
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
      await detachDeviceFromAccount(ds);
      await ds.auth.signOut();
      await clearLocalSession(ds, qc);
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
