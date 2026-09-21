/**
 * Referral data + sharing: status query, redeem mutation (refreshes the entitlement on success) and the
 * three share paths — clipboard, WhatsApp hand-off, system share sheet.
 */
import { useCallback } from 'react';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { ReferralStatusResponse } from '@da/domain';
import { clearPendingReferral } from '@/hooks/useDeepLinks';
import { useDataSource } from '@/hooks/useDataSource';
import { useEntitlement } from '@/hooks/useEntitlement';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/monitoring';
import { openHandoff } from '@/services/handoff';
import { normalizeReferralCode, type RedeemResponse } from './referralCopy';

export function useReferral() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { refetch: refetchEntitlement } = useEntitlement();

  const status = useQuery({
    queryKey: qk.referral,
    queryFn: () => ds.billing.getReferralStatus(),
  });

  const redeem = useMutation<RedeemResponse, unknown, string>({
    mutationFn: (code) => ds.billing.redeemReferral({ code: normalizeReferralCode(code) }),
    onSuccess: async (response) => {
      if (!response.ok) return;
      clearPendingReferral();
      await queryClient.invalidateQueries({ queryKey: qk.referral });
      await queryClient.invalidateQueries({ queryKey: qk.entitlement });
      await refetchEntitlement();
    },
  });

  const inviteMessage = useCallback(
    (s: ReferralStatusResponse) => t('referral.message', { code: s.code, url: s.inviteUrl }),
    [t],
  );

  const copyLink = useCallback(async (s: ReferralStatusResponse): Promise<boolean> => {
    try {
      await Clipboard.setStringAsync(s.inviteUrl);
      track('referral_shared', { channel: 'copy' });
      return true;
    } catch (e) {
      captureError(e, { where: 'useReferral.copyLink' });
      return false;
    }
  }, []);

  const shareWhatsApp = useCallback(
    async (s: ReferralStatusResponse): Promise<boolean> => {
      const result = await openHandoff({ kind: 'whatsapp', text: inviteMessage(s) });
      if (result.ok) track('referral_shared', { channel: 'whatsapp' });
      return result.ok;
    },
    [inviteMessage],
  );

  const shareSystem = useCallback(
    async (s: ReferralStatusResponse): Promise<boolean> => {
      try {
        const result = await Share.share(
          { message: inviteMessage(s), title: t('referral.title') },
          { dialogTitle: t('referral.title'), subject: t('referral.title') },
        );
        if (result.action === Share.sharedAction) track('referral_shared', { channel: 'system' });
        return true;
      } catch (e) {
        captureError(e, { where: 'useReferral.shareSystem' });
        return false;
      }
    },
    [inviteMessage, t],
  );

  return { status, redeem, copyLink, shareWhatsApp, shareSystem };
}
